'use strict';

// Pulls the latest median home value per state from Zillow's Home Value
// Index (ZHVI), state-level, all homes, smoothed/seasonally adjusted — a
// free monthly CSV, no API key required. Verified directly against the
// live file (52 rows: header + 50 states + DC; columns RegionID, SizeRank,
// RegionName, RegionType, StateName, then one column per month). Runs on a
// schedule (see .github/workflows/update-state-home-prices.yml) and commits
// the result as a static JSON file the site reads same-origin at runtime,
// exactly like update-mortgage-rates.js/mortgage-rates.json.
//
// Zillow has changed this file's path before — if this script starts
// failing, check https://www.zillow.com/research/data/ for the current
// state-level ZHVI CSV location.

const fs = require('fs');
const path = require('path');

const CSV_URL = 'https://files.zillowstatic.com/research/public_csvs/zhvi/State_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv';

// Zillow rows key by full state name ("California"), not postal code —
// invert market-map-data.js's own name map rather than hardcoding a second
// state-name list here.
const STATE_MARKET_DATA = require('../market-map-data.js');
const NAME_TO_CODE = {};
Object.keys(STATE_MARKET_DATA.states).forEach(function (code) {
  NAME_TO_CODE[STATE_MARKET_DATA.states[code].name] = code;
});

// Minimal CSV line splitter — sufficient here since Zillow's state-level
// file has no quoted/comma-containing fields (verified against the live
// file), but guards against a stray quoted field rather than assuming.
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

async function main() {
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error('Zillow ZHVI fetch failed: ' + res.status);
  const csv = (await res.text()).trim();
  const lines = csv.split('\n').filter(Boolean);
  if (lines.length < 2) throw new Error('Zillow ZHVI CSV had no data rows');

  const header = splitCsvLine(lines[0]);
  const regionNameIdx = header.indexOf('RegionName');
  const regionTypeIdx = header.indexOf('RegionType');
  // Find date columns by shape (YYYY-MM-DD), not by position relative to
  // the other columns — Zillow has inserted new metadata columns (e.g.
  // StateName) between the identifying columns and the first date column
  // before, so a positional assumption would silently misparse.
  const firstDateIdx = header.findIndex(function (h) { return /^\d{4}-\d{2}-\d{2}$/.test(h); });
  // Shape-validate before trusting the rest of the parse — fail loudly if
  // Zillow's column layout ever changes, rather than silently committing
  // garbage.
  if (regionNameIdx === -1 || regionTypeIdx === -1 || firstDateIdx === -1) {
    throw new Error('Unexpected Zillow CSV header — missing RegionName/RegionType/date columns. Header was: ' + lines[0]);
  }

  const states = {};
  let matchedRows = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = splitCsvLine(lines[i]);
    if (row[regionTypeIdx] !== 'state') continue;
    const name = row[regionNameIdx];
    const code = NAME_TO_CODE[name];
    if (!code) continue; // unrecognized region name — skip rather than guess

    // Walk backward from the most recent month in case it's blank (no
    // observation published yet for that state this cycle).
    let value = null;
    let date = null;
    for (let c = row.length - 1; c >= firstDateIdx; c--) {
      const raw = row[c];
      const num = parseFloat(raw);
      if (raw && !isNaN(num)) {
        value = Math.round(num);
        date = header[c];
        break;
      }
    }
    states[code] = { value: value, date: date };
    matchedRows++;
  }

  const expectedCount = Object.keys(STATE_MARKET_DATA.states).length;
  if (matchedRows < expectedCount) {
    const missing = Object.keys(STATE_MARKET_DATA.states).filter(function (c) { return !states[c]; });
    throw new Error('Only matched ' + matchedRows + ' of ' + expectedCount + ' states. Missing: ' + missing.join(', '));
  }

  const mostRecentDate = Object.keys(states).reduce(function (latest, code) {
    const d = states[code].date;
    return (d && (!latest || d > latest)) ? d : latest;
  }, null);

  const out = {
    updated: mostRecentDate,
    source: 'Zillow Home Value Index (ZHVI), state, all homes, smoothed/seasonally adjusted',
    sourceUrl: 'https://www.zillow.com/research/data/',
    states: states
  };

  const outPath = path.join(__dirname, '..', 'state-home-prices.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
  console.log('Wrote ' + outPath + ' (' + matchedRows + ' states)');
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
