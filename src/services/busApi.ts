// src/services/busApi.ts
import axios from 'axios';

export type HourAvg = { hour: number; avg_speed: number };

const BASE = process.env.REACT_APP_API_URL || 'https://data.ny.gov/resource/kufs-yh3x.json';
const APP_TOKEN = process.env.REACT_APP_APP_TOKEN || '';

const client = axios.create({
  headers: {
    'Accept': 'application/json',
    ...(APP_TOKEN ? { 'X-App-Token': APP_TOKEN } : {}),
  },
  timeout: 20000,
});

/** Low-level GET helper with logging */
async function rawGet(fullUrl: string) {
  console.log('[busApi] GET', fullUrl);
  try {
    const res = await client.get(fullUrl);
    console.log('[busApi] status', res.status, 'rows', Array.isArray(res.data) ? res.data.length : typeof res.data);
    return res;
  } catch (err: any) {
    console.error('[busApi] request error', err?.message);
    if (err.response) {
      console.error('[busApi] response.status', err.response.status);
      console.error('[busApi] response.data', JSON.stringify(err.response.data, null, 2));
    }
    throw err;
  }
}

/**
 * Fetch average road speed grouped by hour_of_day.
 * Uses Socrata aggregation: AVG(average_road_speed) as avg_speed.
 */
/*export async function fetchAvgSpeedByHour(limit = 24): Promise<HourAvg[]> {
  const select = `hour_of_day, AVG(average_road_speed) as avg_speed`;
  const q = `?$select=${encodeURIComponent(select)}&$group=hour_of_day&$order=hour_of_day&$limit=${limit}`;
  const fullUrl = BASE + q;

  const res = await rawGet(fullUrl);
  const rows = (res.data ?? [])
  .map((r: any) => ({
    hour: r.hour_of_day !== undefined ? Number(r.hour_of_day) : NaN,
    avg_speed: r.avg_speed !== undefined ? Number(r.avg_speed) : NaN,
  }))
  .filter((x: { hour: number; avg_speed: number }) =>
    Number.isFinite(x.hour) && Number.isFinite(x.avg_speed)
  ) as HourAvg[];


  return rows;
}*/
export async function fetchAvgSpeedByHour(limit = 24): Promise<HourAvg[]> {
  // 🔴 TEMP: simulate last update date (change this to test)
  const since = '2025-11-03T00:00:00';

  const select = `hour_of_day, AVG(average_road_speed) as avg_speed`;
  const where = `timestamp > '${since}'`;

  const q =
    `?$select=${encodeURIComponent(select)}` +
    `&$where=${encodeURIComponent(where)}` +
    `&$group=hour_of_day` +
    `&$order=hour_of_day` +
    `&$limit=${limit}`;

  const fullUrl = BASE + q;
  const res = await rawGet(fullUrl);

  const rows = (res.data ?? [])
    .map((r: any) => ({
      hour: Number(r.hour_of_day),
      avg_speed: Number(r.avg_speed),
    }))
    .filter((x: { hour: number; avg_speed: number }) =>
      Number.isFinite(x.hour) && Number.isFinite(x.avg_speed)
    ) as HourAvg[];

  console.log('[TEST] since =', since, 'rows returned =', rows.length);
  return rows;
}


export {};
