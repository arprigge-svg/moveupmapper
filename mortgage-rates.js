'use strict';

// Shared current-rate helper, used by the calculator pages and the homepage.
//
// mortgage-rates.json is refreshed on a schedule (see
// .github/workflows/update-mortgage-rates.yml) from Freddie Mac's PMMS via
// FRED. FRED's own endpoints don't send CORS headers, so pages can't fetch
// it directly — this reads the same-origin static file the workflow commits
// instead.

var _mortgageRatesPromise = null;
function fetchCurrentMortgageRates() {
  if (!_mortgageRatesPromise) {
    _mortgageRatesPromise = fetch('/mortgage-rates.json').then(function (res) {
      if (!res.ok) throw new Error('mortgage-rates fetch failed: ' + res.status);
      return res.json();
    });
  }
  return _mortgageRatesPromise;
}

(function () {
  function formatDate(iso) {
    var d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function apply(data) {
    // Elements showing a formatted rate value, e.g.
    // <button data-mortgage-rate="30" data-fill-target="newRate">—</button>
    document.querySelectorAll('[data-mortgage-rate]').forEach(function (el) {
      var term = el.getAttribute('data-mortgage-rate');
      var rate = term === '15' ? data.fifteenYear : data.thirtyYear;
      el.textContent = rate.toFixed(2) + '%';

      var targetId = el.getAttribute('data-fill-target');
      if (targetId) {
        el.addEventListener('click', function () {
          var input = document.getElementById(targetId);
          if (!input) return;
          input.value = rate;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.focus();
        });
      }
    });

    // Elements showing the "as of" date, e.g. <span data-mortgage-rate-date></span>
    document.querySelectorAll('[data-mortgage-rate-date]').forEach(function (el) {
      el.textContent = formatDate(data.updated);
    });

    // Wrapper elements hidden until data is ready, to avoid a flash of
    // unpopulated placeholder text.
    document.querySelectorAll('[data-mortgage-rate-widget]').forEach(function (el) {
      el.style.display = '';
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!document.querySelector('[data-mortgage-rate], [data-mortgage-rate-date]')) return;
    fetchCurrentMortgageRates().then(apply).catch(function () {
      // Supplementary content — fail silently rather than disrupt the page.
    });
  });
}());
