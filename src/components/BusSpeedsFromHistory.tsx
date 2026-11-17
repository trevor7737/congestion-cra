import React, { useMemo } from 'react';
import { buildCumulative } from '../utils/socrataCache';
import { useMonthlyData } from '../utils/useMonthlyData';
import { Layout } from './Layout';

export default function BusSpeedsFromHistory() {
  const { monthly, updated, loading, error } = useMonthlyData('bus_speeds_monthly.json');
  const cumulative = useMemo(() => buildCumulative(monthly, 'average'), [monthly]);

  return (
    <Layout
      title="Bus Speeds — Congestion Relief Zone"
      subtitle="Average bus speed between stops inside the CRZ, by month."
      monthly={monthly}
      cumulative={cumulative}
      unit="mph"
      decimals={2}
      monthlyLabel="Monthly average bus speed (mph)"
      cumulativeLabel="Year-to-date average bus speed (mph)"
      updated={updated}
      loading={loading}
      error={error}
    />
  );
}
