import React, { useEffect, useMemo, useState } from 'react';
import {
  readCache, writeCache,
  buildCumulative, MonthValue,
} from '../utils/socrataCache';
import { Layout } from './Layout';

const BASE = 'https://data.ny.gov/resource/kufs-yh3x.json';
const CACHE_PREFIX = 'bus_speeds_v3:';
const CACHE_KEY = 'monthly';
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;  // 2 weeks

export default function BusSpeedsFromHistory() {
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

        // Server-side aggregation: avg bus speed per month, 2025 onward.
        const select = encodeURIComponent(
          "date_extract_y(timestamp) || '-' || " +
          "case when date_extract_m(timestamp) < 10 then '0' else '' end || " +
          "date_extract_m(timestamp) AS month, " +
          "avg(average_road_speed) AS value"
        );
        const where = encodeURIComponent("timestamp >= '2025-01-01T00:00:00.000'");
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
      title="Bus Speeds"
      subtitle="Average bus road speed by month."
      monthly={monthly}
      cumulative={cumulative}
      unit="mph"
      decimals={2}
      monthlyLabel="Monthly average bus speed (mph)"
      cumulativeLabel="Cumulative average bus speed (mph)"
      loading={loading}
      error={error}
    />
  );
}