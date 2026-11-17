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
  updated?: string | null;   // ISO timestamp of the last data refresh
  loading: boolean;
  error: string | null;
};

export function Layout({
  title, subtitle, monthly, cumulative, unit, decimals,
  monthlyLabel, cumulativeLabel, updated, loading, error,
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
    <section className="chart-section">
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <p style={{ color: '#555', marginTop: 0 }}>{subtitle}</p>
      {updated && (
        <p style={{ color: '#666', fontSize: 13, marginTop: 0 }}>
          Data last updated {new Date(updated).toLocaleDateString(undefined, { dateStyle: 'long' })}.
        </p>
      )}

      {loading && <div role="status" style={{ color: '#555' }}>Loading…</div>}
      {error && <div role="alert" style={{ color: '#b00020' }}>Error: {error}</div>}

      {!loading && !error && monthly.length > 0 && (
        <>
          <div style={{
            display: 'flex', gap: 16, alignItems: 'center',
            marginBottom: 16, flexWrap: 'wrap',
          }}>
            <div role="group" aria-label="Chart values" style={{
              display: 'inline-flex', borderRadius: 6,
              overflow: 'hidden', border: '1px solid #ccc',
            }}>
              <button
                aria-pressed={viewMode === 'raw'}
                onClick={() => setViewMode('raw')}
                style={{
                  padding: '6px 12px',
                  background: viewMode === 'raw' ? '#1f5fa8' : 'white',
                  color: viewMode === 'raw' ? 'white' : '#333',
                  border: 'none', cursor: 'pointer',
                  fontWeight: viewMode === 'raw' ? 600 : 400,
                }}
              >
                Raw values
              </button>
              <button
                aria-pressed={viewMode === 'percent'}
                onClick={() => setViewMode('percent')}
                style={{
                  padding: '6px 12px',
                  background: viewMode === 'percent' ? '#1f5fa8' : 'white',
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

            <div style={{ color: '#555', fontSize: 13 }}>
              Baseline: <strong>{baselineYear}</strong> avg = {baselineValue.toFixed(decimals)} {unit}
            </div>
          </div>

          {viewMode === 'raw' ? (
            <div className="chart-grid">
              <ChartCard
                title={monthlyLabel}
                legendLabel={`Each month (${unit})`}
                data={monthlyFiltered}
                unit={unit}
                decimals={decimals}
                color={COLOR_MONTHLY}
              />
              <ChartCard
                title={cumulativeLabel}
                legendLabel={`Year to date (${unit})`}
                data={cumulativeFiltered}
                unit={unit}
                decimals={decimals}
                color={COLOR_CUMULATIVE}
              />
            </div>
          ) : (
            <ChartCard
              title={`% vs ${baselineYear} baseline`}
              legendLabel=""
              data={percentFiltered}
              unit="%"
              decimals={1}
              color={COLOR_MONTHLY}
              isPercentage
            />
          )}
        </>
      )}
    </section>
  );
}

// ============================================================
// COLOURS
// ============================================================

// Blue and orange stay distinguishable for colour-blind readers
// (unlike red/green). In the percent view, bar direction also shows the sign.
const COLOR_MONTHLY = '#1f5fa8';
const COLOR_CUMULATIVE = '#a3501a';
const COLOR_ABOVE = '#1f5fa8';
const COLOR_BELOW = '#d9822b';

// ============================================================
// TEXT HELPERS
// ============================================================

/** 'YYYY-MM' -> 'Jan 2025' */
function monthYear(m: string): string {
  return `${monthLabel(m)} ${m.slice(0, 4)}`;
}

function formatValue(n: number, unit: string, decimals: number, isPercentage: boolean): string {
  if (isPercentage) return `${n > 0 ? '+' : ''}${n.toFixed(decimals)}%`;
  const num = n.toLocaleString(undefined, {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  });
  return `${num} ${unit}`;
}

/** One-sentence description of a chart for screen-reader users. */
function describeChart(
  title: string, data: MonthValue[], unit: string, decimals: number, isPercentage: boolean,
): string {
  if (data.length === 0) return `${title}. No data.`;
  const fmt = (d: MonthValue) => `${formatValue(d.value, unit, decimals, isPercentage)} in ${monthYear(d.month)}`;
  const first = data[0];
  const last = data[data.length - 1];
  const low = data.reduce((a, b) => (b.value < a.value ? b : a));
  const high = data.reduce((a, b) => (b.value > a.value ? b : a));
  return (
    `${title}. Bar chart of ${data.length} months, ${monthYear(first.month)} to ${monthYear(last.month)}. ` +
    `Latest: ${fmt(last)}. Lowest: ${fmt(low)}. Highest: ${fmt(high)}.`
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

function ChartCard({ title, legendLabel, data, unit, decimals, color, isPercentage = false }: {
  title: string;
  legendLabel: string;
  data: MonthValue[];
  unit: string;
  decimals: number;
  color: string;
  isPercentage?: boolean;
}) {
  const domain: [number, number] = isPercentage
    ? computePercentDomain(data)
    : computeRawDomain(data);

  const legend = isPercentage
    ? [
        { color: COLOR_ABOVE, label: 'Above baseline' },
        { color: COLOR_BELOW, label: 'Below baseline' },
      ]
    : [{ color, label: legendLabel }];

  return (
    <div style={{
      background: '#fafafa',
      border: '1px solid #eee',
      borderRadius: 8,
      padding: 12,
    }}>
      <h3 style={{ margin: '0 0 8px 0', fontSize: 14, color: '#333' }}>{title}</h3>
      <ul className="chart-legend">
        {legend.map(item => (
          <li key={item.label}>
            <span className="chart-legend-swatch" style={{ background: item.color }} aria-hidden="true" />
            {item.label}
          </li>
        ))}
      </ul>
      <div
        role="img"
        aria-label={describeChart(title, data, unit, decimals, isPercentage)}
        style={{ height: 320 }}
      >
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
              formatter={(v: any) => [
                formatValue(Number(v), unit, decimals, isPercentage),
                isPercentage ? 'Change vs baseline' : legendLabel,
              ]}
              labelFormatter={(l) => monthYear(String(l))}
            />
            <Bar dataKey="value" isAnimationActive={false} radius={[4, 4, 0, 0]}>
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={
                    isPercentage
                      ? entry.value >= 0 ? COLOR_ABOVE : COLOR_BELOW
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