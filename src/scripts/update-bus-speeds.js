// src/scripts/update-bus-speeds.js
// ES module. Node 18+ recommended.
import fs from 'fs/promises';
import axios from 'axios';

const DATA_DIR = './data';
const HISTORY_FILE = DATA_DIR + '/bus_speeds_history.json';
const LAST_FILE = DATA_DIR + '/last_timestamp.txt';

const BASE = process.env.SOCRATA_BASE || 'https://data.ny.gov/resource/kufs-yh3x.json';
const APP_TOKEN = process.env.SOCRATA_APP_TOKEN || '';
const LIMIT = Number(process.env.FETCH_LIMIT || 50000);
const SLEEP_MS = Number(process.env.PAGE_SLEEP_MS || 300);

async function readLastTimestamp() {
  try {
    return (await fs.readFile(LAST_FILE, 'utf8')).trim() || null;
  } catch {
    return null;
  }
}

async function writeLastTimestamp(ts) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(LAST_FILE, ts, 'utf8');
}

async function readExistingHistory() {
  try {
    const txt = await fs.readFile(HISTORY_FILE, 'utf8');
    return JSON.parse(txt);
  } catch {
    return [];
  }
}

async function writeHistory(rows) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(HISTORY_FILE, JSON.stringify(rows, null, 2), 'utf8');
}

/** polite sleep */
function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

/** Low-level request with headers */
async function rawGet(url) {
  const headers = APP_TOKEN ? { 'X-App-Token': APP_TOKEN } : {};
  console.log('[update] GET', url);
  const res = await axios.get(url, { headers, timeout: 60000 });
  return res.data;
}

/** Fetch all pages (paginated) after `since` (ISO timestamp or null) */
async function fetchAllNew(since) {
  const all = [];
  let offset = 0;
  while (true) {
    const wherePart = since ? `?$where=${encodeURIComponent(`timestamp > '${since}'`)}` : `?`;
    const q = `${wherePart}&$limit=${LIMIT}&$offset=${offset}`;
    const url = BASE + q;
    const rows = await rawGet(url);
    if (!Array.isArray(rows) || rows.length === 0) {
      console.log('[update] no more rows (page empty).');
      break;
    }
    console.log('[update] page rows:', rows.length, 'offset:', offset);
    all.push(...rows);
    if (rows.length < LIMIT) break;
    offset += LIMIT;
    // brief sleep to avoid hammering the API
    await sleep(SLEEP_MS);
  }
  return all;
}

function makeKey(r) {
  // unique-ish key: timestamp + route_id + timepoint_stop_id (fallback if missing)
  return [
    r.timestamp ?? '',
    r.route_id ?? '',
    (r.timepoint_stop_id ?? r.timepoint_stop_name ?? '')
  ].join('|');
}

async function main() {
  try {
    const last = await readLastTimestamp();
    console.log('[update] last timestamp:', last || '(none)');

    const existing = await readExistingHistory();
    console.log('[update] existing history rows:', existing.length);

    const newRows = await fetchAllNew(last);
    console.log('[update] total fetched rows (all pages):', newRows.length);

    if (!newRows.length) {
      console.log('[update] no new rows to append. Exiting.');
      return;
    }

    // dedupe against existing
    const existingKeys = new Set(existing.map(makeKey));
    const toAppend = [];
    for (const r of newRows) {
      const k = makeKey(r);
      if (!existingKeys.has(k)) {
        toAppend.push(r);
        existingKeys.add(k);
      }
    }

    if (!toAppend.length) {
      console.log('[update] no unique rows after dedupe. Exiting.');
      return;
    }

    const combined = existing.concat(toAppend);
    await writeHistory(combined);

    // compute newest timestamp from combined (or newly appended)
    const candidateTs = toAppend
      .map(r => r.timestamp)
      .concat(combined.map(r => r.timestamp))
      .filter(Boolean)
      .map(String)
      .sort();
    const newest = candidateTs.length ? candidateTs[candidateTs.length - 1] : null;

    if (newest) {
      await writeLastTimestamp(newest);
      console.log(`[update] appended ${toAppend.length} rows. history total=${combined.length}. new last=${newest}`);
    } else {
      console.log('[update] appended rows but could not determine newest timestamp.');
    }
  } catch (err) {
    console.error('[update] error', err?.response?.data ?? err?.message ?? err);
    process.exitCode = 1;
  }
}

main();
