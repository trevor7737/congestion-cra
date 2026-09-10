// Shared utilities for caching, probing, and aggregating Socrata data
// across the four dashboard components.

export type MonthValue = {
  month: string;   // 'YYYY-MM'
  value: number;
};

export type CachedSeries = {
  datasetLastUpdate: string;
  monthly: MonthValue[];
};

// ============================================================
// CACHE: read/write per-component using a unique prefix
// ============================================================

export function readCache(prefix: string, key: string): CachedSeries | null {
  try {
    const raw = localStorage.getItem(prefix + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeCache(prefix: string, key: string, value: CachedSeries) {
  try {
    localStorage.setItem(prefix + key, JSON.stringify(value));
  } catch {
    // localStorage full or disabled; ignore
  }
}

// ============================================================
// PROBE: ask the dataset for its latest update timestamp
// ============================================================

export async function getDatasetLastUpdate(base: string): Promise<string | null> {
  try {
    const res = await fetch(`${base}?$select=max(:updated_at) AS last_update&$limit=1`);
    if (!res.ok) return null;
    const data = await res.json();
    return data[0]?.last_update ?? null;
  } catch {
    return null;
  }
}

// ============================================================
// AGGREGATION HELPERS
// ============================================================

/**
 * Build cumulative series given monthly values.
 * - 'sum': running total (for counts like entries/complaints)
 * - 'average': running average (for averages like speeds)
 */
export function buildCumulative(
  monthly: MonthValue[],
  rule: 'sum' | 'average'
): MonthValue[] {
  if (rule === 'sum') {
    let running = 0;
    return monthly.map(m => {
      running += m.value;
      return { month: m.month, value: running };
    });
  } else {
    let runningSum = 0;
    let runningCount = 0;
    return monthly.map(m => {
      runningSum += m.value;
      runningCount += 1;
      return { month: m.month, value: runningSum / runningCount };
    });
  }
}

// ============================================================
// BASELINE / PERCENTAGE LOGIC
// ============================================================

/**
 * Find the most recent fully-completed year in the data.
 * "Completed" means there's an entry for December.
 */
export function findCompletedBaselineYear(monthly: MonthValue[]): number | null {
  const years = Array.from(new Set(monthly.map(m => Number(m.month.slice(0, 4)))));
  const completed = years.filter(y =>
    monthly.some(m => m.month === `${y}-12`)
  );
  if (completed.length === 0) return null;
  return Math.max(...completed);
}

/**
 * Compute the average value of all months in a given year.
 */
export function computeYearBaseline(monthly: MonthValue[], year: number): number {
  const ofYear = monthly.filter(m => m.month.startsWith(`${year}-`));
  if (ofYear.length === 0) return 0;
  return ofYear.reduce((s, m) => s + m.value, 0) / ofYear.length;
}

/**
 * Build a percentage-vs-baseline series.
 * Uses the most recent fully-completed year, falls back to current year.
 */
export function buildPercentages(monthly: MonthValue[]): {
  series: MonthValue[];
  baselineYear: number;
  baselineValue: number;
} {
  const currentYear = new Date().getFullYear();
  const completedYear = findCompletedBaselineYear(monthly);
  const baselineYear = completedYear ?? currentYear;
  const baselineValue = computeYearBaseline(monthly, baselineYear);

  const series = monthly.map(m => ({
    month: m.month,
    value: baselineValue > 0
      ? ((m.value - baselineValue) / baselineValue) * 100
      : 0,
  }));

  return { series, baselineYear, baselineValue };
}

/**
 * Filter monthly values to only include years >= minYear.
 */
export function filterFromYear(monthly: MonthValue[], minYear: number): MonthValue[] {
  return monthly.filter(m => Number(m.month.slice(0, 4)) >= minYear);
}

// ============================================================
// LABEL FORMATTING
// ============================================================

/**
 * Format a 'YYYY-MM' string into a short month name (e.g., 'Jan').
 */
export function monthLabel(monthStr: string): string {
  const parts = String(monthStr).split('-');
  if (parts.length < 2) return monthStr;
  const mm = parts[1];
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return names[Number(mm) - 1] ?? monthStr;
}