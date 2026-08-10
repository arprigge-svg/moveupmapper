'use strict';

// Pulls the latest 30-year and 15-year fixed mortgage rates from Freddie
// Mac's Primary Mortgage Market Survey (PMMS), via FRED's public CSV export
// (no API key required). FRED's endpoints don't send CORS headers, so this
// can't be fetched from the browser directly — this script runs on a
// schedule (see .github/workflows/update-mortgage-rates.yml) and commits
// the result as a static JSON file the site reads same-origin at runtime.

const fs = require('fs');
const path = require('path');

const SERIES = {
  thirtyYear: 'MORTGAGE30US',
  fifteenYear: 'MORTGAGE15US'
};

async function fetchLatest(seriesId) {
  const url = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=' + seriesId;
  const res = await fetch(url);
  if (!res.ok) throw new Error('FRED fetch failed for ' + seriesId + ': ' + res.status);
  const csv = (await res.text()).trim();
  const lines = csv.split('\n').filter(Boolean);
  // Walk backward from the end in case the most recent row is a "." (no
  // observation yet for that week) rather than assuming the last line is
  // always a valid value.
  for (let i = lines.length - 1; i > 0; i--) {
    const [date, value] = lines[i].split(',');
    const rate = parseFloat(value);
    if (date && !isNaN(rate)) return { date, rate };
  }
  throw new Error('No valid observation found for ' + seriesId);
}

async function main() {
  const [thirty, fifteen] = await Promise.all([
    fetchLatest(SERIES.thirtyYear),
    fetchLatest(SERIES.fifteenYear)
  ]);

  const out = {
    thirtyYear: thirty.rate,
    thirtyYearDate: thirty.date,
    fifteenYear: fifteen.rate,
    fifteenYearDate: fifteen.date,
    updated: thirty.date > fifteen.date ? thirty.date : fifteen.date,
    source: 'Freddie Mac Primary Mortgage Market Survey (PMMS), via FRED',
    sourceUrl: 'https://fred.stlouisfed.org/series/MORTGAGE30US'
  };

  const outPath = path.join(__dirname, '..', 'mortgage-rates.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
  console.log('Wrote ' + outPath);
  console.log(out);
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
