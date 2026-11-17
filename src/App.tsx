import React, { useEffect, useState } from 'react';
import BusSpeedsFromHistory from './components/BusSpeedsFromHistory';
import VehicleEntriesByMonthTabs from './components/VehicleEntriesByMonthTabs';
import NoiseMonthlyTotals2025 from './components/NoiseMonthlyTotals2025';
import VehicleSpeedsZoneFetchAndChart from './components/VehicleSpeedsZoneFetchAndChart';

// To add a chart: create its component and add an entry here.
// The id is also the chart's embed address: ?chart=<id>
const TABS = [
  { id: 'bus', label: 'Bus Speeds', Component: BusSpeedsFromHistory },
  { id: 'entries', label: 'Vehicle Entries', Component: VehicleEntriesByMonthTabs },
  { id: 'noise', label: 'Noise Complaints', Component: NoiseMonthlyTotals2025 },
  { id: 'speeds', label: 'Vehicle Speeds', Component: VehicleSpeedsZoneFetchAndChart },
] as const;

type TabId = typeof TABS[number]['id'];

// Message type sent to the embedding page so it can size the iframe.
const HEIGHT_MESSAGE = 'crz-dashboard-height';

/**
 * Embed mode: "?chart=bus" (or entries, noise, speeds) shows that one chart
 * with no page header or tabs, for use inside an iframe in an article.
 */
function getEmbeddedTab() {
  const id = new URLSearchParams(window.location.search).get('chart');
  return TABS.find(t => t.id === id) ?? null;
}

/**
 * While embedded, tell the parent page how tall the content is whenever it
 * changes, so the parent can resize the iframe and avoid gaps or scrollbars.
 */
function useReportHeightToParent(enabled: boolean) {
  useEffect(() => {
    if (!enabled || window.parent === window) return;
    const send = () => {
      window.parent.postMessage(
        { type: HEIGHT_MESSAGE, height: document.documentElement.scrollHeight },
        '*',
      );
    };
    const observer = new ResizeObserver(send);
    observer.observe(document.body);
    send();
    return () => observer.disconnect();
  }, [enabled]);
}

export default function App() {
  const embedded = getEmbeddedTab();
  useReportHeightToParent(embedded !== null);

  if (embedded) {
    const EmbeddedChart = embedded.Component;
    return (
      <div className="app app-embed">
        <EmbeddedChart />
      </div>
    );
  }

  return <Dashboard />;
}

function Dashboard() {
  const [tab, setTab] = useState<TabId>('bus');
  const active = TABS.find(t => t.id === tab) ?? TABS[0];
  const ActiveChart = active.Component;

  return (
    <div className="app">
      <header>
        <h1>NYC Congestion Pricing Dashboard</h1>
        <p className="intro">
          Tracking how travel is changing in Manhattan's Congestion Relief Zone, the area
          at and below 60th Street where tolling began on January 5, 2025. The charts
          are refreshed twice a month from New York State and New York City open data.
        </p>
      </header>

      <div className="tabs" role="tablist" aria-label="Data categories">
        {TABS.map(t => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            role="tab"
            aria-selected={t.id === tab}
            aria-controls="tab-panel"
            className={t.id === tab ? 'tab tab-active' : 'tab'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <main id="tab-panel" role="tabpanel" aria-labelledby={`tab-${active.id}`}>
        <ActiveChart />
      </main>
    </div>
  );
}
