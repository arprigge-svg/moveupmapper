'use strict';

// Loan-Level Price Adjustment (LLPA) data — pure data, no DOM.
//
// Source: Freddie Mac Single-Family Seller/Servicer Guide, Exhibit 19
// "Credit Fees," Bulletin 2026-09, effective 07/01/2026.
// https://guide.freddiemac.com/euf/assets/pdfs/Exhibit_19.pdf
//
// Transcribed directly from the published PDF (Base Grid + Special
// Attributes tables for Purchase, No Cash-out Refinance, and Cash-out
// Refinance). Values are price adjustments in percentage points.
//
// Intentionally not modeled (see the page's "what this doesn't model"
// section): Super Conforming ARM/FRM (depends on county-specific conforming
// loan limits, not one of this tool's inputs), and the separate Custom
// Mortgage Insurance Options table (Section 6, a secondary PMI-specific
// mechanic).

var FICO_BANDS = [
  { min: 300, max: 639, label: '<640' },
  { min: 640, max: 659, label: '640-659' },
  { min: 660, max: 679, label: '660-679' },
  { min: 680, max: 699, label: '680-699' },
  { min: 700, max: 719, label: '700-719' },
  { min: 720, max: 739, label: '720-739' },
  { min: 740, max: 759, label: '740-759' },
  { min: 760, max: 779, label: '760-779' },
  { min: 780, max: 850, label: '≥780' } // ≥780
];

var LTV_BANDS_9 = [
  { max: 30, label: '≤30%' },        // ≤30%
  { max: 60, label: '30.01-60%' },
  { max: 70, label: '60.01-70%' },
  { max: 75, label: '70.01-75%' },
  { max: 80, label: '75.01-80%' },
  { max: 85, label: '80.01-85%' },
  { max: 90, label: '85.01-90%' },
  { max: 95, label: '90.01-95%' },
  { max: null, label: '>95%' }
];

var LTV_BANDS_5 = [
  { max: 30, label: '≤30%' },
  { max: 60, label: '30.01-60%' },
  { max: 70, label: '60.01-70%' },
  { max: 75, label: '70.01-75%' },
  { max: 80, label: '75.01-80%' }
];

// Rows in FICO_BANDS order; columns in LTV_BANDS_9 order.
var PURCHASE_BASE_GRID = {
  '<640':      [0.000, 0.125, 1.500, 2.125, 2.750, 2.875, 2.625, 2.250, 1.750],
  '640-659':   [0.000, 0.000, 1.125, 1.500, 2.250, 2.500, 2.000, 1.875, 1.500],
  '660-679':   [0.000, 0.000, 0.750, 1.375, 1.875, 2.125, 1.750, 1.625, 1.250],
  '680-699':   [0.000, 0.000, 0.625, 1.125, 1.750, 1.875, 1.500, 1.375, 1.125],
  '700-719':   [0.000, 0.000, 0.375, 0.875, 1.375, 1.500, 1.250, 1.125, 0.875],
  '720-739':   [0.000, 0.000, 0.250, 0.750, 1.250, 1.250, 1.000, 0.875, 0.750],
  '740-759':   [0.000, 0.000, 0.125, 0.375, 0.875, 1.000, 0.750, 0.625, 0.500],
  '760-779':   [0.000, 0.000, 0.000, 0.250, 0.625, 0.625, 0.500, 0.500, 0.250],
  '≥780': [0.000, 0.000, 0.000, 0.000, 0.375, 0.375, 0.250, 0.250, 0.125]
};

var NOCASHOUT_BASE_GRID = {
  '<640':      [0.000, 0.375, 1.750, 2.500, 3.500, 3.875, 3.625, 2.500, 2.500],
  '640-659':   [0.000, 0.250, 1.375, 2.125, 2.875, 3.375, 2.875, 2.500, 2.500],
  '660-679':   [0.000, 0.125, 1.125, 1.875, 2.500, 3.000, 2.375, 2.125, 2.125],
  '680-699':   [0.000, 0.000, 0.875, 1.625, 2.250, 2.500, 2.125, 1.750, 1.750],
  '700-719':   [0.000, 0.000, 0.625, 1.250, 1.875, 2.125, 1.750, 1.625, 1.625],
  '720-739':   [0.000, 0.000, 0.500, 1.000, 1.625, 1.750, 1.500, 1.250, 1.250],
  '740-759':   [0.000, 0.000, 0.250, 0.750, 1.125, 1.375, 1.125, 1.000, 1.000],
  '760-779':   [0.000, 0.000, 0.125, 0.375, 0.875, 1.000, 0.750, 0.625, 0.625],
  '≥780': [0.000, 0.000, 0.000, 0.125, 0.500, 0.625, 0.500, 0.375, 0.375]
};

// Rows in FICO_BANDS order; columns in LTV_BANDS_5 order. Cash-out refis
// above 80% LTV are not eligible (handled explicitly in calcAdjustments).
var CASHOUT_BASE_GRID = {
  '<640':      [0.375, 1.375, 3.375, 4.875, 5.125],
  '640-659':   [0.375, 1.375, 3.125, 4.625, 5.125],
  '660-679':   [0.375, 0.875, 2.750, 4.000, 4.750],
  '680-699':   [0.375, 0.625, 2.000, 2.875, 3.750],
  '700-719':   [0.375, 0.500, 1.625, 2.625, 3.250],
  '720-739':   [0.375, 0.500, 1.375, 2.000, 2.750],
  '740-759':   [0.375, 0.375, 1.000, 1.625, 2.375],
  '760-779':   [0.375, 0.375, 0.875, 1.250, 1.875],
  '≥780': [0.375, 0.375, 0.625, 0.875, 1.375]
};

// Special Attributes tables are additive on top of the Base Grid. The
// Purchase and No-Cash-out-Refinance tables publish identical values, so
// they share one object. Keyed by attribute id; each array is parallel to
// the grid's LTV bands.
var SPECIAL_ATTRS_9 = {
  arm:                [0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.250, 0.250],
  altFico:             [0.000, 0.250, 0.250, 0.250, 0.250, 0.250, 0.250, 0.250, 0.250],
  condo:               [0.000, 0.000, 0.125, 0.125, 0.750, 0.750, 0.750, 0.750, 0.750],
  investmentProperty:  [1.125, 1.125, 1.625, 2.125, 3.375, 4.125, 4.125, 4.125, 4.125],
  manufacturedHome:    [0.500, 0.500, 0.500, 0.500, 0.500, 0.500, 0.500, 0.500, 0.500],
  multiUnit:           [0.000, 0.000, 0.375, 0.375, 0.625, 0.625, 0.625, 0.625, 0.625],
  secondHome:          [1.125, 1.125, 1.625, 2.125, 3.375, 4.125, 4.125, 4.125, 4.125],
  secondaryFinancing:  [0.625, 0.625, 0.625, 0.875, 1.125, 1.125, 1.125, 1.875, 1.875]
};

var SPECIAL_ATTRS_5 = {
  arm:                [0.000, 0.000, 0.000, 0.000, 0.000],
  altFico:             [0.250, 0.250, 0.250, 0.250, 0.250],
  condo:               [0.000, 0.000, 0.125, 0.125, 0.750],
  investmentProperty:  [1.125, 1.125, 1.625, 2.125, 3.375],
  manufacturedHome:    [0.500, 0.500, 0.500, 0.500, 0.500],
  multiUnit:           [0.000, 0.000, 0.375, 0.375, 0.625],
  secondHome:          [1.125, 1.125, 1.625, 2.125, 3.375],
  secondaryFinancing:  [0.625, 0.625, 0.625, 0.875, 1.125]
};

var LLPA_DATA = {
  effectiveDate: '2026-07-01',
  source: 'Freddie Mac Single-Family Seller/Servicer Guide, Exhibit 19 (Bulletin 2026-09)',
  sourceUrl: 'https://guide.freddiemac.com/euf/assets/pdfs/Exhibit_19.pdf',
  ficoBands: FICO_BANDS,

  purchase: {
    ltvBands: LTV_BANDS_9,
    baseGrid: PURCHASE_BASE_GRID,
    specialAttributes: SPECIAL_ATTRS_9
  },
  noCashoutRefi: {
    ltvBands: LTV_BANDS_9,
    baseGrid: NOCASHOUT_BASE_GRID,
    specialAttributes: SPECIAL_ATTRS_9
  },
  cashoutRefi: {
    ltvBands: LTV_BANDS_5,
    ineligibleAboveLtv: 80,
    baseGrid: CASHOUT_BASE_GRID,
    specialAttributes: SPECIAL_ATTRS_5
  }
};

if (typeof module !== 'undefined') module.exports = LLPA_DATA;
