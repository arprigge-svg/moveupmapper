'use strict';

(function () {

  var CLOSING_TYPE_LABELS = {
    attorney: 'Attorney customarily required',
    title: 'Title company / escrow agent',
    mixed: 'Varies by local practice'
  };

  var MIXED_CLOSING_NOTE = 'Practice varies locally: attorneys may prepare documents while a title company conducts the actual closing, or either may be used depending on the transaction.';

  // Returns { text, flagged, note }. `flagged` drives the amber-callout
  // treatment (only for systemic state+locality stacking); a lighter,
  // non-flagged `note` (e.g. resort-town/luxury-market add-ons in CO/NV/CA)
  // renders as a small inline aside instead of the full callout.
  function formatTransferTax(stateData) {
    var t = stateData.transferTax;
    // variesByLocality can be true even with no *state* tax (e.g. Louisiana,
    // Oregon: no statewide tax, but a specific county/parish imposes its own)
    // — flagging must not be gated on hasStateTax.
    var text = t.hasStateTax ? (t.ratePct.toFixed(2) + '%') : 'No transfer tax.';
    return { text: text, flagged: !!t.variesByLocality, note: t.varianceNote || null };
  }

  // Returns { text, note }. `note` is only populated for 'mixed' — the
  // clarifying case (e.g. Texas: attorneys prep documents, title companies
  // conduct the actual closing) that a bare label would leave ambiguous.
  function formatClosingType(stateData) {
    var text = CLOSING_TYPE_LABELS[stateData.closingType] || 'Unknown';
    var note = stateData.closingType === 'mixed' ? MIXED_CLOSING_NOTE : null;
    return { text: text, note: note };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      formatTransferTax: formatTransferTax,
      formatClosingType: formatClosingType
    };
  }

  /* ── DOM wiring ── */
  if (typeof document !== 'undefined') {

    var DATA = (typeof window !== 'undefined') ? window.STATE_MARKET_DATA : null;
    var pinnedState = null;
    var homePrices = null;

    function fmtCurrency(n) {
      return '$' + Math.round(n).toLocaleString('en-US');
    }

    function fmtPercent(n) {
      return n.toFixed(2) + '%';
    }

    function stateNames() {
      var out = [];
      for (var code in DATA.states) {
        if (DATA.states.hasOwnProperty(code)) out.push({ code: code, name: DATA.states[code].name });
      }
      out.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
      return out;
    }

    function populateSelect() {
      var select = document.getElementById('stateMapSelect');
      if (!select) return;
      stateNames().forEach(function (s) {
        var opt = document.createElement('option');
        opt.value = s.code;
        opt.textContent = s.name;
        select.appendChild(opt);
      });
    }

    function highlightState(code) {
      var svg = document.getElementById('usMap');
      if (!svg) return;
      svg.querySelectorAll('[data-state].is-active').forEach(function (el) {
        el.classList.remove('is-active');
      });
      if (code) {
        var el = svg.querySelector('[data-state="' + code + '"]');
        if (el) el.classList.add('is-active');
      }
    }

    function renderPanel(code) {
      var panel = document.getElementById('stateMapPanel');
      if (!panel) return;

      if (!code || !DATA.states[code]) {
        panel.innerHTML = '<p class="market-map-prompt">Click a state on the map, or choose one from the dropdown above.</p>';
        return;
      }

      var state = DATA.states[code];
      var meta = DATA.meta;
      var transferTax = formatTransferTax(state);
      var closingType = formatClosingType(state);

      var priceEntry = homePrices && homePrices.states ? homePrices.states[code] : null;
      var priceText = priceEntry && priceEntry.value != null ? fmtCurrency(priceEntry.value) : 'Not available';
      var priceDateText = priceEntry && priceEntry.date ? ' (as of ' + priceEntry.date + ')' : '';

      var html = '';
      html += '<div class="market-map-panel-title">' + state.name + '</div>';

      html += '<div class="market-map-row"><span class="market-map-row-label">Median Home Price</span>' +
        '<span class="market-map-row-value">' + priceText + '</span></div>' +
        '<div class="market-map-row-cite">Zillow Home Value Index' + priceDateText + '</div>';

      html += '<div class="market-map-row"><span class="market-map-row-label">Effective Property Tax Rate</span>' +
        '<span class="market-map-row-value">' + fmtPercent(state.propertyTaxRatePct) + '</span></div>' +
        '<div class="market-map-row-cite">' + meta.propertyTax.source + ', ' + meta.propertyTax.asOfYear + '</div>';

      html += '<div class="market-map-row"><span class="market-map-row-label">Avg. Homeowners Insurance</span>' +
        '<span class="market-map-row-value">' + fmtCurrency(state.insuranceAnnualAvg) + '/yr</span></div>' +
        '<div class="market-map-row-cite">' + meta.insurance.source + ', ' + meta.insurance.asOfYear +
        (meta.insurance.lagNote ? '. ' + meta.insurance.lagNote : '') + '</div>';

      html += '<div class="market-map-row"><span class="market-map-row-label">Transfer Tax</span>' +
        '<span class="market-map-row-value">' + transferTax.text + '</span></div>';
      if (transferTax.flagged) {
        html += '<div class="market-callout market-callout--amber market-map-callout"><p><strong>Varies by locality:</strong> ' + transferTax.note + '</p></div>';
      } else if (transferTax.note) {
        html += '<div class="market-map-row-cite">' + transferTax.note + '</div>';
      }

      html += '<div class="market-map-row"><span class="market-map-row-label">Closing Customs</span>' +
        '<span class="market-map-row-value">' + closingType.text + '</span></div>';
      if (closingType.note) {
        html += '<div class="market-map-row-cite">' + closingType.note + '</div>';
      }

      panel.innerHTML = html;
    }

    function selectState(code, opts) {
      opts = opts || {};
      if (opts.pin) pinnedState = code;
      var select = document.getElementById('stateMapSelect');
      if (select && opts.pin) select.value = code || '';
      highlightState(code);
      renderPanel(code);
    }

    document.addEventListener('DOMContentLoaded', function () {
      if (!DATA) return;

      populateSelect();

      var svg = document.getElementById('usMap');
      if (svg) {
        svg.addEventListener('click', function (e) {
          var target = e.target.closest && e.target.closest('[data-state]');
          if (!target) return;
          selectState(target.getAttribute('data-state'), { pin: true });
        });
        // mouseenter/mouseleave don't bubble, so a single delegated listener
        // on the container wouldn't fire per-state — mouseover/mouseout do.
        svg.addEventListener('mouseover', function (e) {
          var target = e.target.closest && e.target.closest('[data-state]');
          if (!target) return;
          selectState(target.getAttribute('data-state'), { pin: false });
        });
        svg.addEventListener('mouseout', function (e) {
          var related = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('[data-state]');
          if (related) return; // moved to another state path, not off the map
          selectState(pinnedState, { pin: false });
        });
      }

      var select = document.getElementById('stateMapSelect');
      if (select) {
        select.addEventListener('change', function () {
          selectState(select.value || null, { pin: true });
        });
      }

      fetch('/state-home-prices.json')
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (data) {
          homePrices = data;
          if (pinnedState) renderPanel(pinnedState);
        })
        .catch(function () {});
    });
  }

}());
