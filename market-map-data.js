'use strict';

// Per-state housing-cost reference data for the Market page's state map.
//
// Five fields, five very different update stories:
//  - propertyTaxRatePct / insuranceAnnualAvg / transferTax / closingType:
//    hand-maintained here, each with its own source/year in `meta` below.
//    No API exists for any of these (verified directly — NAIC has no data
//    portal; Quadrant Information Services, the actual data provider behind
//    Bankrate/Insurify-style "current" figures, is enterprise-sales-only).
//    Refreshed via the annual reminder issue (see
//    .github/workflows/annual-data-review.yml), not scraped.
//  - Home price is NOT in this file — it's auto-refreshed monthly from
//    Zillow's ZHVI into state-home-prices.json (see
//    scripts/update-state-home-prices.js) and fetched at runtime by
//    market-map.js, kept separate exactly like mortgage-rates.json.
//
// transferTax.variesByLocality is independent of hasStateTax — Louisiana and
// Oregon have no *state* transfer tax but still get flagged because a single
// parish/county imposes its own (see their varianceNote). Don't assume
// hasStateTax:false implies variesByLocality:false.

var STATE_MARKET_DATA = {
  meta: {
    propertyTax: {
      source: 'Tax Foundation, "Property Taxes by State and County"',
      sourceUrl: 'https://taxfoundation.org/data/all/state/property-taxes-by-state-county/',
      asOfYear: 2024
    },
    insurance: {
      source: 'Insurance Information Institute (III), "Facts + Statistics: Homeowners and Renters Insurance"',
      sourceUrl: 'https://www.iii.org/fact-statistic/facts-statistics-homeowners-and-renters-insurance',
      asOfYear: 2021,
      lagNote: "III's most recently published state table is based on a Dec. 2023 NAIC study covering 2021 policy-year data. Actual current premiums likely run higher."
    },
    transferTax: {
      source: 'First American/Republic Title, "Real Estate Laws and Customs by State" (2025 ed.), cross-checked against county/city sources for local add-ons',
      sourceUrl: 'https://www.republictitle.com/wp-content/uploads/2025/03/Real-Estate-Customs-by-State-Guide-2025.pdf',
      asOfYear: 2025
    },
    closingType: {
      source: 'First American/Republic Title, "Real Estate Laws and Customs by State" (2025 ed.), cross-checked against current title-industry summaries',
      sourceUrl: 'https://www.republictitle.com/wp-content/uploads/2025/03/Real-Estate-Customs-by-State-Guide-2025.pdf',
      asOfYear: 2025
    }
  },

  // Populated per-state below. Every entry must have all five fields —
  // see test/market-map.test.js for the shape check that enforces this.
  states: {
    AL: {
      name: "Alabama",
      propertyTaxRatePct: 0.37,
      insuranceAnnualAvg: 1610,
      transferTax: { hasStateTax: true, ratePct: 0.1, variesByLocality: false, varianceNote: null },
      closingType: "attorney"
    },
    AK: {
      name: "Alaska",
      propertyTaxRatePct: 0.94,
      insuranceAnnualAvg: 1067,
      transferTax: { hasStateTax: false, ratePct: null, variesByLocality: false, varianceNote: null },
      closingType: "title"
    },
    AZ: {
      name: "Arizona",
      propertyTaxRatePct: 0.48,
      insuranceAnnualAvg: 917,
      transferTax: { hasStateTax: false, ratePct: null, variesByLocality: false, varianceNote: null },
      closingType: "title"
    },
    AR: {
      name: "Arkansas",
      propertyTaxRatePct: 0.56,
      insuranceAnnualAvg: 1611,
      transferTax: { hasStateTax: true, ratePct: 0.33, variesByLocality: false, varianceNote: null },
      closingType: "title"
    },
    CA: {
      name: "California",
      propertyTaxRatePct: 0.7,
      insuranceAnnualAvg: 1403,
      transferTax: { hasStateTax: true, ratePct: 0.11, variesByLocality: false, varianceNote: "LA (Measure ULA) adds 4% on sales $5.15M-$10.3M and 5.5% above; SF adds a graduated tax up to 6% on sales above $25M; both stack on the standard 0.11% county documentary transfer tax." },
      closingType: "title"
    },
    CO: {
      name: "Colorado",
      propertyTaxRatePct: 0.5,
      insuranceAnnualAvg: 1802,
      transferTax: { hasStateTax: true, ratePct: 0.01, variesByLocality: false, varianceNote: "Aspen/Pitkin County and other resort towns (Vail, Telluride, Breckenridge) levy their own local Real Estate Transfer Tax under special legislative exemptions -- Aspen's is 1.5% -- on top of the state's 0.01% documentary fee." },
      closingType: "title"
    },
    CT: {
      name: "Connecticut",
      propertyTaxRatePct: 1.54,
      insuranceAnnualAvg: 1651,
      transferTax: { hasStateTax: true, ratePct: 0.75, variesByLocality: false, varianceNote: null },
      closingType: "attorney"
    },
    DE: {
      name: "Delaware",
      propertyTaxRatePct: 0.54,
      insuranceAnnualAvg: 988,
      transferTax: { hasStateTax: true, ratePct: 2.5, variesByLocality: true, varianceNote: "Delaware's statutory state rate is 3.0%, reduced to 2.5% only in jurisdictions that also levy their own local 1.5% transfer tax, which covers most of the state. Typical combined total there is about 4% (often split evenly between buyer and seller); a minority of areas with no local tax pay the full 3% state-only rate." },
      closingType: "attorney"
    },
    DC: {
      name: "District of Columbia",
      propertyTaxRatePct: 0.6,
      insuranceAnnualAvg: 1272,
      transferTax: { hasStateTax: true, ratePct: 1.45, variesByLocality: false, varianceNote: "DC's deed transfer tax (1.10% under $400k, 1.45% at/above) is matched by an equal recordation tax, so the effective combined government take is 2.2%-2.9%. DC has no counties, so this is a tiered-by-price effect, not county/city stacking." },
      closingType: "mixed"
    },
    FL: {
      name: "Florida",
      propertyTaxRatePct: 0.78,
      insuranceAnnualAvg: 2437,
      transferTax: { hasStateTax: true, ratePct: 0.7, variesByLocality: false, varianceNote: null },
      closingType: "title"
    },
    GA: {
      name: "Georgia",
      propertyTaxRatePct: 0.79,
      insuranceAnnualAvg: 1466,
      transferTax: { hasStateTax: true, ratePct: 0.1, variesByLocality: false, varianceNote: null },
      closingType: "attorney"
    },
    HI: {
      name: "Hawaii",
      propertyTaxRatePct: 0.29,
      insuranceAnnualAvg: 1299,
      transferTax: { hasStateTax: true, ratePct: 0.1, variesByLocality: false, varianceNote: "Graduated 0.10%-1.25% by price tier and owner-occupant status; figure shown is the lowest bracket." },
      closingType: "mixed"
    },
    ID: {
      name: "Idaho",
      propertyTaxRatePct: 0.5,
      insuranceAnnualAvg: 884,
      transferTax: { hasStateTax: false, ratePct: null, variesByLocality: false, varianceNote: null },
      closingType: "title"
    },
    IL: {
      name: "Illinois",
      propertyTaxRatePct: 1.95,
      insuranceAnnualAvg: 1223,
      transferTax: { hasStateTax: true, ratePct: 0.1, variesByLocality: true, varianceNote: "Chicago layers its own transfer tax (effectively ~0.75% payable by buyer, plus seller-side stamps) and Cook County adds 0.05%, on top of the 0.10% state rate." },
      closingType: "mixed"
    },
    IN: {
      name: "Indiana",
      propertyTaxRatePct: 0.76,
      insuranceAnnualAvg: 1058,
      transferTax: { hasStateTax: false, ratePct: null, variesByLocality: false, varianceNote: null },
      closingType: "title"
    },
    IA: {
      name: "Iowa",
      propertyTaxRatePct: 1.33,
      insuranceAnnualAvg: 1043,
      transferTax: { hasStateTax: true, ratePct: 0.16, variesByLocality: false, varianceNote: null },
      closingType: "mixed"
    },
    KS: {
      name: "Kansas",
      propertyTaxRatePct: 1.21,
      insuranceAnnualAvg: 1491,
      transferTax: { hasStateTax: false, ratePct: null, variesByLocality: false, varianceNote: null },
      closingType: "title"
    },
    KY: {
      name: "Kentucky",
      propertyTaxRatePct: 0.74,
      insuranceAnnualAvg: 1232,
      transferTax: { hasStateTax: true, ratePct: 0.1, variesByLocality: false, varianceNote: null },
      closingType: "attorney"
    },
    LA: {
      name: "Louisiana",
      propertyTaxRatePct: 0.55,
      insuranceAnnualAvg: 2259,
      transferTax: { hasStateTax: false, ratePct: null, variesByLocality: true, varianceNote: "No statewide transfer tax, but Orleans Parish (New Orleans) imposes its own local documentary/transfer tax found nowhere else in the state." },
      closingType: "attorney"
    },
    ME: {
      name: "Maine",
      propertyTaxRatePct: 0.98,
      insuranceAnnualAvg: 996,
      transferTax: { hasStateTax: true, ratePct: 0.44, variesByLocality: false, varianceNote: null },
      closingType: "mixed"
    },
    MD: {
      name: "Maryland",
      propertyTaxRatePct: 0.92,
      insuranceAnnualAvg: 1238,
      transferTax: { hasStateTax: true, ratePct: 0.5, variesByLocality: true, varianceNote: "Counties and Baltimore City add their own transfer tax (0.5% in most counties, 1.5% in Baltimore City) on top of the 0.5% state rate, plus separate county recordation taxes." },
      closingType: "mixed"
    },
    MA: {
      name: "Massachusetts",
      propertyTaxRatePct: 1.0,
      insuranceAnnualAvg: 1712,
      transferTax: { hasStateTax: true, ratePct: 0.46, variesByLocality: true, varianceNote: "Standard $4.56/$1,000 (0.456%) applies in most counties, but Barnstable County (Cape Cod) adds a land-bank surcharge to $6.48/$1,000 (0.648%), and Nantucket/Dukes counties add a separate 2% land bank fee paid by the buyer." },
      closingType: "attorney"
    },
    MI: {
      name: "Michigan",
      propertyTaxRatePct: 1.19,
      insuranceAnnualAvg: 993,
      transferTax: { hasStateTax: true, ratePct: 0.75, variesByLocality: false, varianceNote: null },
      closingType: "title"
    },
    MN: {
      name: "Minnesota",
      propertyTaxRatePct: 1.0,
      insuranceAnnualAvg: 1607,
      transferTax: { hasStateTax: true, ratePct: 0.33, variesByLocality: false, varianceNote: null },
      closingType: "title"
    },
    MS: {
      name: "Mississippi",
      propertyTaxRatePct: 0.58,
      insuranceAnnualAvg: 1766,
      transferTax: { hasStateTax: false, ratePct: null, variesByLocality: false, varianceNote: null },
      closingType: "attorney"
    },
    MO: {
      name: "Missouri",
      propertyTaxRatePct: 0.89,
      insuranceAnnualAvg: 1340,
      transferTax: { hasStateTax: false, ratePct: null, variesByLocality: false, varianceNote: null },
      closingType: "title"
    },
    MT: {
      name: "Montana",
      propertyTaxRatePct: 0.61,
      insuranceAnnualAvg: 1471,
      transferTax: { hasStateTax: false, ratePct: null, variesByLocality: false, varianceNote: null },
      closingType: "title"
    },
    NE: {
      name: "Nebraska",
      propertyTaxRatePct: 1.44,
      insuranceAnnualAvg: 1684,
      transferTax: { hasStateTax: true, ratePct: 0.23, variesByLocality: false, varianceNote: null },
      closingType: "title"
    },
    NV: {
      name: "Nevada",
      propertyTaxRatePct: 0.5,
      insuranceAnnualAvg: 863,
      transferTax: { hasStateTax: true, ratePct: 0.39, variesByLocality: false, varianceNote: "Clark County (Las Vegas) adds 0.12% on top of the state's 0.39%, for a combined 0.51%; no separate mansion tax." },
      closingType: "title"
    },
    NH: {
      name: "New Hampshire",
      propertyTaxRatePct: 1.5,
      insuranceAnnualAvg: 1090,
      transferTax: { hasStateTax: true, ratePct: 1.5, variesByLocality: false, varianceNote: null },
      closingType: "attorney"
    },
    NJ: {
      name: "New Jersey",
      propertyTaxRatePct: 2.08,
      insuranceAnnualAvg: 1309,
      transferTax: { hasStateTax: true, ratePct: 1.0, variesByLocality: false, varianceNote: "Graduated realty transfer fee (roughly 0.4%-1.4%+ depending on price tier), plus a 1% 'mansion tax' paid by buyer above $1M; figure shown is an approximate effective rate." },
      closingType: "mixed"
    },
    NM: {
      name: "New Mexico",
      propertyTaxRatePct: 0.63,
      insuranceAnnualAvg: 1229,
      transferTax: { hasStateTax: false, ratePct: null, variesByLocality: false, varianceNote: null },
      closingType: "title"
    },
    NY: {
      name: "New York",
      propertyTaxRatePct: 1.3,
      insuranceAnnualAvg: 1455,
      transferTax: { hasStateTax: true, ratePct: 0.4, variesByLocality: true, varianceNote: "NYC adds its own Real Property Transfer Tax of 1%-2.625% depending on price/property type, plus state and NYC each add mansion-tax surcharges (state 0.65% above $3M; NYC 1%-3.9% above $1M)." },
      closingType: "attorney"
    },
    NC: {
      name: "North Carolina",
      propertyTaxRatePct: 0.66,
      insuranceAnnualAvg: 1192,
      transferTax: { hasStateTax: true, ratePct: 0.2, variesByLocality: false, varianceNote: null },
      closingType: "attorney"
    },
    ND: {
      name: "North Dakota",
      propertyTaxRatePct: 0.92,
      insuranceAnnualAvg: 1256,
      transferTax: { hasStateTax: false, ratePct: null, variesByLocality: false, varianceNote: null },
      closingType: "mixed"
    },
    OH: {
      name: "Ohio",
      propertyTaxRatePct: 1.36,
      insuranceAnnualAvg: 920,
      transferTax: { hasStateTax: true, ratePct: 0.1, variesByLocality: false, varianceNote: "State-mandatory minimum is 0.10%; counties may add a permissive levy up to 0.40% total." },
      closingType: "title"
    },
    OK: {
      name: "Oklahoma",
      propertyTaxRatePct: 0.79,
      insuranceAnnualAvg: 2155,
      transferTax: { hasStateTax: true, ratePct: 0.15, variesByLocality: false, varianceNote: null },
      closingType: "title"
    },
    OR: {
      name: "Oregon",
      propertyTaxRatePct: 0.81,
      insuranceAnnualAvg: 793,
      transferTax: { hasStateTax: false, ratePct: null, variesByLocality: true, varianceNote: "No statewide transfer tax; Washington County (Portland suburbs) is the sole Oregon county that imposes its own local real property transfer tax." },
      closingType: "title"
    },
    PA: {
      name: "Pennsylvania",
      propertyTaxRatePct: 1.26,
      insuranceAnnualAvg: 1014,
      transferTax: { hasStateTax: true, ratePct: 1.0, variesByLocality: true, varianceNote: "Philadelphia adds a local realty transfer tax of 3.578% (as of July 2025) on top of the 1% state rate, for a combined 4.578%; most other municipalities/school districts add roughly 1-2%." },
      closingType: "title"
    },
    RI: {
      name: "Rhode Island",
      propertyTaxRatePct: 1.12,
      insuranceAnnualAvg: 1900,
      transferTax: { hasStateTax: true, ratePct: 0.46, variesByLocality: false, varianceNote: null },
      closingType: "attorney"
    },
    SC: {
      name: "South Carolina",
      propertyTaxRatePct: 0.49,
      insuranceAnnualAvg: 1432,
      transferTax: { hasStateTax: true, ratePct: 0.37, variesByLocality: false, varianceNote: null },
      closingType: "attorney"
    },
    SD: {
      name: "South Dakota",
      propertyTaxRatePct: 1.0,
      insuranceAnnualAvg: 1270,
      transferTax: { hasStateTax: true, ratePct: 0.1, variesByLocality: false, varianceNote: null },
      closingType: "title"
    },
    TN: {
      name: "Tennessee",
      propertyTaxRatePct: 0.52,
      insuranceAnnualAvg: 1368,
      transferTax: { hasStateTax: true, ratePct: 0.37, variesByLocality: false, varianceNote: null },
      closingType: "title"
    },
    TX: {
      name: "Texas",
      propertyTaxRatePct: 1.4,
      insuranceAnnualAvg: 2146,
      transferTax: { hasStateTax: false, ratePct: null, variesByLocality: false, varianceNote: null },
      closingType: "title"
    },
    UT: {
      name: "Utah",
      propertyTaxRatePct: 0.48,
      insuranceAnnualAvg: 831,
      transferTax: { hasStateTax: false, ratePct: null, variesByLocality: false, varianceNote: null },
      closingType: "title"
    },
    VT: {
      name: "Vermont",
      propertyTaxRatePct: 1.51,
      insuranceAnnualAvg: 1025,
      transferTax: { hasStateTax: true, ratePct: 1.25, variesByLocality: false, varianceNote: "Tiered rate: roughly 0.5% on an initial portion for principal residences, 1.45% on the excess/non-principal-residence value." },
      closingType: "attorney"
    },
    VA: {
      name: "Virginia",
      propertyTaxRatePct: 0.78,
      insuranceAnnualAvg: 1199,
      transferTax: { hasStateTax: true, ratePct: 0.25, variesByLocality: false, varianceNote: "Combines a state recordation tax and grantor's tax; some independent cities add a small local grantor's tax. Figure is an approximation given VA's dual-tax structure." },
      closingType: "mixed"
    },
    WA: {
      name: "Washington",
      propertyTaxRatePct: 0.75,
      insuranceAnnualAvg: 1001,
      transferTax: { hasStateTax: true, ratePct: 1.1, variesByLocality: false, varianceNote: "Graduated real estate excise tax: 1.10% up to $525K, 1.28% to $1.525M, 2.75% to $3.025M, 3.00% above." },
      closingType: "title"
    },
    WV: {
      name: "West Virginia",
      propertyTaxRatePct: 0.51,
      insuranceAnnualAvg: 1016,
      transferTax: { hasStateTax: true, ratePct: 0.22, variesByLocality: false, varianceNote: null },
      closingType: "attorney"
    },
    WI: {
      name: "Wisconsin",
      propertyTaxRatePct: 1.32,
      insuranceAnnualAvg: 780,
      transferTax: { hasStateTax: true, ratePct: 0.3, variesByLocality: false, varianceNote: null },
      closingType: "title"
    },
    WY: {
      name: "Wyoming",
      propertyTaxRatePct: 0.53,
      insuranceAnnualAvg: 1432,
      transferTax: { hasStateTax: false, ratePct: null, variesByLocality: false, varianceNote: null },
      closingType: "title"
    }
  }
};

if (typeof module !== 'undefined') module.exports = STATE_MARKET_DATA;
