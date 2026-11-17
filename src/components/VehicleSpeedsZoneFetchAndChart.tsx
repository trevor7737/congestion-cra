import React, { useMemo } from 'react';
import { buildCumulative } from '../utils/socrataCache';
import { useMonthlyData } from '../utils/useMonthlyData';
import { Layout } from './Layout';

// The road segments this chart covers (CRZ_LINK_IDS) are listed in
// src/scripts/update-data.mjs, which generates the data file.
export default function VehicleSpeedsZoneFetchAndChart() {
  const { monthly, updated, loading, error } = useMonthlyData('vehicle_speeds_monthly.json');
  const cumulative = useMemo(() => buildCumulative(monthly, 'average'), [monthly]);

  return (
    <Layout
      title="Vehicle Speeds — West Side Highway Corridor"
      subtitle="Average vehicle speed by month on the West Side Highway (West St, 11th Ave, 12th Ave) below 60th St. This road runs along the edge of the Congestion Relief Zone and is exempt from the toll."
      monthly={monthly}
      cumulative={cumulative}
      unit="mph"
      decimals={2}
      monthlyLabel="Monthly average vehicle speed (mph)"
      cumulativeLabel="Year-to-date average vehicle speed (mph)"
      updated={updated}
      loading={loading}
      error={error}
    />
  );
}
