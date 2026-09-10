// src/services/vehicleEntriesLocal.ts
export type DailyRow = { date: string; count: number };
export type LocalPayload = { generated_at?: string; date_field?: string; rows: DailyRow[] };

export async function fetchDailyEntriesLocal(): Promise<{ rows: DailyRow[]; generated_at?: string; date_field?: string }> {
  const url = '/data/vehicle_entries_daily.json';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load local data: ${res.status}`);
  const payload = (await res.json()) as LocalPayload;
  // Basic normalization: ensure rows is array of {date,count}
  const rows = Array.isArray(payload.rows)
    ? payload.rows.map(r => ({ date: String(r.date).slice(0,10), count: Number(r.count ?? r.count ?? 0) }))
    : [];
  return { rows, generated_at: payload.generated_at, date_field: payload.date_field };
}
