'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  findFicoBand,
  findLtvBandIndex,
  applicableAttributeKeys,
  calcAdjustments,
  ficoSensitivity,
  ltvSensitivity,
  pointsToRateDelta,
} = require('../ratefactors.js');
const DATA = require('../ratefactors-data.js');

function baseInputs(overrides = {}) {
  return {
    ficoScore: 720,
    ltv: 80,
    loanPurpose: 'purchase',
    occupancy: 'primary',
    propertyType: 'singleFamily',
    rateType: 'fixed',
    secondaryFinancing: 'no',
    ...overrides,
  };
}

test('findFicoBand: matches inclusive band boundaries', () => {
  assert.equal(findFicoBand(DATA.ficoBands, 639).label, '<640');
  assert.equal(findFicoBand(DATA.ficoBands, 640).label, '640-659');
  assert.equal(findFicoBand(DATA.ficoBands, 779).label, '760-779');
  assert.equal(findFicoBand(DATA.ficoBands, 780).label, '≥780');
  assert.equal(findFicoBand(DATA.ficoBands, 850).label, '≥780');
});

test('findLtvBandIndex: open-lower/closed-upper boundaries', () => {
  const bands = DATA.purchase.ltvBands;
  assert.equal(bands[findLtvBandIndex(bands, 30)].label, '≤30%');
  assert.equal(bands[findLtvBandIndex(bands, 30.01)].label, '30.01-60%');
  assert.equal(bands[findLtvBandIndex(bands, 80)].label, '75.01-80%');
  assert.equal(bands[findLtvBandIndex(bands, 80.01)].label, '80.01-85%');
  assert.equal(bands[findLtvBandIndex(bands, 95)].label, '90.01-95%');
  assert.equal(bands[findLtvBandIndex(bands, 95.01)].label, '>95%');
  assert.equal(bands[findLtvBandIndex(bands, 200)].label, '>95%');
});

test('applicableAttributeKeys: maps inputs to grid attribute ids', () => {
  assert.deepEqual(applicableAttributeKeys(baseInputs()), []);
  assert.deepEqual(applicableAttributeKeys(baseInputs({ occupancy: 'secondHome' })), ['secondHome']);
  assert.deepEqual(applicableAttributeKeys(baseInputs({ occupancy: 'investment' })), ['investmentProperty']);
  assert.deepEqual(applicableAttributeKeys(baseInputs({ propertyType: 'condo' })), ['condo']);
  assert.deepEqual(applicableAttributeKeys(baseInputs({ propertyType: 'manufactured' })), ['manufacturedHome']);
  assert.deepEqual(applicableAttributeKeys(baseInputs({ propertyType: 'multiUnit' })), ['multiUnit']);
  assert.deepEqual(applicableAttributeKeys(baseInputs({ rateType: 'arm' })), ['arm']);
  assert.deepEqual(applicableAttributeKeys(baseInputs({ secondaryFinancing: 'yes' })), ['secondaryFinancing']);
  assert.deepEqual(
    applicableAttributeKeys(baseInputs({ occupancy: 'investment', propertyType: 'condo', rateType: 'arm' })),
    ['investmentProperty', 'condo', 'arm']
  );
});

test('calcAdjustments: best-qualified purchase scenario has zero base adjustment', () => {
  const res = calcAdjustments(baseInputs({ ficoScore: 800, ltv: 30 }), DATA);
  assert.equal(res.eligible, true);
  assert.equal(res.ficoBand, '≥780');
  assert.equal(res.ltvBand, '≤30%');
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].points, 0);
  assert.equal(res.totalPoints, 0);
});

test('calcAdjustments: worst-case purchase scenario matches published grid cell', () => {
  // <640 FICO, >95% LTV -> 1.750 per the published Base Grid.
  const res = calcAdjustments(baseInputs({ ficoScore: 600, ltv: 96 }), DATA);
  assert.equal(res.ficoBand, '<640');
  assert.equal(res.ltvBand, '>95%');
  assert.equal(res.totalPoints, 1.75);
});

test('calcAdjustments: 700-719 / 80-85% purchase matches published cell', () => {
  const res = calcAdjustments(baseInputs({ ficoScore: 710, ltv: 85 }), DATA);
  assert.equal(res.ficoBand, '700-719');
  assert.equal(res.ltvBand, '80.01-85%');
  assert.equal(res.totalPoints, 1.5);
});

test('calcAdjustments: stacks special attributes additively on the base', () => {
  const res = calcAdjustments(
    baseInputs({
      ficoScore: 710, ltv: 85, occupancy: 'investment', propertyType: 'condo',
      rateType: 'arm', secondaryFinancing: 'yes',
    }),
    DATA
  );
  // base 1.500 + investmentProperty 4.125 + condo 0.750 + arm 0.000 + secondaryFinancing 1.125
  assert.equal(res.items.length, 5);
  assert.equal(res.totalPoints, 7.5);
});

test('calcAdjustments: cash-out refi at exactly 80% LTV is eligible', () => {
  const res = calcAdjustments(baseInputs({ loanPurpose: 'cashoutRefi', ltv: 80 }), DATA);
  assert.equal(res.eligible, true);
  assert.equal(res.ltvBand, '75.01-80%');
});

test('calcAdjustments: cash-out refi above 80% LTV is explicitly ineligible', () => {
  const res = calcAdjustments(baseInputs({ loanPurpose: 'cashoutRefi', ltv: 80.01 }), DATA);
  assert.deepEqual(res, { eligible: false, ficoBand: null, ltvBand: null, items: [], totalPoints: null });
});

test('calcAdjustments: cash-out refi best case matches published cell (0.375)', () => {
  const res = calcAdjustments(baseInputs({ loanPurpose: 'cashoutRefi', ficoScore: 800, ltv: 30 }), DATA);
  assert.equal(res.totalPoints, 0.375);
});

test('calcAdjustments: cash-out refi worst case matches published cell (5.125)', () => {
  const res = calcAdjustments(baseInputs({ loanPurpose: 'cashoutRefi', ficoScore: 600, ltv: 80 }), DATA);
  assert.equal(res.totalPoints, 5.125);
});

test('ficoSensitivity: one row per FICO band, current band flagged, values match calcAdjustments', () => {
  const inp = baseInputs({ ficoScore: 710, ltv: 80 });
  const rows = ficoSensitivity(inp, DATA);
  assert.equal(rows.length, DATA.ficoBands.length);
  const current = rows.filter((r) => r.isCurrent);
  assert.equal(current.length, 1);
  assert.equal(current[0].label, '700-719');
  assert.equal(current[0].totalPoints, calcAdjustments(inp, DATA).totalPoints);
  const best = rows.find((r) => r.label === '≥780');
  assert.equal(best.totalPoints, 0.375);
});

test('ltvSensitivity: one row per LTV band, current band flagged, values match calcAdjustments', () => {
  const inp = baseInputs({ ficoScore: 710, ltv: 80 });
  const rows = ltvSensitivity(inp, DATA);
  assert.equal(rows.length, DATA.purchase.ltvBands.length);
  const current = rows.filter((r) => r.isCurrent);
  assert.equal(current.length, 1);
  assert.equal(current[0].label, '75.01-80%');
  assert.equal(current[0].totalPoints, calcAdjustments(inp, DATA).totalPoints);
});

test('ltvSensitivity: cash-out refi only walks its own 5 (all-eligible) bands', () => {
  const inp = baseInputs({ ficoScore: 710, ltv: 60, loanPurpose: 'cashoutRefi' });
  const rows = ltvSensitivity(inp, DATA);
  assert.equal(rows.length, 5);
  assert.ok(rows.every((r) => r.eligible === true));
});

test('pointsToRateDelta: applies the assumed points-per-rate ratio', () => {
  assert.equal(pointsToRateDelta(2, 0.25), 0.5);
  assert.equal(pointsToRateDelta(0, 0.25), 0);
  assert.equal(pointsToRateDelta(1.375, 0.25), 0.344);
});
