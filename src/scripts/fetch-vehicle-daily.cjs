// scripts/fetch-vehicle-daily.cjs
// CommonJS Node script. Run: node scripts/fetch-vehicle-daily.cjs
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const OUT_DIR = path.resolve(process.cwd(), 'public', 'data');
const OUT_FILE = path.join(OUT_DIR, 'vehicle_entries_daily.json');
const BASE = 'https://data.ny.gov/resource/t6yz-b64h.json';
const APP_TOKEN = process.env.SOCRATA_APP_TOKEN || process.env.REACT_APP_APP_TOKEN || '';

const axiosClient = axios.create({
  headers: {
    Accept: 'application/json',
    ...(APP_TOKEN ? { 'X-App-Token': APP_TOKEN } : {}),
  },
  timeout: 30000,
});

function normalizeRow(row, dateField) {
  const raw = row[dateField] ?? row.date ?? row.entry_date ?? row.toll_date ?? row.timestamp;
  if (!raw) return null;
  const s = String(raw);
  const m = s.match(/\d{4}-\d{2}-\d{2}/);
  const date = m ? m[0] : s.slice(0,10);
  const rawCount = row.count ?? row['SUM(vehicle_count)'] ?? row.vehicle_count ?? 0;
  const count = Number(String(rawCount).replace(/,/g,''));
  if (Number.isNaN(count)) return null;
  return { date, count };
}

async function tryAgg(dateField) {
  const select = `${dateField}, SUM(vehicle_count) AS count`;
  const q =
    `?${encodeURIComponent('$select')}=${encodeURIComponent(select)}` +
    `&${encodeURIComponent('$group')}=${encodeURIComponent(dateField)}` +
    `&${encodeURIComponent('$order')}=${encodeURIComponent(dateField)}` +
    `&${encodeURIComponent('$limit')}=50000`;
  const url = BASE + q;
  try {
    const res = await axiosClient.get(url);
    if (!Array.isArray(res.data)) return null;
    const normalized = res.data.map(r => normalizeRow(r, dateField)).filter(Boolean);
    return normalized;
  } catch (err) {
    return null;
  }
}

async function fallbackFetchAndAggregate(limit = 50000) {
  try {
    const res = await axiosClient.get(BASE + `?${encodeURIComponent('$limit')}=${limit}`);
    const raw = Array.isArray(res.data) ? res.data : [];
    const buckets = new Map();
    for (const r of raw) {
      const keys = Object.keys(r);
      const dateKey = keys.find(k => /\d{4}-\d{2}-\d{2}/.test(String(r[k] ?? ''))) || keys.find(k => /date|timestamp/i.test(k));
      const dateStr = dateKey ? (String(r[dateKey]).match(/\d{4}-\d{2}-\d{2}/) || [String(r[dateKey]).slice(0,10)])[0] : null;
      if (!dateStr) continue;
      const cnt = Number(String(r.count ?? r.vehicle_count ?? 0).replace(/,/g,''));
      if (!Number.isFinite(cnt)) continue;
      buckets.set(dateStr, (buckets.get(dateStr) || 0) + cnt);
    }
    return Array.from(buckets.entries()).map(([date, count]) => ({ date, count })).sort((a,b) => a.date.localeCompare(b.date));
  } catch (err) {
    return [];
  }
}

(async () => {
  try {
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const candidates = ['entry_date','toll_date','date','report_date','timestamp'];
    let result = null;
    let used = null;

    for (const c of candidates) {
      const rows = await tryAgg(c);
      if (rows && rows.length) {
        result = rows;
        used = c;
        break;
      }
      // if rows === [] (empty), still accept only if it's the first candidate (maybe no rows)
      if (rows && rows.length === 0 && c === candidates[0]) {
        result = [];
        used = c;
        break;
      }
    }

    if (!result) {
      result = await fallbackFetchAndAggregate(50000);
      used = 'fallback';
    }

    const payload = { generated_at: new Date().toISOString(), date_field: used, rows: result };
    fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`Wrote ${OUT_FILE} — rows: ${result.length} (date_field: ${used})`);
  } catch (e) {
    console.error('Error:', e?.message ?? e);
    process.exit(1);
  }
})();
