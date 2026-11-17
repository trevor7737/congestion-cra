import React, { useMemo } from 'react';
import { buildCumulative } from '../utils/socrataCache';
import { useMonthlyData } from '../utils/useMonthlyData';
import { Layout } from './Layout';

export default function VehicleEntriesByMonthTabs() {
  const { monthly, updated, loading, error } = useMonthlyData('vehicle_entries_monthly.json');
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
      cumulativeLabel="Year-to-date entries"
      updated={updated}
      loading={loading}
      error={error}
    />
  );
}
