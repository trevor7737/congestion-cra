import React, { useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import {
  buildPercentages, findCompletedBaselineYear, filterFromYear, monthLabel, MonthValue,
} from '../utils/socrataCache';

type LayoutProps = {
  title: string;
  subtitle: string;
  monthly: MonthValue[];
  cumulative: MonthValue[];
  unit: string;
  decimals: number;
  monthlyLabel: string;
  cumulativeLabel: string;
  loading: boolean;
  error: string | null;
};

export function Layout({
  title, subtitle, monthly, cumulative, unit, decimals,
  monthlyLabel, cumulativeLabel, loading, error,
}: LayoutProps) {
  const [viewMode, setViewMode] = useState<'raw' | 'percent'>('raw');
  const [showBaseline, setShowBaseline] = useState<boolean>(false);

  const { series: percentSeries, baselineYear, baselineValue } = buildPercentages(monthly);
  const completedYear = findCompletedBaselineYear(monthly);

  const currentYear = new Date().getFullYear();
  const minYear = showBaseline ? baselineYear : currentYear;

  const monthlyFiltered = filterFromYear(monthly, minYear);
  const cumulativeFiltered = filterFromYear(cumulative, minYear);
  const percentFiltered = filterFromYear(percentSeries, minYear);

  return (
    <section style={{ padding: 18 }}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <p style={{ color: '#555', marginTop: 0 }}>{subtitle}</p>

      {loading && <div style={{ color: '#666' }}>Loading…</div>}
      {error && <div style={{ color: 'crimson' }}>Error: {error}</div>}

      {!loading && !error && monthly.length > 0 && (
        <>
          <div style={{
            display: 'flex', gap: 16, alignItems: 'center',
            marginBottom: 16, flexWrap: 'wrap',
          }}>
            <div style={{
              display: 'inline-flex', borderRadius: 6,
              overflow: 'hidden', border: '1px solid #ccc',
            }}>
              <button
                onClick={() => setViewMode('raw')}
                style={{
                  padding: '6px 12px',
                  background: viewMode === 'raw' ? '#2a6ebb' : 'white',
                  color: viewMode === 'raw' ? 'white' : '#333',
                  border: 'none', cursor: 'pointer',
                  fontWeight: viewMode === 'raw' ? 600 : 400,
                }}
              >
                Raw values
              </button>
              <button
                onClick={() => setViewMode('percent')}
                style={{
                  padding: '6px 12px',
                  background: viewMode === 'percent' ? '#2a6ebb' : 'white',
                  color: viewMode === 'percent' ? 'white' : '#333',
                  border: 'none', cursor: 'pointer',
                  fontWeight: viewMode === 'percent' ? 600 : 400,
                }}
              >
                % vs baseline
              </button>
            </div>

            {completedYear && (
              <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showBaseline}
                  onChange={(e) => setShowBaseline(e.target.checked)}
                />
                <span>Show baseline year ({baselineYear})</span>
              </label>
            )}

            <div style={{ color: '#666', fontSize: 13 }}>
              Baseline: <strong>{baselineYear}</strong> avg = {baselineValue.toFixed(decimals)} {unit}
            </div>
          </div>

          {viewMode === 'raw' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <ChartCard
                title={monthlyLabel}
                data={monthlyFiltered}
                unit={unit}
                decimals={decimals}
                color="#2a6ebb"
              />
              <ChartCard
                title={cumulativeLabel}
                data={cumulativeFiltered}
                unit={unit}
                decimals={decimals}
                color="#b65"
              />
            </div>
          ) : (
            <ChartCard
              title={`% vs ${baselineYear} baseline`}
              data={percentFiltered}
              unit="%"
              decimals={1}
              color="#2a6ebb"
              isPercentage
            />
          )}
        </>
      )}
    </section>
  );
}

// ============================================================
// AXIS SCALING HELPERS
// ============================================================

/**
 * Raw values: start at 0 so bar heights are truthful, with ~15% padding
 * on top so the tallest bar doesn't touch the chart edge.
 */
function computeRawDomain(data: MonthValue[]): [number, number] {
  if (data.length === 0) return [0, 1];
  const max = Math.max(...data.map(d => d.value));
  if (max <= 0) return [0, 1];

  const padded = max * 1.15;
  return [0, niceCeiling(padded)];
}

/**
 * Percentages: symmetric around 0, padded ~20%, with a minimum range
 * of ±5% so tiny shifts don't look enormous.
 */
function computePercentDomain(data: MonthValue[]): [number, number] {
  if (data.length === 0) return [-10, 10];
  const absMax = Math.max(...data.map(d => Math.abs(d.value)));
  const padded = Math.max(absMax * 1.2, 5);
  const niceMax = niceCeiling(padded);
  return [-niceMax, niceMax];
}

/**
 * Round a value up to a "nice" number (1, 2, 2.5, 5, 10, 20, 50, ...).
 * Makes axis labels read cleanly instead of "0.847" or "4,727,381".
 */
function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  let niceNormalized: number;
  if (normalized <= 1) niceNormalized = 1;
  else if (normalized <= 2) niceNormalized = 2;
  else if (normalized <= 2.5) niceNormalized = 2.5;
  else if (normalized <= 5) niceNormalized = 5;
  else niceNormalized = 10;
  return niceNormalized * magnitude;
}

/**
 * Format raw axis ticks for readability.
 * Big numbers get shortened (1,237,492 -> 1.2M).
 * Speeds get one decimal (8.4 mph).
 * Everything else is rounded.
 */
function formatRawTick(value: number, unit: string): string {
  const v = Number(value);
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 10_000) return `${(v / 1000).toFixed(0)}K`;
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}K`;
  if (unit === 'mph') return v.toFixed(1);
  return String(Math.round(v));
}

// ============================================================
// CHART CARD
// ============================================================

function ChartCard({ title, data, unit, decimals, color, isPercentage = false }: {
  title: string;
  data: MonthValue[];
  unit: string;
  decimals: number;
  color: string;
  isPercentage?: boolean;
}) {
  const domain: [number, number] = isPercentage
    ? computePercentDomain(data)
    : computeRawDomain(data);

  return (
    <div style={{
      background: '#fafafa',
      border: '1px solid #eee',
      borderRadius: 8,
      padding: 12,
    }}>
      <h3 style={{ margin: '0 0 8px 0', fontSize: 14, color: '#333' }}>{title}</h3>
      <div style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 24 }}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.25} vertical={false} />
            <XAxis
              dataKey="month"
              tickFormatter={(m) => {
                const parts = String(m).split('-');
                const yy = parts[0]?.slice(2) ?? '';
                return `${monthLabel(String(m))} '${yy}`;
              }}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              domain={domain}
              tickFormatter={isPercentage
                ? (v) => `${v > 0 ? '+' : ''}${Number(v).toFixed(0)}%`
                : (v) => formatRawTick(Number(v), unit)}
              width={isPercentage ? 50 : 70}
            />
            {isPercentage && (
              <ReferenceLine y={0} stroke="#666" strokeDasharray="3 3" />
            )}
            <Tooltip
              cursor={{ fill: 'rgba(0,0,0,0.04)' }}
              formatter={(v: any) => {
                const n = Number(v);
                if (isPercentage) {
                  return `${n > 0 ? '+' : ''}${n.toFixed(decimals)}%`;
                }
                return `${n.toFixed(decimals)} ${unit}`;
              }}
              labelFormatter={(l) => {
                const parts = String(l).split('-');
                const yyyy = parts[0] ?? '';
                return `${monthLabel(String(l))} ${yyyy}`;
              }}
            />
            <Bar dataKey="value" isAnimationActive={false} radius={[4, 4, 0, 0]}>
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={
                    isPercentage
                      ? entry.value >= 0
                        ? '#3a8c3a'   // green for above baseline
                        : '#c54a4a'   // red for below baseline
                      : color
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}