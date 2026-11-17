// src/scripts/update-data.mjs
//
// Pre-computes the monthly numbers behind each dashboard chart and saves them
// as small JSON files in public/data/. The charts load those files instead of
// querying the open data servers, so visitors never wait on a slow query.
//
// Run from the repo root:   npm run update-data
// Optional:                 set SOCRATA_APP_TOKEN to avoid API throttling.
//
// If a query fails, that chart's existing file is left untouched and the
// script exits with an error after trying the others.

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'data');
const APP_TOKEN = process.env.SOCRATA_APP_TOKEN || '';
const ATTEMPTS = 3;
const TIMEOUT_MS = 120_000;

// West Side Highway (Route 9A) segments south of 60th St. This road borders the
// Congestion Relief Zone but is exempt from the toll, so the chart is labelled
// as the West Side Highway corridor, not as speeds inside the zone.
// Found with src/scripts/findCrzLinkIds.ts.
const CRZ_LINK_IDS = [
  // West St
  '4616335', // West St N Whitehall - Watts St
  '4616343', // West St S Battery Pl - BKN Bridge Manhattan Side
  '4616327', // West St S Battery Pl - FDR N Catherine Slip
  '4616326', // West St S Spring St - Battery Pl
  '4456494', // West St S Spring St - BBT Manhattan Portal outbound
  '4616336', // West St Watts St - 11th Ave Ganesvoort
  // 11th Ave
  '4616337', // 11th Ave N Ganesvoort - 12th Ave @ 40th St
  '4616325', // 11th Ave S Ganesvoort - West St @ Spring St
  // 12th Ave
  '4616323', // 12th Ave S 57th St - 45th St
  '4616324', // 12th Ave @ 45th - 11th Ave Ganesvoort
  '4616338', // 12th Ave N 40th - 57th St
];

/** SoQL expression that turns a date column into a 'YYYY-MM' string. */
function monthExpr(col) {
  return (
    `date_extract_y(${col}) || '-' || ` +
    `case when date_extract_m(${col}) < 10 then '0' else '' end || ` +
    `date_extract_m(${col})`
  );
}

async function getJson(base, params) {
  const res = await fetch(`${base}?${new URLSearchParams(params)}`, {
    headers: APP_TOKEN ? { 'X-App-Token': APP_TOKEN } : {},
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ============================================================
// CONGESTION RELIEF ZONE BOUNDARY
// ============================================================

// The MTA's official outline of the zone: Manhattan at and below 60th St,
// excluding the FDR Drive and the West Side Highway / Route 9A.
// It is published as several polygons; a point is in the zone if it is
// inside any of them.
const GEOFENCE_URL = 'https://data.ny.gov/resource/srxy-5nxn.json';

async function fetchZoneRings() {
  const rows = await getJson(GEOFENCE_URL, { $limit: '100' });
  const rings = rows
    .filter((r) => r.polygon?.type === 'Polygon')
    .map((r) => r.polygon.coordinates[0]);
  if (rings.length === 0) throw new Error('zone boundary dataset returned no polygons');
  return rings;
}

/** Ray-casting test: is the point [lon, lat] inside the ring? */
function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// ============================================================
// BUS SPEEDS INSIDE THE ZONE
// ============================================================

const BUS_URL = 'https://data.ny.gov/resource/kufs-yh3x.json';

/**
 * Monthly average bus speed over the route segments that lie inside the zone.
 * A segment runs from one timepoint stop to the next; it counts as inside
 * when both of its stops are inside the official boundary.
 *
 * The server narrows the data to a box around the zone and returns one
 * subtotal per segment per month; the exact boundary test happens here.
 */
async function fetchBusSpeedsInZone() {
  const rings = await fetchZoneRings();
  const inZone = (lon, lat) => rings.some((ring) => pointInRing(lon, lat, ring));

  const lons = rings.flat().map((p) => p[0]);
  const lats = rings.flat().map((p) => p[1]);
  const box = `between ${Math.min(...lats)} and ${Math.max(...lats)}`;
  const boxLon = `between ${Math.min(...lons)} and ${Math.max(...lons)}`;

  const cols =
    'timepoint_stop_id, timepoint_stop_latitude, timepoint_stop_longitude, ' +
    'next_timepoint_stop_id, next_timepoint_stop_latitude, next_timepoint_stop_longitude';
  const limit = 50000;
  const rows = await getJson(BUS_URL, {
    $select:
      `${monthExpr('timestamp')} AS month, ${cols}, ` +
      'sum(average_road_speed) AS speed_sum, count(average_road_speed) AS speed_count',
    $where:
      "timestamp >= '2025-01-01T00:00:00.000' " +
      `AND timepoint_stop_latitude ${box} AND timepoint_stop_longitude ${boxLon} ` +
      `AND next_timepoint_stop_latitude ${box} AND next_timepoint_stop_longitude ${boxLon}`,
    $group: `month, ${cols}`,
    $limit: String(limit),
  });
  if (rows.length >= limit) throw new Error('bus query hit the row limit; results would be incomplete');

  const totals = new Map();   // month -> { sum, count }
  const segments = new Set();
  for (const r of rows) {
    const fromIn = inZone(Number(r.timepoint_stop_longitude), Number(r.timepoint_stop_latitude));
    const toIn = inZone(Number(r.next_timepoint_stop_longitude), Number(r.next_timepoint_stop_latitude));
    if (!fromIn || !toIn) continue;
    const sum = Number(r.speed_sum);
    const count = Number(r.speed_count);
    if (!Number.isFinite(sum) || !(count > 0)) continue;
    segments.add(`${r.timepoint_stop_id}>${r.next_timepoint_stop_id}`);
    const t = totals.get(r.month) ?? { sum: 0, count: 0 };
    t.sum += sum;
    t.count += count;
    totals.set(r.month, t);
  }
  console.log(`[update-data] bus speeds: ${segments.size} route segments inside the zone`);

  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, t]) => ({ month, value: t.sum / t.count }));
}

// ============================================================
// DATASETS
// ============================================================

// One entry per chart. To add a chart, add an entry here and read its file
// from a component with useMonthlyData('<file>'). An entry is either a
// single monthly query (base/dateCol/value/where) or a custom `fetch`.
const DATASETS = [
  {
    file: 'bus_speeds_monthly.json',
    fetch: fetchBusSpeedsInZone,
  },
  {
    file: 'vehicle_entries_monthly.json',
    base: 'https://data.ny.gov/resource/t6yz-b64h.json',
    dateCol: 'toll_date',
    value: 'sum(crz_entries)',
  },
  {
    file: 'noise_complaints_monthly.json',
    base: 'https://data.cityofnewyork.us/resource/erm2-nwe9.json',
    dateCol: 'created_date',
    value: 'count(*)',
    where: "created_date >= '2025-01-01T00:00:00.000' AND complaint_type like 'Noise%'",
  },
  {
    file: 'vehicle_speeds_monthly.json',
    base: 'https://data.cityofnewyork.us/resource/i4gi-tjb9.json',
    dateCol: 'data_as_of',
    value: 'avg(speed::number)',
    where:
      "data_as_of >= '2025-01-01T00:00:00.000' " +
      'AND speed::number > 0 AND speed::number < 60 ' +
      `AND link_id in (${CRZ_LINK_IDS.map((id) => `'${id}'`).join(',')})`,
  },
];

async function fetchMonthly(ds) {
  let rows;
  if (ds.fetch) {
    rows = await ds.fetch();
  } else {
    const params = {
      $select: `${monthExpr(ds.dateCol)} AS month, ${ds.value} AS value`,
      $group: 'month',
      $order: 'month',
      $limit: '500',
    };
    if (ds.where) params.$where = ds.where;
    rows = await getJson(ds.base, params);
  }

  const monthly = rows
    .filter((r) => /^\d{4}-\d{2}$/.test(r.month ?? '') && Number.isFinite(Number(r.value)))
    .map((r) => ({ month: r.month, value: Number(r.value) }));
  if (monthly.length === 0) throw new Error('query returned no usable rows');
  return monthly;
}

async function updateOne(ds) {
  for (let attempt = 1; ; attempt++) {
    try {
      const started = Date.now();
      const monthly = await fetchMonthly(ds);
      const payload = { updated: new Date().toISOString(), monthly };
      await fs.writeFile(path.join(OUT_DIR, ds.file), JSON.stringify(payload, null, 1) + '\n');
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      const last = monthly[monthly.length - 1].month;
      console.log(`[update-data] ${ds.file}: ${monthly.length} months through ${last} (${secs}s)`);
      return true;
    } catch (err) {
      console.error(`[update-data] ${ds.file}: attempt ${attempt}/${ATTEMPTS} failed: ${err.message}`);
      if (attempt >= ATTEMPTS) return false;
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
}

await fs.mkdir(OUT_DIR, { recursive: true });
console.log(`[update-data] started ${new Date().toISOString()}`);
const results = await Promise.all(DATASETS.map(updateOne));
const failed = results.filter((ok) => !ok).length;
if (failed > 0) {
  console.error(`[update-data] ${failed} of ${DATASETS.length} datasets failed; their existing files were left unchanged`);
  process.exit(1);
}
console.log('[update-data] all datasets updated');
