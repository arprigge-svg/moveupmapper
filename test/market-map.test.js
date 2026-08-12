'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { formatTransferTax, formatClosingType } = require('../market-map.js');
const STATE_MARKET_DATA = require('../market-map-data.js');

function stateFixture(overrides = {}) {
  return {
    name: 'Testland',
    propertyTaxRatePct: 1.0,
    insuranceAnnualAvg: 1500,
    transferTax: { hasStateTax: true, ratePct: 0.5, variesByLocality: false, varianceNote: null },
    closingType: 'title',
    ...overrides,
  };
}

test('formatTransferTax: no state tax renders a plain statement, not "0%"', () => {
  const r = formatTransferTax(stateFixture({
    transferTax: { hasStateTax: false, ratePct: null, variesByLocality: false, varianceNote: null },
  }));
  assert.equal(r.text, 'No transfer tax.');
  assert.equal(r.flagged, false);
});

test('formatTransferTax: flat state rate renders as a plain percentage, not flagged', () => {
  const r = formatTransferTax(stateFixture({
    transferTax: { hasStateTax: true, ratePct: 1.6, variesByLocality: false, varianceNote: null },
  }));
  assert.equal(r.text, '1.60%');
  assert.equal(r.flagged, false);
  assert.equal(r.note, null);
});

test('formatTransferTax: systemic locality stacking is flagged with its note', () => {
  const r = formatTransferTax(stateFixture({
    transferTax: { hasStateTax: true, ratePct: 0.4, variesByLocality: true, varianceNote: 'NYC adds 1-2.625% on top.' },
  }));
  assert.equal(r.text, '0.40%');
  assert.equal(r.flagged, true);
  assert.equal(r.note, 'NYC adds 1-2.625% on top.');
});

test('formatTransferTax: no *state* tax but a flagged local tax (e.g. Louisiana, Oregon) still renders flagged', () => {
  const r = formatTransferTax(stateFixture({
    transferTax: { hasStateTax: false, ratePct: null, variesByLocality: true, varianceNote: 'Orleans Parish imposes its own local transfer tax.' },
  }));
  assert.equal(r.text, 'No transfer tax.');
  assert.equal(r.flagged, true);
  assert.equal(r.note, 'Orleans Parish imposes its own local transfer tax.');
});

test('formatTransferTax: a lighter resort-town note renders without the full flag', () => {
  const r = formatTransferTax(stateFixture({
    transferTax: { hasStateTax: true, ratePct: 0.11, variesByLocality: false, varianceNote: 'Some resort towns add a local transfer tax.' },
  }));
  assert.equal(r.flagged, false);
  assert.equal(r.note, 'Some resort towns add a local transfer tax.');
});

test('formatClosingType: attorney and title states have no clarifying note', () => {
  assert.equal(formatClosingType(stateFixture({ closingType: 'attorney' })).note, null);
  assert.equal(formatClosingType(stateFixture({ closingType: 'title' })).note, null);
});

test('formatClosingType: mixed states get a clarifying note (e.g. Texas)', () => {
  const r = formatClosingType(stateFixture({ closingType: 'mixed' }));
  assert.ok(r.note && r.note.length > 0);
});

test('formatClosingType: labels are human-readable, not raw enum values', () => {
  assert.equal(formatClosingType(stateFixture({ closingType: 'attorney' })).text, 'Attorney customarily required');
  assert.equal(formatClosingType(stateFixture({ closingType: 'title' })).text, 'Title company / escrow agent');
  assert.equal(formatClosingType(stateFixture({ closingType: 'mixed' })).text, 'Varies by local practice');
});

test('data shape: exactly 51 states (50 + DC), every field present with sane types', () => {
  const codes = Object.keys(STATE_MARKET_DATA.states);
  assert.equal(codes.length, 51);
  assert.ok(STATE_MARKET_DATA.states.DC, 'DC must be included');

  codes.forEach((code) => {
    const s = STATE_MARKET_DATA.states[code];
    assert.equal(typeof s.name, 'string');
    assert.equal(typeof s.propertyTaxRatePct, 'number');
    assert.equal(typeof s.insuranceAnnualAvg, 'number');
    assert.equal(typeof s.closingType, 'string');
    assert.ok(['attorney', 'title', 'mixed'].includes(s.closingType), `${code}: unexpected closingType ${s.closingType}`);

    const t = s.transferTax;
    assert.equal(typeof t.hasStateTax, 'boolean');
    assert.equal(typeof t.variesByLocality, 'boolean');
    if (t.hasStateTax) {
      assert.equal(typeof t.ratePct, 'number', `${code}: hasStateTax true but ratePct isn't a number`);
    } else {
      assert.equal(t.ratePct, null, `${code}: hasStateTax false but ratePct isn't null`);
    }
    // varianceNote must be non-empty iff variesByLocality is true OR a
    // lighter (non-flagged) note is present — never an empty string.
    if (t.varianceNote !== null) {
      assert.ok(t.varianceNote.length > 0, `${code}: varianceNote is an empty string, should be null`);
    }
  });
});

test('data shape: exactly the 8 systemic-stacking states are flagged, no more, no fewer', () => {
  const FLAGGED = ['NY', 'PA', 'MD', 'MA', 'IL', 'LA', 'OR', 'DE'];
  const actuallyFlagged = Object.keys(STATE_MARKET_DATA.states)
    .filter((code) => STATE_MARKET_DATA.states[code].transferTax.variesByLocality)
    .sort();
  assert.deepEqual(actuallyFlagged, FLAGGED.slice().sort());
  FLAGGED.forEach((code) => {
    assert.ok(STATE_MARKET_DATA.states[code].transferTax.varianceNote, `${code} should have a varianceNote`);
  });
  // Michigan looks two-layered (state + uniform statewide county add-on)
  // but isn't systemic locality-stacking, so it must stay unflagged.
  assert.equal(STATE_MARKET_DATA.states.MI.transferTax.variesByLocality, false);
  // DC's dual-tax structure is tiered by price, not by locality (DC has no
  // counties) — flagging it would render a "Varies by locality" callout
  // whose own note says it does NOT vary by locality. Must stay unflagged.
  assert.equal(STATE_MARKET_DATA.states.DC.transferTax.variesByLocality, false);
});
