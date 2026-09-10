// src/services/vehicleEntriesApi.ts
import axios from 'axios';

export type HourCount = { hour: number; count: number };

const BASE = 'https://data.ny.gov/resource/t6yz-b64h.json';
const APP_TOKEN = process.env.REACT_APP_APP_TOKEN || '';

const client = axios.create({
  headers: {
    Accept: 'application/json',
    ...(APP_TOKEN ? { 'X-App-Token': APP_TOKEN } : {}),
  },
  timeout: 20000,
});

/**
 * Return the latest available date in the dataset (YYYY-MM-DD) or null.
 */
export async function fetchLatestAvailableDate(): Promise<string | null> {
  try {
    const q = '?$select=date&$order=date%20DESC&$limit=1';
    const res = await client.get(BASE + q);
    const rows = Array.isArray(res.data) ? res.data : [];
    if (!rows.length) return null;
    const d = rows[0].date ?? rows[0].entry_date ?? rows[0].report_date;
    return d ? String(d).slice(0, 10) : null;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[vehicleEntriesApi] fetchLatestAvailableDate error', msg);
    return null;
  }
}

/**
 * Build case-insensitive hour aggregation URL (uses UPPER(day_of_week)).
 */
function buildHourAggUrl(dayOfWeek: string) {
  const dayUpper = String(dayOfWeek ?? '').toUpperCase();
  const select = 'hour_of_day, SUM(vehicle_count) AS count';
  const where = `UPPER(day_of_week)='${dayUpper}'`;
  const q =
    `?${encodeURIComponent('$select')}=${encodeURIComponent(select)}` +
    `&${encodeURIComponent('$where')}=${encodeURIComponent(where)}` +
    `&${encodeURIComponent('$group')}=hour_of_day` +
    `&${encodeURIComponent('$order')}=hour_of_day`;
  return BASE + q;
}

/**
 * Fetch vehicle entries grouped by hour for a given dayOfWeek.
 * Returns a stable 24-element array (0..23) with numeric counts.
 */
export async function fetchVehicleEntriesByHour(dayOfWeek: string): Promise<HourCount[]> {
  try {
    const url = buildHourAggUrl(dayOfWeek);
    const res = await client.get(url);
    const rows = Array.isArray(res.data) ? res.data : [];
    console.debug('[vehicleEntriesApi] agg raw rows:', rows.slice(0, 20));

    const buckets: HourCount[] = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
    for (const r of rows) {
      const rawHour = r.hour_of_day ?? r.hour ?? r.h;
      const rawCount = r.count ?? r.COUNT ?? r['SUM(vehicle_count)'] ?? r.vehicle_count ?? r.entries;
      const h = Number(rawHour);
      const c = Number(String(rawCount ?? 0).replace(/,/g, ''));
      if (!Number.isFinite(h) || h < 0 || h > 23) continue;
      if (!Number.isFinite(c)) continue;
      buckets[h].count = c;
    }

    const total = buckets.reduce((s, b) => s + b.count, 0);
    if (total === 0) {
      console.debug('[vehicleEntriesApi] agg returned zeros; running fallback sample aggregation');
      return await fallbackSampleAggregateByHour(dayOfWeek, buckets);
    }

    return buckets;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[vehicleEntriesApi] fetchVehicleEntriesByHour error', msg);
    return await fallbackSampleAggregateByHour(dayOfWeek);
  }
}

/** Fallback: fetch sample rows and aggregate client-side with day filter */
async function fallbackSampleAggregateByHour(dayOfWeek: string, preBuckets?: HourCount[]) {
  try {
    const url = BASE + '?$limit=1000';
    const res = await client.get(url);
    const sample = Array.isArray(res.data) ? res.data : [];
    console.debug('[vehicleEntriesApi] fallback sample rows:', sample.slice(0, 12));

    if (!sample.length) {
      return preBuckets ?? Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
    }

    const keys = Object.keys(sample[0]);
    const hourKey = keys.find(k => /hour/i.test(k)) ?? 'hour_of_day';
    const cntKey = keys.find(k => /(vehicle|count|entries|total)/i.test(k)) ?? 'vehicle_count';
    const dayKey = keys.find(k => /day_of_week|day/i.test(k)) ?? 'day_of_week';
    const neededDayUpper = String(dayOfWeek ?? '').toUpperCase();

    const buckets = preBuckets ? preBuckets.map(b => ({ ...b })) : Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));

    for (const r of sample) {
      const rawDay = r[dayKey];
      if (rawDay && String(rawDay).toUpperCase() !== neededDayUpper) continue;
      const hh = Number(r[hourKey] ?? r.hour_of_day ?? r.hour);
      const cc = Number(String(r[cntKey] ?? r.count ?? r.vehicle_count ?? 0).replace(/,/g, ''));
      if (!Number.isFinite(hh) || hh < 0 || hh > 23) continue;
      if (!Number.isFinite(cc)) continue;
      buckets[hh].count += cc;
    }

    console.debug('[vehicleEntriesApi] fallback aggregated buckets (first 8):', buckets.slice(0, 8));
    return buckets;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[vehicleEntriesApi] fallbackSampleAggregateByHour error', msg);
    return preBuckets ?? Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
  }
}
