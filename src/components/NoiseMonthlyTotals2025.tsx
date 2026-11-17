import React, { useMemo } from 'react';
import { buildCumulative } from '../utils/socrataCache';
import { useMonthlyData } from '../utils/useMonthlyData';
import { Layout } from './Layout';

export default function NoiseMonthlyTotals2025() {
  const { monthly, updated, loading, error } = useMonthlyData('noise_complaints_monthly.json');
  const cumulative = useMemo(() => buildCumulative(monthly, 'sum'), [monthly]);

  return (
    <Layout
      title="Noise Complaints"
      subtitle="311 noise complaints citywide, by month."
      monthly={monthly}
      cumulative={cumulative}
      unit="complaints"
      decimals={0}
      monthlyLabel="Monthly noise complaints"
      cumulativeLabel="Year-to-date noise complaints"
      updated={updated}
      loading={loading}
      error={error}
    />
  );
}
