'use strict';

(function () {

  var STORAGE_KEY = 'timeline_v1';
  var DEFAULTS = {
    strategy: 'buyFirst',
    daysToSell: 45,
    daysToBuy: 30,
    escrowDays: 30
  };

  // Clone-then-mutate, never getTime() + n*86400000 — a "day" isn't a fixed
  // number of milliseconds once DST is involved.
  function addDays(date, n) {
    var d = new Date(date.getTime());
    d.setDate(d.getDate() + n);
    return d;
  }

  // <input type="date"> gives "2026-11-16". new Date(str) parses that as UTC
  // midnight, which renders as the PRIOR day in any US timezone — parse the
  // fields by hand and construct in local time instead.
  function parseDateInput(str) {
    var parts = str.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  // Mirror-image footgun: toISOString() is also UTC-based. Build the string
  // from local date fields when writing a Date back into the input.
  function toDateInputValue(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  // Applied only to actual closing/contract-acceptance dates, not soft
  // milestones like "start shopping" — real closings don't land on weekends.
  function nextBusinessDay(date) {
    var d = new Date(date.getTime());
    var day = d.getDay();
    if (day === 6) d.setDate(d.getDate() + 2);
    else if (day === 0) d.setDate(d.getDate() + 1);
    return d;
  }

  function daysBetween(a, b) {
    var msPerDay = 24 * 60 * 60 * 1000;
    return Math.round((b.getTime() - a.getTime()) / msPerDay);
  }

  function buildBuyFirst(durations, start) {
    var shopStart = start;
    var purchaseContract = addDays(shopStart, durations.daysToBuy);
    var purchaseClose = nextBusinessDay(addDays(purchaseContract, durations.escrowDays));
    var listHome = purchaseClose;
    var saleContract = addDays(listHome, durations.daysToSell);
    var saleClose = nextBusinessDay(addDays(saleContract, durations.escrowDays));

    return [
      { id: 'shopStart', track: 'purchase', label: 'Start shopping for your new home', date: shopStart },
      { id: 'purchaseContract', track: 'purchase', label: 'Go under contract on new home', date: purchaseContract },
      { id: 'purchaseClose', track: 'both', label: 'Close on new home, move in', date: purchaseClose },
      { id: 'listHome', track: 'sale', label: 'List your current home', date: listHome },
      { id: 'saleContract', track: 'sale', label: 'Accept offer on current home', date: saleContract },
      { id: 'saleClose', track: 'sale', label: 'Close on current home sale', date: saleClose }
    ];
  }

  function buildSellFirst(durations, start) {
    var listHome = start;
    var saleContract = addDays(listHome, durations.daysToSell);
    var shopStart = saleContract;
    var saleClose = nextBusinessDay(addDays(saleContract, durations.escrowDays));
    var purchaseContract = addDays(shopStart, durations.daysToBuy);
    var purchaseClose = nextBusinessDay(addDays(purchaseContract, durations.escrowDays));

    return [
      { id: 'listHome', track: 'sale', label: 'List your current home', date: listHome },
      { id: 'saleContract', track: 'sale', label: 'Accept offer on current home', date: saleContract },
      { id: 'shopStart', track: 'purchase', label: 'Start shopping for your new home', date: shopStart },
      { id: 'saleClose', track: 'sale', label: 'Close on current home sale', date: saleClose },
      { id: 'purchaseContract', track: 'purchase', label: 'Go under contract on new home', date: purchaseContract },
      { id: 'purchaseClose', track: 'both', label: 'Close on new home, move in', date: purchaseClose }
    ];
  }

  function buildSimultaneous(durations, start) {
    var listHome = start;
    var shopStart = start;
    var saleContract = addDays(listHome, durations.daysToSell);
    var purchaseContract = addDays(shopStart, durations.daysToBuy);
    var laterContract = saleContract.getTime() >= purchaseContract.getTime() ? saleContract : purchaseContract;
    var syncedClose = nextBusinessDay(addDays(laterContract, durations.escrowDays));

    var gapDays = Math.abs(durations.daysToSell - durations.daysToBuy);
    var saleNote = null;
    var purchaseNote = null;
    if (gapDays > 0) {
      var noteText = 'Closing is paced by your ' +
        (durations.daysToSell < durations.daysToBuy ? 'home purchase' : 'home sale') +
        ': about ' + gapDays + ' day' + (gapDays === 1 ? '' : 's') + ' longer than the other side alone would take.';
      if (durations.daysToSell < durations.daysToBuy) saleNote = noteText;
      else purchaseNote = noteText;
    }

    return [
      { id: 'listHome', track: 'sale', label: 'List your current home', date: listHome },
      { id: 'shopStart', track: 'purchase', label: 'Start shopping for your new home', date: shopStart },
      { id: 'saleContract', track: 'sale', label: 'Accept offer on current home', date: saleContract, note: saleNote },
      { id: 'purchaseContract', track: 'purchase', label: 'Go under contract on new home', date: purchaseContract, note: purchaseNote },
      { id: 'syncedClose', track: 'both', label: 'Simultaneous close, move in', date: syncedClose }
    ];
  }

  var BUILDERS = {
    buyFirst: buildBuyFirst,
    sellFirst: buildSellFirst,
    simultaneous: buildSimultaneous
  };

  var MOVE_IN_STEP_ID = {
    buyFirst: 'purchaseClose',
    sellFirst: 'purchaseClose',
    simultaneous: 'syncedClose'
  };

  var FINAL_CLOSE_STEP_ID = {
    buyFirst: 'saleClose',
    sellFirst: 'purchaseClose',
    simultaneous: 'syncedClose'
  };

  // durations: { daysToSell, daysToBuy, escrowDays }. startDate is never
  // mutated — every step derives via addDays(prev, n), which always clones.
  function computeTimeline(strategy, durations, startDate) {
    var builder = BUILDERS[strategy];
    if (!builder) throw new Error('Unknown strategy: ' + strategy);

    var steps = builder(durations, startDate).slice().sort(function (a, b) {
      return a.date.getTime() - b.date.getTime();
    });

    var byId = {};
    steps.forEach(function (s) { byId[s.id] = s; });
    var moveInStep = byId[MOVE_IN_STEP_ID[strategy]];
    var finalCloseStep = byId[FINAL_CLOSE_STEP_ID[strategy]];

    return {
      strategy: strategy,
      startDate: startDate,
      moveInDate: moveInStep.date,
      finalCloseDate: finalCloseStep.date,
      totalDays: daysBetween(startDate, finalCloseStep.date),
      gapDays: Math.abs(durations.daysToSell - durations.daysToBuy),
      steps: steps
    };
  }

  /* ── DOM wiring ── */
  if (typeof document !== 'undefined') {

    var strategy = DEFAULTS.strategy;

    var STRATEGY_LABELS = {
      buyFirst: 'Buy First',
      sellFirst: 'Sell First',
      simultaneous: 'Simultaneous Close'
    };

    var TRACK_COLOR = { sale: '#0d9488', purchase: '#1d4ed8', both: 'var(--text-muted)' };
    var TRACK_LABEL = { sale: 'Sale', purchase: 'Purchase' };

    function fmtDate(date) {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function todayLocalMidnight() {
      var now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    function getInputs() {
      var startEl = document.getElementById('startDate');
      var startDate = startEl.value ? parseDateInput(startEl.value) : todayLocalMidnight();
      return {
        strategy: strategy,
        startDate: startDate,
        daysToSell: parseInt(document.getElementById('daysToSell').value, 10) || DEFAULTS.daysToSell,
        daysToBuy: parseInt(document.getElementById('daysToBuy').value, 10) || DEFAULTS.daysToBuy,
        escrowDays: parseInt(document.getElementById('escrowDays').value, 10) || DEFAULTS.escrowDays
      };
    }

    function setToggle(groupSelector, value, dataAttr) {
      document.querySelectorAll(groupSelector).forEach(function (btn) {
        btn.classList.toggle('active', btn.dataset[dataAttr] === value);
      });
    }

    function render(res, inp) {
      var stratEl = document.getElementById('tlStrategyLabel');
      if (stratEl) stratEl.textContent = STRATEGY_LABELS[inp.strategy] + ' · starting ' + fmtDate(inp.startDate);

      var totalDaysEl = document.getElementById('tlTotalDays');
      if (totalDaysEl) totalDaysEl.textContent = res.totalDays + ' day' + (res.totalDays === 1 ? '' : 's');

      var moveInEl = document.getElementById('tlMoveInDate');
      if (moveInEl) moveInEl.textContent = fmtDate(res.moveInDate);

      var moveInSubEl = document.getElementById('tlMoveInSub');
      if (moveInSubEl) {
        moveInSubEl.textContent = res.moveInDate.getTime() === res.finalCloseDate.getTime()
          ? 'Same day as your final close'
          : 'Final close (sale of current home): ' + fmtDate(res.finalCloseDate);
      }

      var mbar1 = document.getElementById('mbar-v1');
      if (mbar1) mbar1.textContent = res.totalDays + 'd';
      var mbar2 = document.getElementById('mbar-v2');
      if (mbar2) mbar2.textContent = fmtDate(res.moveInDate);

      var stepsEl = document.getElementById('tlSteps');
      if (stepsEl) {
        stepsEl.innerHTML = '';
        res.steps.forEach(function (step) {
          var row = document.createElement('div');
          row.className = 'mum-timeline-step';
          row.style.setProperty('--dot-color', TRACK_COLOR[step.track]);

          var dot = document.createElement('div');
          dot.className = 'mum-timeline-dot';
          row.appendChild(dot);

          var dateEl = document.createElement('div');
          dateEl.className = 'mum-timeline-date';
          dateEl.textContent = fmtDate(step.date);
          row.appendChild(dateEl);

          var labelEl = document.createElement('div');
          labelEl.className = 'mum-timeline-label';
          labelEl.textContent = step.label;
          if (TRACK_LABEL[step.track]) {
            var tag = document.createElement('span');
            tag.className = 'mum-timeline-tag';
            tag.textContent = TRACK_LABEL[step.track];
            labelEl.appendChild(tag);
          }
          row.appendChild(labelEl);

          if (step.note) {
            var noteEl = document.createElement('div');
            noteEl.className = 'mum-timeline-note';
            noteEl.textContent = step.note;
            row.appendChild(noteEl);
          }

          stepsEl.appendChild(row);
        });
      }
    }

    function update() {
      var inp = getInputs();
      var durations = { daysToSell: inp.daysToSell, daysToBuy: inp.daysToBuy, escrowDays: inp.escrowDays };
      var res = computeTimeline(inp.strategy, durations, inp.startDate);
      render(res, inp);

      var sellVal = document.getElementById('daysToSellVal');
      if (sellVal) sellVal.textContent = inp.daysToSell + ' days';
      var buyVal = document.getElementById('daysToBuyVal');
      if (buyVal) buyVal.textContent = inp.daysToBuy + ' days';
      var escrowVal = document.getElementById('escrowDaysVal');
      if (escrowVal) escrowVal.textContent = inp.escrowDays + ' days';

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          strategy: inp.strategy,
          startDate: toDateInputValue(inp.startDate),
          daysToSell: inp.daysToSell,
          daysToBuy: inp.daysToBuy,
          escrowDays: inp.escrowDays
        }));
      } catch (e) {}
    }

    function setDefaults(v) {
      document.getElementById('startDate').value = v.startDate || toDateInputValue(todayLocalMidnight());
      document.getElementById('daysToSell').value = v.daysToSell != null ? v.daysToSell : DEFAULTS.daysToSell;
      document.getElementById('daysToBuy').value = v.daysToBuy != null ? v.daysToBuy : DEFAULTS.daysToBuy;
      document.getElementById('escrowDays').value = v.escrowDays != null ? v.escrowDays : DEFAULTS.escrowDays;
      strategy = v.strategy || DEFAULTS.strategy;
      setToggle('[data-strategy]', strategy, 'strategy');
    }

    document.addEventListener('DOMContentLoaded', function () {
      ['daysToSell', 'daysToBuy', 'escrowDays', 'startDate'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('input', update);
      });

      document.querySelectorAll('[data-strategy]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          strategy = btn.dataset.strategy;
          setToggle('[data-strategy]', strategy, 'strategy');
          update();
        });
      });

      var resetBtn = document.getElementById('resetBtn');
      if (resetBtn) {
        resetBtn.addEventListener('click', function () {
          try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
          setDefaults({});
          update();
        });
      }

      var saved = null;
      try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) {}
      setDefaults(saved || {});
      update();
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      addDays: addDays,
      parseDateInput: parseDateInput,
      toDateInputValue: toDateInputValue,
      nextBusinessDay: nextBusinessDay,
      daysBetween: daysBetween,
      computeTimeline: computeTimeline
    };
  }

}());
