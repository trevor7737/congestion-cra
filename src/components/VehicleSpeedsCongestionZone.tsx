import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

type AnyRow = Record<string, any>;
type HourAvg = { hour: number; avg_speed: number };

function formatHour(h: number) {
  const d = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const s = h < 12 ? 'AM' : 'PM';
  return `${d} ${s}`;
}

const BASE = 'https://data.ny.gov/resource/t6yz-b64h.json';
const LIMIT = 50000;

export default function VehicleSpeedsCongestionZone() {
  const [rows, setRows] = useState<AnyRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        let offset = 0;
        let all: AnyRow[] = [];

        while (true) {
          const select = encodeURIComponent('toll_date,hour_of_day,average_road_speed');
          const url = `${BASE}?$select=${select}&$limit=${LIMIT}&$offset=${offset}`;

          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);

          const page: AnyRow[] = await res.json();
          all = all.concat(page);

          if (page.length < LIMIT) break;
          offset += LIMIT;
        }

        setRows(all);
      } catch (e: any) {
        setError(String(e?.message ?? e));
      }
    })();
  }, []);

  /**
   * Aggregate:
   * 1) date + hour → avg speed
   * 2) average across dates per hour
   */
  const hourlyAvg = useMemo<HourAvg[]>(() => {
    const dateHour: Record<string, Record<number, number[]>> = {};

    for (const r of rows) {
      const dateMatch = String(r.toll_date ?? '').match(/\d{4}-\d{2}-\d{2}/);
      if (!dateMatch) continue;
      const date = dateMatch[0];

      const hour = Number(r.hour_of_day);
      const speed = Number(r.average_road_speed);

      if (!Number.isFinite(hour) || hour < 0 || hour > 23) continue;
      if (!Number.isFinite(speed)) continue;

      dateHour[date] ??= {};
      dateHour[date][hour] ??= [];
      dateHour[date][hour].push(speed);
    }

    const dates = Object.keys(dateHour);

    return Array.from({ length: 24 }, (_, h) => {
      let sum = 0;
      let count = 0;

      for (const d of dates) {
        const arr = dateHour[d][h];
        if (!arr || arr.length === 0) continue;

        const dailyAvg =
          arr.reduce((s: number, v: number) => s + v, 0) / arr.length;

        sum += dailyAvg;
        count += 1;
      }

      return {
        hour: h,
        avg_speed: count ? sum / count : 0,
      };
    });
  }, [rows]);

  return (
    <section style={{ padding: 18 }}>
      <h2>Vehicle speeds in the congestion pricing zone</h2>
      <p style={{ color: '#555' }}>
        Average road speed by hour of day (mph). Each hour reflects the average
        across available days and detection points.
      </p>

      {error && <div style={{ color: 'crimson' }}>{error}</div>}

      <div style={{ height: 380 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={hourlyAvg}
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
              label={{
                value: 'Average speed (mph)',
                angle: -90,
                position: 'left',
                offset: 8,
              }}
            />
            <Tooltip
              formatter={(v: any) => `${Number(v).toFixed(1)} mph`}
              labelFormatter={(l) => formatHour(Number(l))}
            />
            <Line
              dataKey="avg_speed"
              stroke="#2a6ebb"
              strokeWidth={2}
              dot={{ r: 3 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
