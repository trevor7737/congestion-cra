import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

type AggRow = {
  month: string;      // "YYYY-MM"
  hour: number;       // 0..23
  avg_speed: number;  // mph
  days?: number;      // optional count of contributing days
};

type HourPoint = { hour: number; avg_speed: number };

const DOT_BASE = 'https://data.cityofnewyork.us/resource/i4gi-tjb9.json';
const PAGE_LIMIT = 50000;
const LOCAL_PREFILTERED = '/data/vehicle_speeds_congestion_zone.json';

function formatHour(h: number) {
  const d = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const s = h < 12 ? 'AM' : 'PM';
  return `${d} ${s}`;
}

export default function VehicleSpeedsByMonthTabs() {
  const [rows, setRows] = useState<AggRow[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Load data: local prefiltered JSON first, DOT fallback if needed
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        // 1) Try local prefiltered file
        try {
          const resLocal = await fetch(LOCAL_PREFILTERED, { cache: 'no-store' });
          if (resLocal.ok) {
            const j = await resLocal.json();
            if (!cancelled && Array.isArray(j)) {
              setRows(j);
              return;
            }
          }
          throw new Error('Local file not available');
        } catch {
          // 2) DOT fallback (expects already-aggregated rows if you point it here)
          const select = encodeURIComponent('month,hour,avg_speed,days');
          const url = `${DOT_BASE}?$select=${select}&$limit=${PAGE_LIMIT}`;

          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
          const j = await res.json();

          if (!cancelled && Array.isArray(j)) {
            setRows(j);
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(String(e?.message ?? e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Derive month list
  useEffect(() => {
    if (!rows.length) return;
    const ms = Array.from(new Set(rows.map(r => r.month))).sort();
    setMonths(ms);
    setSelectedMonth(ms[ms.length - 1] ?? null);
  }, [rows]);

  // Build hourly series for selected month
  const hourlySeries = useMemo<HourPoint[]>(() => {
    if (!selectedMonth) {
      return Array.from({ length: 24 }, (_, h) => ({ hour: h, avg_speed: 0 }));
    }

    const map = new Map<number, number>();
    for (const r of rows) {
      if (r.month === selectedMonth) {
        map.set(Number(r.hour), Number(r.avg_speed));
      }
    }

    return Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      avg_speed: map.get(h) ?? 0,
    }));
  }, [rows, selectedMonth]);

  const daysCount = useMemo(() => {
    if (!selectedMonth) return null;
    const r = rows.find(x => x.month === selectedMonth);
    return r?.days ?? null;
  }, [rows, selectedMonth]);

  if (loading) {
    return (
      <section style={{ padding: 18 }}>
        <h2>Vehicle speeds — congestion zone</h2>
        <div style={{ padding: 16, border: '1px dashed #ccc', color: '#666' }}>
          Loading speed data…
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section style={{ padding: 18 }}>
        <h2>Vehicle speeds — congestion zone</h2>
        <div style={{ color: 'crimson' }}>Error: {error}</div>
      </section>
    );
  }

  return (
    <section style={{ padding: 18 }}>
      <h2>Vehicle speeds inside congestion pricing zone</h2>
      <p style={{ color: '#555', marginTop: 0 }}>
        Average vehicle speeds (mph) by hour of day. Select a month to view hourly patterns.
      </p>

      {/* Month tabs */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {months.map(m => (
          <button
            key={m}
            onClick={() => setSelectedMonth(m)}
            style={{
              padding: '8px 10px',
              borderRadius: 6,
              border: m === selectedMonth ? '2px solid #2a6ebb' : '1px solid #ddd',
              background: m === selectedMonth ? '#eaf2ff' : '#fff',
            }}
          >
            {m}{m === selectedMonth && daysCount ? ` • ${daysCount} days` : ''}
          </button>
        ))}
      </div>

      {/* Line chart */}
      <div style={{ height: 380 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={hourlySeries}
            margin={{ top: 8, right: 24, left: 64, bottom: 36 }}
          >
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.25} />
            <XAxis
              dataKey="hour"
              type="number"
              domain={[0, 23]}
              ticks={Array.from({ length: 24 }, (_, i) => i)}
              interval={0}
              tickFormatter={formatHour}
              label={{ value: 'Hour of day', position: 'bottom', offset: 12 }}
            />
            <YAxis
              label={{ value: 'Avg speed (mph)', angle: -90, position: 'left', offset: 8 }}
              allowDecimals
            />
            <Tooltip
              formatter={(v: any) => `${Number(v).toFixed(1)} mph`}
              labelFormatter={(l) => formatHour(Number(l))}
            />
            <Legend verticalAlign="top" />
            <Line
              dataKey="avg_speed"
              name="Avg speed (mph)"
              stroke="#2a6ebb"
              strokeWidth={2}
              dot={{ r: 3 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{ marginTop: 12, color: '#666' }}>
        <strong>Source:</strong> NYC DOT Traffic Speeds (NBE), filtered to road segments inside the
        congestion pricing zone and aggregated to month × hour.
      </div>
    </section>
  );
}
