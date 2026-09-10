// scripts/test-monthly-fetch.js
import { fetchDailyHourRowsForMonth, fetchHourlyAveragesForMonth } from '../src/services/monthlyVehicleApi.js';

(async () => {
  try {
    console.log('Testing month: 2025-11');
    const rows = await fetchDailyHourRowsForMonth('2025-11');
    console.log('daily-hour rows sample:', rows.slice(0,10));
    const avg = await fetchHourlyAveragesForMonth('2025-11');
    console.log('hourly averages sample:', avg.slice(0,8));
  } catch (e) {
    console.error('Test error', e);
  }
})();
