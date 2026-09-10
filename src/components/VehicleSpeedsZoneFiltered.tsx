// src/components/VehicleSpeedsZoneFiltered.tsx
import React, { useEffect, useMemo, useState } from 'react';
import type { Feature, LineString } from 'geojson';
import * as turf from '@turf/turf';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

type AnyRow = Record<string, any>;
type HourAvg = { hour: number; avg_speed: number };

const BASE = 'https://data.cityofnewyork.us/resource/i4gi-tjb9.json';
const LIMIT = 50000;

/**
 * Simplified congestion zone polygon (GeoJSON-style).
 * You may replace this with the official polygon GeoJSON.
 */
const CONGESTION_ZONE_POLYGON = turf.polygon([[
  [-74.0170, 40.7057],
  [-73.9731, 40.7057],
  [-73.9731, 40.7642],
  [-73.9498, 40.7642],
  [-73.9498, 40.8005],
  [-73.9819, 40.8005],
  [-73.9819, 40.7642],
  [-74.0170, 40.7642],
  [-74.0170, 40.7057],
]]);

/** Parse WKT LINESTRING -> coordinates array [[lng,lat],...] */
function parseLineStringWKT(wkt: string): Feature<LineString> | null {
  if (!wkt || typeof wkt !== 'string') return null;
  const s = wkt.trim();
  // remove optional prefix like "LINESTRING Z (" etc.
  const m = s.match(/LINESTRING\s*(?:Z|M|ZM)?\s*\(\s*(.*)\s*\)/i);
  if (!m) return null;
  const inner = m[1];
  const parts = inner.split(',').map(p => p.trim());
  const coords: number[][] = [];
  for (const part of parts) {
    const nums = part.split(/\s+/).map(Number).filter(n => Number.isFinite(n));
    if (nums.length >= 2) {
      // Socrata WKT uses "lng lat"
      coords.push([nums[0], nums[1]]);
    }
  }
  if (coords.length < 2) return null;
  return turf.lineString(coords);
}

/** format hour label like "12 AM", "1 PM" */
function formatHour(h: number) {
  const hh = Number(h);
  const display = hh === 0 ? 12 : (hh > 12 ? hh - 12 : hh);
  const suffix = hh < 12 ? 'AM' : 'PM';
  return `${display} ${suffix}`;
}

export default function VehicleSpeedsZoneFiltered() {
  const [rowsKept, setRowsKept] = useState<AnyRow[]>([]);
  const [pagesFetched, setPagesFetched] = useState<number>(0);
  const [rowsFetched, setRowsFetched] = useState<number>(0);
  const [lastPageSize, setLastPageSize] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelRequested, setCancelRequested] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    setRowsKept([]);
    setPagesFetched(0);
    setRowsFetched(0);
    setLastPageSize(null);
    setLoading(true);
    setError(null);
    setCancelRequested(false);

    (async () => {
      try {
        let offset = 0;
        let totalFetched = 0;
        const kept: AnyRow[] = [];

        while (true) {
          if (cancelled) break;

          const select = encodeURIComponent('link_id,speed,data_as_of,link_points');
          const url = `${BASE}?$select=${select}&$limit=${LIMIT}&$offset=${offset}&$order=data_as_of%20ASC`;

          // fetch page
          const res = await fetch(url);
          if (!res.ok) {
            const txt = await res.text().catch(() => '');
            throw new Error(`HTTP ${res.status} ${res.statusText} ${txt.slice(0, 200)}`);
          }

          const page: AnyRow[] = await res.json();
          const n = Array.isArray(page) ? page.length : 0;

          totalFetched += n;
          setPagesFetched(p => p + 1);
          setRowsFetched(totalFetched);
          setLastPageSize(n);

          if (!Array.isArray(page) || page.length === 0) {
            break;
          }

          // process page: parse geometry and test intersection
          for (const r of page) {
            if (!r.link_points || !r.speed) continue;
            try {
              const line = parseLineStringWKT(String(r.link_points));
              if (!line) continue;
              // turf.booleanIntersects handles geometry intersection
              const intersects = turf.booleanIntersects(line, CONGESTION_ZONE_POLYGON);
              if (intersects) {
                // normalize kept row: parse speed and date/hour if present later
                kept.push({
                  link_id: r.link_id,
                  speed: Number(String(r.speed).replace(/,/g, '')) || 0,
                  data_as_of: r.data_as_of ?? r.data_as_of,
                  link_points: r.link_points,
                });
              }
            } catch (e) {
              // skip malformed geometry or parse errors
              continue;
            }
          }

          // push kept so far to state (incremental UI)
          if (!cancelled) setRowsKept(prev => prev.concat(kept.splice(0))); // move items into state

          if (n < LIMIT) {
            // last page
            break;
          }
          offset += LIMIT;
          // polite pause to reduce rate-limiting (adjust if you hit 429)
          await new Promise(res => setTimeout(res, 350));
        }
      } catch (err: any) {
        if (!cancelled) setError(String(err?.message ?? err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      setCancelRequested(true);
    };
  }, []);

  // Aggregate hourly averages:
  // We need date + hour. DOT dataset uses data_as_of (timestamp) — we'll extract YYYY-MM-DD and hour from that field.
  const hourlyAverages = useMemo<HourAvg[]>(() => {
    if (!rowsKept || rowsKept.length === 0) {
      return Array.from({ length: 24 }, (_, h) => ({ hour: h, avg_speed: 0 }));
    }

    // Build date -> hour -> speeds[]
    const dateHourMap = new Map<string, Map<number, number[]>>();

    for (const r of rowsKept) {
      // data_as_of is expected like "2025-01-06T08:20:00.000"
      const stamp = String(r.data_as_of ?? '');
      const m = stamp.match(/\d{4}-\d{2}-\d{2}T(\d{2}):/);
      const dateMatch = stamp.match(/\d{4}-\d{2}-\d{2}/);
      if (!dateMatch || !m) continue;
      const day = dateMatch[0];
      const hour = Number(m[1]);
      if (!Number.isFinite(hour) || hour < 0 || hour > 23) continue;

      const sp = Number(r.speed);
      if (!Number.isFinite(sp)) continue;

      if (!dateHourMap.has(day)) dateHourMap.set(day, new Map<number, number[]>());
      const hm = dateHourMap.get(day)!;
      hm.set(hour, (hm.get(hour) ?? []).concat([sp]));
    }

    const dates = Array.from(dateHourMap.keys()).sort();
    if (dates.length === 0) {
      return Array.from({ length: 24 }, (_, h) => ({ hour: h, avg_speed: 0 }));
    }

    const out: HourAvg[] = Array.from({ length: 24 }, (_, h) => {
      let sumAcrossDates = 0;
      let countDatesWithValue = 0;
      for (const d of dates) {
        const hm = dateHourMap.get(d)!;
        const arr = hm.get(h) ?? [];
        if (arr.length === 0) {
          // treat missing hour on a date as zero contribution (but don't count as a date-with-value)
          // this mirrors "average per day" across available dates (days with no data contribute 0)
          // if you prefer to only average across dates that have that hour, adjust logic accordingly
          // here we will treat missing hours as 0 (consistent with earlier components)
          // so we still increment countDatesWithValue to include all dates:
          countDatesWithValue += 1;
          // sumAcrossDates += 0;
        } else {
          const dailyAvg = arr.reduce((s, v) => s + v, 0) / arr.length;
          sumAcrossDates += dailyAvg;
          countDatesWithValue += 1;
        }
      }
      const avg = countDatesWithValue ? (sumAcrossDates / countDatesWithValue) : 0;
      return { hour: h, avg_speed: Number(avg) };
    });

    return out;
  }, [rowsKept]);

  return (
    <section style={{ padding: 18 }}>
      <h2>Vehicle speeds — congestion zone (spatially filtered)</h2>
      <p style={{ color: '#555' }}>
        Filtering DOT Traffic Speeds dataset to road segments that intersect a congestion-zone polygon,
        then averaging observed speeds by hour of day (daily averages → averaged across days).
      </p>

      <div style={{ marginBottom: 12 }}>
        <strong>Progress:</strong>{' '}
        {loading ? (
          <span>Loading… pages fetched: {pagesFetched}, rows fetched: {rowsFetched}, last page: {lastPageSize ?? '-'}</span>
        ) : error ? (
          <span style={{ color: 'crimson' }}>Error: {error}</span>
        ) : (
          <span>{rowsKept.length.toLocaleString()} filtered rows (ready)</span>
        )}
      </div>

      <div style={{ height: 380 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={hourlyAverages} margin={{ top: 8, right: 24, left: 64, bottom: 36 }}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.25} />
            <XAxis
              dataKey="hour"
              type="number"
              domain={[0, 23]}
              ticks={Array.from({ length: 24 }, (_, i) => i)}
              interval={0}
              tickFormatter={formatHour}
              label={{ value: 'Hour of day', position: 'bottom', offset: 12 }}
            />
            <YAxis
              label={{ value: 'Avg speed (mph)', angle: -90, position: 'left', offset: 8 }}
            />
            <Tooltip
              formatter={(v: any) => `${Number(v).toFixed(1)} mph`}
              labelFormatter={(l) => formatHour(Number(l))}
            />
            <Line
              dataKey="avg_speed"
              stroke="#2a6ebb"
              strokeWidth={2}
              dot={{ r: 3 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
