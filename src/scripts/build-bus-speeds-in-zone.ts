import fs from 'fs';
import path from 'path';
import { isRowInsideZone } from '../utils/zoneCheck';

const BASE = 'https://data.ny.gov/resource/kufs-yh3x.json';
const OUTPUT = path.join(__dirname, '..', 'src', 'data', 'bus_speeds_in_zone.json');

async function main() {
  console.log('Fetching bus speed data from Socrata...');
  const allRows: any[] = [];
  let offset = 0;
  const PAGE = 50000;

  while (true) {
    const url = `${BASE}?$where=timestamp >= '2025-01-01T00:00:00.000'&$limit=${PAGE}&$offset=${offset}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    if (rows.length === 0) break;
    allRows.push(...rows);
    offset += PAGE;
    console.log(`  Fetched ${allRows.length} rows so far...`);
    if (rows.length < PAGE) break;
  }

  console.log(`Filtering ${allRows.length} rows to congestion zone...`);
  const inZone = allRows.filter(isRowInsideZone);
  console.log(`  ${inZone.length} rows inside zone.`);

  console.log('Aggregating by month...');
  const byMonth: Record<string, { sum: number; count: number }> = {};
  for (const row of inZone) {
    const ts = row.timestamp;
    if (!ts) continue;
    const month = String(ts).slice(0, 7);
    const speed = Number(row.average_road_speed);
    if (!Number.isFinite(speed)) continue;
    if (!byMonth[month]) byMonth[month] = { sum: 0, count: 0 };
    byMonth[month].sum += speed;
    byMonth[month].count += 1;
  }

  const monthly = Object.entries(byMonth)
    .map(([month, { sum, count }]) => ({ month, value: sum / count }))
    .sort((a, b) => a.month.localeCompare(b.month));

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(
    OUTPUT,
    JSON.stringify({ generated: new Date().toISOString(), monthly }, null, 2)
  );

  console.log(`Wrote ${monthly.length} months to ${OUTPUT}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});