// scripts/findCrzLinkIds.ts
//
// Run once: discovers the i4gi-tjb9 link_ids that fall inside the CRZ
// (Manhattan south of 60th St, excluding FDR, West Side Hwy / 9A,
// Henry Hudson, Harlem River Dr, Battery Park Underpass).
//
// Usage:
//   npx tsx scripts/findCrzLinkIds.ts
//
// Copy the final printed CRZ_LINK_IDS array into your component.

// scripts/findCrzLinkIds.ts
import { polygon } from '@turf/helpers';
import bbox from '@turf/bbox';
import booleanIntersects from '@turf/boolean-intersects';
import type { Feature, Polygon } from 'geojson';
import { parseLineString } from '../utils/zoneCheck';

console.log('Imports loaded');  // <-- add this

// CRZ polygon: Manhattan south of 60th St (approximate rectangle, [lon, lat]).
const CRZ_POLYGON: Feature<Polygon> = polygon([[
  [-74.0260, 40.7000], // SW — Battery
  [-73.9700, 40.7000], // SE
  [-73.9560, 40.7644], // NE — ~60th & FDR
  [-74.0100, 40.7644], // NW — ~60th & West Side Hwy
  [-74.0260, 40.7000],
]]);
const CRZ_BBOX = bbox(CRZ_POLYGON);

// Through-roads inside the box that are NOT tolled by CRZ.
const EXCLUDED_NAME_PATTERNS: RegExp[] = [
  /\bFDR\b/i,
  /WEST SIDE H(IGH)?W(A)?Y/i,
  /HENRY HUDSON/i,
  /\bRT\.?\s*9A\b/i,
  /\bROUTE\s*9A\b/i,
  /HARLEM RIVER/i,
  /BATTERY PARK UNDERPASS/i,
];

function isExcludedByName(name: string | undefined): boolean {
  if (!name) return false;
  return EXCLUDED_NAME_PATTERNS.some(re => re.test(name));
}

function linkIntersectsCrz(linkPoints: string): boolean {
  const line = parseLineString(linkPoints);
  if (!line) return false;
  const lb = bbox(line);
  const overlapX = lb[0] <= CRZ_BBOX[2] && lb[2] >= CRZ_BBOX[0];
  const overlapY = lb[1] <= CRZ_BBOX[3] && lb[3] >= CRZ_BBOX[1];
  if (!overlapX || !overlapY) return false;
  return booleanIntersects(line, CRZ_POLYGON);
}

const BASE = 'https://data.cityofnewyork.us/resource/i4gi-tjb9.json';

type LinkRow = {
  link_id: string;
  link_name: string;
  link_points: string;
};

async function fetchManhattanLinks(): Promise<LinkRow[]> {
  const params = new URLSearchParams({
    $select: 'link_id, max(link_name) AS link_name, max(link_points) AS link_points',
    $where: "borough = 'Manhattan'",
    $group: 'link_id',
    $limit: '5000',
  });
  const url = `${BASE}?${params.toString()}`;

  console.log('  URL:', url);
  const start = Date.now();

  const res = await fetch(url);
  console.log(`  Response in ${Date.now() - start}ms, status ${res.status}`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${text.slice(0, 300)}`);
  }
  return res.json();
}

async function main() {
  console.log('Fetching distinct Manhattan links from i4gi-tjb9 ...');
  const rows = await fetchManhattanLinks();
  console.log(`  -> ${rows.length} distinct Manhattan link_ids`);

  const kept: LinkRow[] = [];
  for (const row of rows) {
    if (isExcludedByName(row.link_name)) continue;
    if (!row.link_points) continue;
    if (linkIntersectsCrz(row.link_points)) kept.push(row);
  }

  console.log(`Kept ${kept.length} CRZ links.\n`);
  const ids = kept.map(r => r.link_id).sort();
  console.log('=== Paste this into your component ===\n');
  console.log(`const CRZ_LINK_IDS = ${JSON.stringify(ids)} as const;`);
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});