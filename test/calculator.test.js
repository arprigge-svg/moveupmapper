'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULTS, mortgageFactor, calcEquity, calcAnnualPropertyTax, calcAffordablePrice, calculate,
} = require('../calculator.js');

test('mortgageFactor matches standard amortization factor', () => {
  const K = mortgageFactor(6, 360);
  assert.ok(Math.abs(K * 300000 - 1798.6515754582708) < 1e-6);
});

test('mortgageFactor: zero rate is 1/term', () => {
  assert.equal(mortgageFactor(0, 240), 1 / 240);
});

test('calcEquity: equity mode returns equityValue directly', () => {
  const s = { equityMode: 'equity', equityValue: 120000, homeValuation: 500000 };
  assert.equal(calcEquity(s), 120000);
});

test('calcEquity: loanBalance mode returns home value minus balance', () => {
  const s = { equityMode: 'loanBalance', equityValue: 380000, homeValuation: 500000 };
  assert.equal(calcEquity(s), 120000);
});

test('calcAnnualPropertyTax: percent mode scales with price', () => {
  const s = { taxMode: 'percent', propertyTaxPercent: 1.2 };
  assert.ok(Math.abs(calcAnnualPropertyTax(s, 500000) - 6000) < 1e-9);
});

test('calcAnnualPropertyTax: dollar mode ignores price', () => {
  const s = { taxMode: 'dollar', propertyTaxDollar: 7000 };
  assert.equal(calcAnnualPropertyTax(s, 999999), 7000);
});

test('calcAffordablePrice: solving for price reproduces the target monthly budget (no PMI)', () => {
  const s = {
    interestRate: 6, prospectiveTerm: 30, taxMode: 'dollar', propertyTaxDollar: 6000,
    hoiMode: 'dollar', homeownersInsurance: 100, newHOA: 0, monthlyPMI: 150, purchasePrice: 0,
  };
  const dp = 100000, targetMonthly = 2500;
  const price = calcAffordablePrice(s, targetMonthly, dp, 100, 0);
  assert.ok(Math.abs(price - 416904.0673454346) < 1e-4);

  // Round-trip: recompute the monthly cost at this price and confirm it lands back on target.
  const K = mortgageFactor(s.interestRate, s.prospectiveTerm * 12);
  const loan = price - dp;
  const total = loan * K + s.propertyTaxDollar / 12 + 100 + 0;
  assert.ok(Math.abs(total - targetMonthly) < 1e-6);
});

test('calcAffordablePrice: applies the PMI adjustment when down payment is under 20%', () => {
  const s = {
    interestRate: 6, prospectiveTerm: 30, taxMode: 'dollar', propertyTaxDollar: 6000,
    hoiMode: 'dollar', homeownersInsurance: 100, newHOA: 0, monthlyPMI: 150, purchasePrice: 0,
  };
  const dp = 20000, targetMonthly = 2200;
  const price = calcAffordablePrice(s, targetMonthly, dp, 100, 0);
  assert.ok(dp / price < 0.20);
  assert.ok(Math.abs(price - 261847.84086888435) < 1e-4);

  const K = mortgageFactor(s.interestRate, s.prospectiveTerm * 12);
  const loan = price - dp;
  const total = loan * K + s.propertyTaxDollar / 12 + 100 + 0 + s.monthlyPMI;
  assert.ok(Math.abs(total - targetMonthly) < 1e-6);
});

function baseState(overrides = {}) {
  return {
    ...DEFAULTS,
    buyerMode: 'owner',
    homeValuation: 500000,
    equityMode: 'equity',
    equityValue: 120000,
    expendableCash: 50000,
    monthlyIncome: 8500,
    purchasePrice: 700000,
    interestRate: 6.875,
    prospectiveTerm: 30,
    monthlyPMI: 336,
    currentHOA: 0,
    newHOA: 0,
    taxMode: 'dollar',
    propertyTaxDollar: 7000,
    realtorFee: 5,
    transferTaxPct: 0,
    preSaleRepairs: 0,
    sellerTitleFees: 2500,
    lenderFees: 5764,
    buyerTitleFees: 4200,
    buyerTransferTaxPct: 0,
    repairCosts: 0,
    prepaidsAtClosing: 0,
    prepaidsManual: false,
    prePaidEscrow: 0,
    prePaidEscrowManual: false,
    movingExpenses: 3000,
    targetSliderPct: 28,
    homeownersInsurance: 150,
    hoiMode: 'dollar',
    ...overrides,
  };
}

test('calculate: first-time buyers have zero equity and zero selling costs', () => {
  const s = baseState({ buyerMode: 'firstTime' });
  const c = calculate(s);
  assert.equal(c.equity, 0);
  assert.equal(c.sellingCosts, 0);
  assert.equal(c.saleProceeds, 0);
});

test('calculate: owner sale proceeds equal equity minus selling costs', () => {
  const s = baseState();
  const c = calculate(s);
  assert.ok(Math.abs(c.equity - 120000) < 1e-9);
  assert.ok(Math.abs(c.sellingCosts - (c.realtorFees + c.transferTax + s.preSaleRepairs + s.sellerTitleFees)) < 1e-9);
  assert.ok(Math.abs(c.saleProceeds - Math.max(0, c.equity - c.sellingCosts)) < 1e-9);
});

test('calculate: PMI applies only when down payment is under 20%', () => {
  const under20State = baseState({ purchasePrice: 700000, expendableCash: 5000 });
  const under20 = calculate(under20State);
  assert.ok(under20.dpPct < 0.20);
  assert.equal(under20.pmi, under20State.monthlyPMI);

  const over20 = calculate(baseState({ purchasePrice: 300000, expendableCash: 200000 }));
  assert.ok(over20.dpPct >= 0.20);
  assert.equal(over20.pmi, 0);
});

test('calculate: raising the affordability slider percentage raises the target price', () => {
  const low = calculate(baseState({ targetSliderPct: 20 }));
  const high = calculate(baseState({ targetSliderPct: 40 }));
  assert.ok(high.targetPrice > low.targetPrice);
});

test('calculate: ceiling price (36% DTI) is never below the target price at a lower slider percentage', () => {
  const s = baseState({ targetSliderPct: 28 });
  const c = calculate(s);
  assert.ok(c.ceilingPrice >= c.targetPrice);
});
