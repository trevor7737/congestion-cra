// scripts/regenerate-december-from-detailed.cjs
// Run: node scripts/regenerate-december-from-detailed.cjs
const fs = require('fs');
const path = require('path');

const OUT = path.resolve('public/data/vehicle_entries_december_hourly.json');
// Candidate input files to search for detailed rows (order matters)
const CANDIDATES = [
  path.resolve('public/data/vehicle_entries_daily.json'),
  path.resolve('public/data/vehicle_entries_raw.json'),
  path.resolve('public/data/vehicle_entries_detailed.json'),
  path.resolve('public/data/vehicle_entries_december_raw.json'),
];

function readIfExists(p) {
  try {
    if (fs.existsSync(p)) {
      const txt = fs.readFileSync(p, 'utf8');
      return JSON.parse(txt);
    }
  } catch (e) {
    console.warn('read error', p, e?.message ?? e);
  }
  return null;
}

function isoDateFrom(val) {
  if (!val && val !== 0) return null;
  const s = String(val);
  const m = s.match(/\d{4}-\d{2}-\d{2}/);
  if (m) return m[0];
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

(async function main() {
  try {
    console.log('Searching for detailed files...');
    let detailed = null;
    let usedPath = null;
    for (const p of CANDIDATES) {
      const j = readIfExists(p);
      if (!j) continue;
      // support both top-level array or { rows: [...] }
      const arr = Array.isArray(j) ? j : (Array.isArray(j.rows) ? j.rows : null);
      if (!arr || !arr.length) continue;
      // check for crz_entries or hour_of_day
      const sample = arr[0];
      if (sample && (sample.hasOwnProperty('crz_entries') || sample.hasOwnProperty('hour_of_day') || sample.hasOwnProperty('hour'))) {
        detailed = arr;
        usedPath = p;
        break;
      }
    }

    if (!detailed) {
      console.error('No detailed file found in candidates. Create or move the raw detailed JSON into public/data and try again.');
      process.exit(1);
    }
    console.log('Using detailed file:', usedPath, 'rows:', detailed.length);

    // date window to average (you asked Dec 14 - Dec 20)
    const START = '2025-12-14';
    const END = '2025-12-20';

    // aggregate: date -> hour -> sum(crz_entries)
    const dateHour = new Map(); // date -> Map(hour->sum)
    const datesSet = new Set();

    for (const r of detailed) {
      const dateVal = r.toll_date ?? r.date ?? r.entry_date ?? r.timestamp ?? r.toll_week;
      const dateStr = isoDateFrom(dateVal);
      if (!dateStr) continue;
      if (dateStr < START || dateStr > END) continue;

      datesSet.add(dateStr);

      // find hour value
      let hourRaw = r.hour_of_day ?? r.hour ?? r.toll_hour ?? r.minute_of_hour ?? r.h;
      // if toll_hour is an ISO string, extract hour
      if (typeof hourRaw === 'string' && /T\d{2}:\d{2}/.test(hourRaw)) {
        const m = hourRaw.match(/T(\d{2}):/);
        if (m) hourRaw = m[1];
      }
      const hour = Number(String(hourRaw).replace(/[^\d]/g, ''));
      if (!Number.isFinite(hour) || hour < 0 || hour > 23) continue;

      // prefer crz_entries
      const rawCount = r.crz_entries ?? r.count ?? r.vehicle_count ?? r.daily_count ?? r.value ?? 0;
      const cnt = Number(String(rawCount).replace(/,/g, ''));
      if (!Number.isFinite(cnt)) continue;

      if (!dateHour.has(dateStr)) dateHour.set(dateStr, new Map());
      const hm = dateHour.get(dateStr);
      hm.set(hour, (hm.get(hour) || 0) + cnt);
    }

    const dates = Array.from(datesSet).sort();
    console.log('Dates included in aggregation:', dates);

    // compute per-hour average across dates (fill missing with 0)
    const rows = [];
    for (let h = 0; h < 24; h++) {
      let sum = 0;
      for (const d of dates) {
        const hm = dateHour.get(d);
        const v = hm ? (hm.get(h) || 0) : 0;
        sum += v;
      }
      const avg = dates.length ? (sum / dates.length) : 0;
      rows.push({ hour: h, avg });
    }

    const payload = {
      month: 'December 2025',
      window: `${START} to ${END}`,
      generated_at: new Date().toISOString(),
      source: usedPath,
      rows,
    };

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), 'utf8');
    console.log('Wrote', OUT, 'rows:', rows.length);
    console.log('Sample (non-zero hours):', rows.filter(r => Math.round(r.avg) !== 0).slice(0, 12));
    process.exit(0);
  } catch (e) {
    console.error('Error:', e?.message ?? e);
    process.exit(1);
  }
})();
