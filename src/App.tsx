import React, { useState } from 'react';
import BusSpeedsFromHistory from './components/BusSpeedsFromHistory';
//import VehicleEntriesRaw from './components/VehicleEntriesRaw';
import VehicleEntriesByMonthTabs from './components/VehicleEntriesByMonthTabs';
//import NoiseComplaintsByNeighborhood from './components/NoiseComplaintsByNeighborhood';
//import TestNoiseFetch10 from './components/TestNoiseFetch10';
//import NoiseByCommunityDistrict from './components/NoiseByCommunityDistrict';
//import NoiseMonthlyTotals from './components/NoiseMonthlyTotals';
import NoiseMonthlyTotals2025 from './components/NoiseMonthlyTotals2025';
//import VehicleSpeedsCongestionZone from './components/VehicleSpeedsCongestionZone';
//import TestSpeedsZone10 from './components/TestSpeedsZone10';
//import VehicleSpeedsByMonthTabs from './components/VehicleSpeedsByMonthTabs';
import VehicleSpeedsZoneFetchAndChart from './components/VehicleSpeedsZoneFetchAndChart';

//starts January 5th





export default function App() {
  const [tab, setTab] = useState<'bus' | 'monthly' | 'noise-2025'| /*'speeds'|'speed-test'|'speeds-month-test'|*/ 'speeds-test-month'>('bus');

  return (
    <div style={{ padding: 20 }}>
      <h1>NYC Congestion Pricing Dashboard</h1>

      <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {/*<button onClick={() => setTab('raw')}>Raw CRZ Entries</button>*/}
        <button onClick={() => setTab('bus')}>Bus Speeds</button>
        <button onClick={() => setTab('monthly')}>Vehicles Entering the NYC Congestion Pricing Zone</button>
        {/*<button onClick={() => setTab('complaints')}>Avg Complaints (Hours)</button>
        <button onClick={() => setTab('noise-test')}>Noise Test (10)</button>
        <button onClick={() => setTab('noise-community')}>Noise by Community (10)</button>
        <button onClick={() => setTab('noise-month')}>Noise monthly complaints (monthly)</button>*/}
        <button onClick={() => setTab('noise-2025')}>Noise Complaints</button>
        {/*<button onClick={() => setTab('speeds')}>Vehicle speeds in the NYC Congestion Pricing Zone</button>*/}
        <button onClick={() => setTab('speeds-test-month')}>Average Vehicle Speeds in NYC Congestion Pricing Zone</button>
      </div>

      <div>
        {/*tab === 'raw' && <VehicleEntriesRaw />*/}
        {tab === 'bus' && <BusSpeedsFromHistory />}
        {tab === 'monthly' && <VehicleEntriesByMonthTabs />}
        {/*{tab === 'complaints' && <NoiseComplaintsByNeighborhood />}
        {tab === 'noise-test' && <TestNoiseFetch10 />}
        {tab === 'noise-community' && <NoiseByCommunityDistrict/>}
        {tab === 'noise-month' && <NoiseMonthlyTotals />}*/}
        {tab === 'noise-2025' && <NoiseMonthlyTotals2025 />}
        {/*tab === 'speeds' && <VehicleSpeedsCongestionZone />}
        {tab === 'speed-test' && <TestSpeedsZone10 />}
        {tab === 'speeds-month-test' && <VehicleSpeedsByMonthTabs />*/}
        {tab === 'speeds-test-month' && <VehicleSpeedsZoneFetchAndChart />}


      </div>
    </div>
  );
}
