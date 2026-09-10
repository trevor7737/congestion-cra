// src/services/monthlyVehicleApi.ts
import axios from 'axios';

export type HourAvg = { hour: number; avg: number };
export type DailyHourRow = { date: string; hour: number; daily_count: number };

const BASE = 'https://data.ny.gov/resource/t6yz-b64h.json';
const APP_TOKEN = process.env.REACT_APP_APP_TOKEN || '';

const client = axios.create({
  headers: { Accept: 'application/json', ...(APP_TOKEN ? { 'X-App-Token': APP_TOKEN } : {}) },
  timeout: 30000,
});

/** page size for raw fetch (tune if needed) */
const PAGE_LIMIT = 50000;

/** safe ISO date string (YYYY-MM-DD) from Date */
function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1)); // first day next month
  const startStr = isoDate(start);
  // last day of month: subtract 1ms from next-month start
  const last = new Date(end.getTime() - 1);
  const endStr = isoDate(last);
  return { start: startStr, end: endStr };
}

/**
 * Fetch raw rows for the given date range, paging until done or until a safety cap.
 * Returns the concatenated raw objects.
 */
async function fetchRawRowsInRange(startDate: string, endDate: string, safetyMaxPages = 20): Promise<any[]> {
  const all: any[] = [];
  let offset = 0;
  for (let page = 0; page < safetyMaxPages; page++) {
    // use encoded params so shells won't break if you test in CLI
    const q =
      `?${encodeURIComponent('$where')}=${encodeURIComponent(`${startDate} <= date AND date <= ${endDate}`)}`; 
    // BUT dataset may not have literal 'date' column — so we'll use a simple $limit/$offset raw fetch (no where) and filter client-side in fallback detect
    // For robustness: attempt to fetch rows with $where using common names; if it fails, fall back to raw sample fetch below.
    // We'll attempt three url variants and pick the first that returns rows.
    const tries = [
      // try using 'date' (common)
      `${BASE}?${encodeURIComponent('$where')}=${encodeURIComponent(`date >= '${startDate}' AND date <= '${endDate}'`)}&${encodeURIComponent('$limit')}=${PAGE_LIMIT}&${encodeURIComponent('$offset')}=${offset}`,
      // try using 'entry_date'
      `${BASE}?${encodeURIComponent('$where')}=${encodeURIComponent(`entry_date >= '${startDate}' AND entry_date <= '${endDate}'`)}&${encodeURIComponent('$limit')}=${PAGE_LIMIT}&${encodeURIComponent('$offset')}=${offset}`,
      // try timestamp (ISO)
      `${BASE}?${encodeURIComponent('$where')}=${encodeURIComponent(`timestamp >= '${startDate}T00:00:00' AND timestamp <= '${endDate}T23:59:59'`)}&${encodeURIComponent('$limit')}=${PAGE_LIMIT}&${encodeURIComponent('$offset')}=${offset}`,
      // fallback: raw pagination with no where (we'll filter client-side)
      `${BASE}?${encodeURIComponent('$limit')}=${PAGE_LIMIT}&${encodeURIComponent('$offset')}=${offset}`,
    ];

    let rows: any[] = [];
    for (const url of tries) {
      try {
        const res = await client.get(url);
        rows = Array.isArray(res.data) ? res.data : [];
        // accept the first non-error response (even if empty)
        break;
      } catch (err) {
        // console.warn and try next variant
        // eslint-disable-next-line no-console
        console.warn('[monthlyVehicleApi] page fetch variant failed (will try next):', (err as any)?.message ?? err);
        continue;
      }
    }

    if (!rows.length) {
      // nothing returned for this page; stop paging
      break;
    }
    all.push(...rows);
    if (rows.length < PAGE_LIMIT) break;
    offset += PAGE_LIMIT;
  }
  return all;
}

/** Try to detect which keys are the date / hour / count fields by inspecting sample rows. */
function detectKeysFromSample(sample: any[]): { dateKey: string | null; hourKey: string | null; countKey: string | null } {
  if (!sample || sample.length === 0) return { dateKey: null, hourKey: null, countKey: null };
  const keys = Object.keys(sample[0]);
  // candidate lists
  const dateCandidates = ['date','entry_date','report_date','recorded_date','timestamp','reporting_date','created_date'];
  const hourCandidates = ['hour_of_day','hour','h','hour_of_report'];
  const countCandidates = ['vehicle_count','count','entries','total','daily_count','vehicleentries'];

  const dateKey = dateCandidates.find(k => keys.includes(k)) ?? keys.find(k => /\d{4}-\d{2}-\d{2}/.test(String(sample[0][k] ?? '')));
  const hourKey = hourCandidates.find(k => keys.includes(k)) ?? keys.find(k => sample.some(r => !isNaN(Number(r[k])) && Number(r[k]) >=0 && Number(r[k]) <=23));
  const countKey = countCandidates.find(k => keys.includes(k)) ?? keys.find(k => sample.some(r => !isNaN(Number(String(r[k]).replace(/,/g, ''))) ));
  return { dateKey: dateKey ?? null, hourKey: hourKey ?? null, countKey: countKey ?? null };
}

/** Normalize any raw value to a simple YYYY-MM-DD string if possible */
function normalizeDateValue(val: any): string | null {
  if (!val && val !== 0) return null;
  const s = String(val);
  // date only
  const m = s.match(/\d{4}-\d{2}-\d{2}/);
  if (m) return m[0];
  // timestamp maybe JSON date
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return isoDate(d);
  return null;
}

/**
 * Main function: construct daily hour rows for a month by:
 * - fetching raw rows in month range (paged),
 * - detecting keys,
 * - aggregating date+hour => daily_count,
 * - returning DailyHourRow[]
 */
export async function fetchDailyHourRowsForMonth(month: string): Promise<DailyHourRow[]> {
  const { start, end } = monthBounds(month);
  // fetch raw rows in range (paged)
  let rawRows: any[] = [];
  try {
    rawRows = await fetchRawRowsInRange(start, end, 30);
    console.debug('[monthlyVehicleApi] fetched raw rows count (paged):', rawRows.length);
  } catch (err) {
    console.error('[monthlyVehicleApi] raw fetch error', (err as any)?.message ?? err);
    rawRows = [];
  }

  // if nothing returned using where-based paging, try small sample fetch to inspect keys
  if (!rawRows.length) {
    try {
      const res = await client.get(`${BASE}?${encodeURIComponent('$limit')}=50`);
      rawRows = Array.isArray(res.data) ? res.data : [];
      console.debug('[monthlyVehicleApi] fallback sample fetch rows:', rawRows.slice(0,5));
    } catch (err) {
      console.warn('[monthlyVehicleApi] fallback sample fetch failed', (err as any)?.message ?? err);
      rawRows = [];
    }
  }

  if (!rawRows.length) {
    console.warn('[monthlyVehicleApi] no raw rows to inspect; returning empty');
    return [];
  }

  // detect keys
  const { dateKey, hourKey, countKey } = detectKeysFromSample(rawRows.slice(0, 50));
  console.debug('[monthlyVehicleApi] detected keys', { dateKey, hourKey, countKey });

  if (!dateKey || !hourKey || !countKey) {
    // try looser detection on all rawRows
    const detection = detectKeysFromSample(rawRows);
    console.debug('[monthlyVehicleApi] detection (full sample):', detection);
    if (!detection.dateKey || !detection.hourKey || !detection.countKey) {
      // nothing workable
      console.warn('[monthlyVehicleApi] unable to detect all required keys; returning empty');
      return [];
    }
  }

  const dKey = dateKey!;
  const hKey = hourKey!;
  const cKey = countKey!;

  // Aggregate: map of date -> hour -> sum
  const agg = new Map<string, Map<number, number>>();

  for (const r of rawRows) {
    const rawDateVal = r[dKey] ?? r['date'] ?? r['entry_date'] ?? r['timestamp'];
    const dateStr = normalizeDateValue(rawDateVal);
    if (!dateStr) continue;
    // ensure date in requested month
    if (dateStr < start || dateStr > end) continue;

    // hour
    const rawHour = r[hKey] ?? r['hour_of_day'] ?? r['hour'];
    const hourNum = Number(rawHour);
    if (!Number.isFinite(hourNum) || hourNum < 0 || hourNum > 23) continue;

    // count (strip commas)
    const rawCount = r[cKey] ?? r['vehicle_count'] ?? r['count'] ?? r['entries'] ?? 0;
    const cnt = Number(String(rawCount).replace(/,/g, ''));
    if (!Number.isFinite(cnt)) continue;

    if (!agg.has(dateStr)) agg.set(dateStr, new Map<number, number>());
    const hm = agg.get(dateStr)!;
    hm.set(hourNum, (hm.get(hourNum) ?? 0) + cnt);
  }

  // Convert to DailyHourRow[]
  const out: DailyHourRow[] = [];
  Array.from(agg.entries()).forEach(([date, hrMap]) => {
  Array.from(hrMap.entries()).forEach(([hour, daily_count]) => {
    out.push({ date, hour, daily_count });
        });
    });


  console.debug('[monthlyVehicleApi] aggregated daily-hour rows count:', out.length, 'sample:', out.slice(0,8));
  return out;
}

/** compute hourly averages given daily-hour rows for a month */
export async function fetchHourlyAveragesForMonth(month: string): Promise<HourAvg[]> {
  const rows = await fetchDailyHourRowsForMonth(month);
  // map hour -> array of daily_count
  const map = new Map<number, number[]>();
  for (const r of rows) {
    const arr = map.get(r.hour) ?? [];
    arr.push(r.daily_count);
    map.set(r.hour, arr);
  }
  const out: HourAvg[] = Array.from({ length: 24 }, (_, h) => {
    const arr = map.get(h) ?? [];
    if (arr.length === 0) return { hour: h, avg: 0 };
    const sum = arr.reduce((s, v) => s + v, 0);
    return { hour: h, avg: sum / arr.length };
  });
  return out;
}

/** convenience for multiple months */
export async function fetchHourlyAveragesForMonths(months: string[]): Promise<Record<string, HourAvg[]>> {
  const entries = await Promise.all(months.map(async (m) => {
    const vals = await fetchHourlyAveragesForMonth(m);
    return [m, vals] as const;
  }));
  return Object.fromEntries(entries);
}
