// src/components/VehicleSpeedsZoneFetchAndChart.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  readCache, writeCache,
  buildCumulative, MonthValue,
} from '../utils/socrataCache';
import { Layout } from './Layout';

const BASE = 'https://data.cityofnewyork.us/resource/i4gi-tjb9.json';
const CACHE_PREFIX = 'vehicle_speeds_crz_v3:';
const CACHE_KEY = 'monthly';
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;  // 2 weeks

// West Side corridor segments inside the Congestion Relief Zone (south of 60th St)
// West St, 11th Ave, 12th Ave — the major north-south spine through the CRZ
const CRZ_LINK_IDS = [
  // West St
  '4616335', // West St N Whitehall - Watts St
  '4616343', // West St S Battery Pl - BKN Bridge Manhattan Side
  '4616327', // West St S Battery Pl - FDR N Catherine Slip
  '4616326', // West St S Spring St - Battery Pl
  '4456494', // West St S Spring St - BBT Manhattan Portal outbound
  '4616336', // West St Watts St - 11th Ave Ganesvoort
  // 11th Ave
  '4616337', // 11th Ave N Ganesvoort - 12th Ave @ 40th St
  '4616325', // 11th Ave S Ganesvoort - West St @ Spring St
  // 12th Ave
  '4616323', // 12th Ave S 57th St - 45th St
  '4616324', // 12th Ave @ 45th - 11th Ave Ganesvoort
  '4616338', // 12th Ave N 40th - 57th St
];

export default function VehicleSpeedsZoneFetchAndChart() {
  const [monthly, setMonthly] = useState<MonthValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);

      try {
        // 2-week cache check
        const cached = readCache(CACHE_PREFIX, CACHE_KEY);
        if (cached?.datasetLastUpdate) {
          const cachedAt = Date.parse(cached.datasetLastUpdate);
          if (Number.isFinite(cachedAt) && Date.now() - cachedAt < CACHE_TTL_MS) {
            setMonthly(cached.monthly);
            setLoading(false);
            return;
          }
        }

        // Server-side aggregation: avg speed per month for CRZ corridor segments.
        const select = encodeURIComponent(
          "date_extract_y(data_as_of) || '-' || " +
          "case when date_extract_m(data_as_of) < 10 then '0' else '' end || " +
          "date_extract_m(data_as_of) AS month, " +
          "avg(speed::number) AS value"
        );

        const idList = CRZ_LINK_IDS.map(id => `'${id}'`).join(',');
        const whereRaw =
          `data_as_of >= '2025-01-01T00:00:00.000' ` +
          `AND speed::number > 0 ` +
          `AND speed::number < 60 ` +
          `AND link_id in (${idList})`;
        const where = encodeURIComponent(whereRaw);
        const group = encodeURIComponent('month');
        const order = encodeURIComponent('month');

        const url = `${BASE}?$select=${select}&$where=${where}&$group=${group}&$order=${order}&$limit=200`;
        const res = await fetch(url);
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status} ${res.statusText} — ${text.slice(0, 200)}`);
        }
        const rows: { month: string; value: string }[] = await res.json();
        if (cancelled) return;

        const parsed: MonthValue[] = rows
          .filter(r => r.month && Number.isFinite(Number(r.value)))
          .map(r => ({ month: r.month, value: Number(r.value) }));

        setMonthly(parsed);
        writeCache(CACHE_PREFIX, CACHE_KEY, {
          datasetLastUpdate: new Date().toISOString(),
          monthly: parsed,
        });
      } catch (err: any) {
        if (!cancelled) setError(String(err?.message ?? err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const cumulative = useMemo(() => buildCumulative(monthly, 'average'), [monthly]);

  return (
    <Layout
      title="Vehicle Speeds — Congestion Relief Zone"
      subtitle="Average vehicle speed on the West Side corridor (West St, 11th Ave, 12th Ave) inside the CRZ, by month."
      monthly={monthly}
      cumulative={cumulative}
      unit="mph"
      decimals={2}
      monthlyLabel="Monthly average vehicle speed (mph)"
      cumulativeLabel="Cumulative average vehicle speed (mph)"
      loading={loading}
      error={error}
    />
  );
}