import React, { useEffect, useMemo, useState } from 'react';
import {
  readCache, writeCache,
  buildCumulative, MonthValue,
} from '../utils/socrataCache';
import { Layout } from './Layout';

const BASE = 'https://data.ny.gov/resource/t6yz-b64h.json';
const CACHE_PREFIX = 'crz_entries_v3:';
const CACHE_KEY = 'monthly';
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;  // 2 weeks

export default function VehicleEntriesByMonthTabs() {
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

        // Sum CRZ entries per month
        const select = encodeURIComponent(
          "date_extract_y(toll_date) || '-' || " +
          "case when date_extract_m(toll_date) < 10 then '0' else '' end || " +
          "date_extract_m(toll_date) AS month, " +
          "sum(crz_entries) AS value"
        );
        const group = encodeURIComponent('month');
        const order = encodeURIComponent('month');

        const url = `${BASE}?$select=${select}&$group=${group}&$order=${order}&$limit=200`;
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

  const cumulative = useMemo(() => buildCumulative(monthly, 'sum'), [monthly]);

  return (
    <Layout
      title="Vehicle Entries — Congestion Relief Zone"
      subtitle="Total vehicles entering the CRZ each month."
      monthly={monthly}
      cumulative={cumulative}
      unit="entries"
      decimals={0}
      monthlyLabel="Monthly entries"
      cumulativeLabel="Cumulative entries (year-to-date)"
      loading={loading}
      error={error}
    />
  );
}