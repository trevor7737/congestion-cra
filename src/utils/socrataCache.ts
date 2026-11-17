// Shared helpers for aggregating and labelling the monthly series
// used by the four dashboard components.

export type MonthValue = {
  month: string;   // 'YYYY-MM'
  value: number;
};

// ============================================================
// AGGREGATION HELPERS
// ============================================================

/**
 * Build a year-to-date series from monthly values. The running figure
 * restarts each January, so every bar covers only its own calendar year.
 * - 'sum': running total (for counts like entries/complaints)
 * - 'average': running average of the monthly values (for speeds)
 * Expects `monthly` sorted by month.
 */
export function buildCumulative(
  monthly: MonthValue[],
  rule: 'sum' | 'average'
): MonthValue[] {
  let year = '';
  let runningSum = 0;
  let runningCount = 0;
  return monthly.map(m => {
    const y = m.month.slice(0, 4);
    if (y !== year) {
      year = y;
      runningSum = 0;
      runningCount = 0;
    }
    runningSum += m.value;
    runningCount += 1;
    return {
      month: m.month,
      value: rule === 'sum' ? runningSum : runningSum / runningCount,
    };
  });
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