// utils/zoneCheck.ts
import * as turf from '@turf/turf';
import type { Feature, LineString, Polygon } from 'geojson';

/** 1) Provide your congestion-zone polygon (replace with official GeoJSON for best accuracy) */
export const CONGESTION_ZONE_POLYGON: Feature<Polygon> = turf.polygon([[
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

/** Precompute bbox of polygon to quickly eliminate distant rows.
 * turf.bbox returns [minX, minY, maxX, maxY] i.e. [minLon, minLat, maxLon, maxLat]
 */
const ZONE_BBOX = turf.bbox(CONGESTION_ZONE_POLYGON);

/** Parse link_points that may be:
 * - WKT: "LINESTRING (lng lat, lng lat, ...)"
 * - lat,lon pairs: "40.67445,-73.80181 40.67374,-73.80154 ..."
 * - comma/space list: "lat1,lon1,lat2,lon2,..."
 */
export function parseLineString(linkPoints?: string): Feature<LineString> | null {
  if (!linkPoints || typeof linkPoints !== 'string') return null;
  const s = linkPoints.trim();

  // 1) WKT style
  const wktMatch = s.match(/LINESTRING\s*(?:Z|M|ZM)?\s*\(\s*(.*)\s*\)/i);
  if (wktMatch) {
    const inner = wktMatch[1];
    const coords = inner.split(',')
      .map(p => p.trim().split(/\s+/).map(Number))
      .filter(a => a.length >= 2 && Number.isFinite(a[0]) && Number.isFinite(a[1]))
      .map(a => [a[0], a[1]] as [number, number]); // assumes "lng lat"
    if (coords.length >= 2) return turf.lineString(coords);
    return null;
  }

  // 2) "lat,lon lat,lon ..." pattern (your example)
  const parts = s.split(/\s+/).map(x => x.trim()).filter(Boolean);
  const coords2: [number, number][] = [];
  for (const p of parts) {
    const bits = p.split(',').map(x => x.trim()).filter(Boolean);
    if (bits.length >= 2) {
      const lat = Number(bits[0]);
      const lon = Number(bits[1]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        coords2.push([lon, lat]); // GeoJSON expects [lon, lat]
      }
    }
  }
  if (coords2.length >= 2) return turf.lineString(coords2);

  // 3) fallback: sequence of numbers "lat1,lon1,lat2,lon2 ..."
  const nums = s.split(/[, ]+/).map(x => Number(x)).filter(n => Number.isFinite(n));
  if (nums.length >= 4 && nums.length % 2 === 0) {
    const coords: [number, number][] = [];
    for (let i = 0; i < nums.length; i += 2) {
      const lat = nums[i], lon = nums[i + 1];
      if (Number.isFinite(lat) && Number.isFinite(lon)) coords.push([lon, lat]);
    }
    if (coords.length >= 2) return turf.lineString(coords);
  }

  return null;
}

/** Quick bbox test: does the geometry's bbox intersect the zone bbox? */
export function bboxIntersectsZone(line: Feature<LineString>): boolean {
  const bb = turf.bbox(line); // [minX,minY,maxX,maxY]
  // test overlap between [minX,maxX] and [ZONE_BBOX[0], ZONE_BBOX[2]] etc
  const overlapX = bb[0] <= ZONE_BBOX[2] && bb[2] >= ZONE_BBOX[0];
  const overlapY = bb[1] <= ZONE_BBOX[3] && bb[3] >= ZONE_BBOX[1];
  return overlapX && overlapY;
}

/** Main check: given a row, return boolean whether it is in zone.
 * Row should have: borough (string) and link_points (string).
 * This function does:
 *  - borough prefilter (if borough present)
 *  - parse geometry
 *  - bbox prefilter
 *  - precise turf.booleanIntersects
 */
export function isRowInsideZone(row: Record<string, any>): boolean {
  try {
    const boroughRaw = row.borough ?? row.BOROUGH ?? row.boro ?? '';
    if (typeof boroughRaw === 'string' && boroughRaw.trim().length) {
      // fast cheap filter
      if (boroughRaw.trim().toLowerCase() !== 'manhattan') return false;
    }

    const lp = row.link_points ?? row.linkPoints ?? row.link_points_wkt ?? row.link;
    if (!lp) return false;

    const line = parseLineString(String(lp));
    if (!line) return false;

    // bbox quick-reject
    if (!bboxIntersectsZone(line)) return false;

    // final accurate test
    return turf.booleanIntersects(line, CONGESTION_ZONE_POLYGON);
  } catch (err) {
    // on parse errors, be conservative and treat as not in zone
    return false;
  }
}
