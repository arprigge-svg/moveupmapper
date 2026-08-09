'use strict';

(function () {
  var MAPBOX_TOKEN = 'pk.eyJ1IjoibW92ZXVwbWFwcGVyIiwiYSI6ImNtc2t3Nmg4YzB2azIyeHB5NDVxem54c3AifQ.0zwYjQyoPmoD6oC9B002LQ';
  var MIN_LOCATIONS = 1;
  var MAX_LOCATIONS = 4;
  var ROW_COLORS = ['#4f46e5', '#0d9488', '#d97706', '#db2777'];
  var RESULT_COLOR = '#16a34a';

  var map = null;
  var mapReady = false;
  var markers = [];
  var sourceIds = [];
  var rowsContainer, addBtn, submitBtn, resultAlert, legend;

  function $(id) { return document.getElementById(id); }

  /* ── Row management ── */
  function createRow() {
    var wrap = document.createElement('div');
    wrap.className = 'commute-row-wrap';
    wrap.innerHTML =
      '<div class="commute-row">' +
        '<div class="commute-row-badge"></div>' +
        '<div class="input-wrap commute-row-address"><input type="text" class="commute-address" placeholder="Address, city, or landmark"></div>' +
        '<div class="mode-toggle commute-row-mode">' +
          '<button type="button" class="mode-btn active" data-mode="driving">Driving</button>' +
          '<button type="button" class="mode-btn" data-mode="walking">Walking</button>' +
        '</div>' +
        '<div class="input-wrap suffix commute-row-minutes"><input type="number" class="commute-minutes" min="5" max="60" step="5" value="15"><span class="affix">min</span></div>' +
        '<button type="button" class="commute-row-remove" aria-label="Remove this location">&times;</button>' +
      '</div>' +
      '<div class="commute-row-error" style="display:none"></div>';

    var modeBtns = wrap.querySelectorAll('.commute-row-mode .mode-btn');
    modeBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        modeBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
    });

    wrap.querySelector('.commute-row-remove').addEventListener('click', function () {
      wrap.remove();
      renumberRows();
    });

    return wrap;
  }

  function renumberRows() {
    var rows = rowsContainer.querySelectorAll('.commute-row-wrap');
    rows.forEach(function (wrap, i) {
      var badge = wrap.querySelector('.commute-row-badge');
      badge.textContent = i + 1;
      badge.style.background = ROW_COLORS[i % ROW_COLORS.length];
      wrap.querySelector('.commute-row-remove').style.visibility =
        rows.length > MIN_LOCATIONS ? 'visible' : 'hidden';
    });
    addBtn.style.display = rows.length >= MAX_LOCATIONS ? 'none' : '';
  }

  function addRow() {
    var count = rowsContainer.querySelectorAll('.commute-row-wrap').length;
    if (count >= MAX_LOCATIONS) return;
    rowsContainer.appendChild(createRow());
    renumberRows();
  }

  function getRowsData() {
    var rows = rowsContainer.querySelectorAll('.commute-row-wrap');
    var data = [];
    rows.forEach(function (wrap, i) {
      data.push({
        wrap: wrap,
        address: wrap.querySelector('.commute-address').value.trim(),
        mode: wrap.querySelector('.commute-row-mode .mode-btn.active').dataset.mode,
        minutes: parseInt(wrap.querySelector('.commute-minutes').value, 10) || 15,
        color: ROW_COLORS[i % ROW_COLORS.length]
      });
    });
    return data;
  }

  function setRowError(wrap, msg) {
    var el = wrap.querySelector('.commute-row-error');
    if (msg) { el.textContent = msg; el.style.display = ''; }
    else { el.style.display = 'none'; el.textContent = ''; }
  }

  /* ── Alert banner ── */
  function clearResultAlert() {
    resultAlert.style.display = 'none';
    resultAlert.className = 'alert';
    resultAlert.innerHTML = '';
  }

  function showResultAlert(type, title, sub) {
    var icon = type === 'red' ? '✕' : type === 'amber' ? '⚠' : '✓';
    resultAlert.className = 'alert alert-' + type;
    resultAlert.style.display = '';
    resultAlert.innerHTML =
      '<span class="alert-icon">' + icon + '</span>' +
      '<div class="alert-body"><div class="alert-title">' + title + '</div><div class="alert-sub">' + sub + '</div></div>';
  }

  /* ── Mapbox API calls ── */
  function geocode(address) {
    var url = 'https://api.mapbox.com/search/geocode/v6/forward?q=' + encodeURIComponent(address) +
      '&limit=1&autocomplete=false&access_token=' + MAPBOX_TOKEN;
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error('geocode-failed');
      return res.json();
    }).then(function (json) {
      var feat = json.features && json.features[0];
      if (!feat) throw new Error('geocode-not-found');
      return {
        lng: feat.geometry.coordinates[0],
        lat: feat.geometry.coordinates[1],
        label: (feat.properties && (feat.properties.full_address || feat.properties.name)) || address
      };
    });
  }

  function isochrone(lng, lat, mode, minutes) {
    var profile = mode === 'walking' ? 'walking' : 'driving';
    var url = 'https://api.mapbox.com/isochrone/v1/mapbox/' + profile + '/' + lng + ',' + lat +
      '?contours_minutes=' + minutes + '&polygons=true&access_token=' + MAPBOX_TOKEN;
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error('isochrone-failed');
      return res.json();
    }).then(function (json) {
      if (!json.features || !json.features.length) throw new Error('isochrone-empty');
      return json.features[0];
    });
  }

  /* ── Map rendering ── */
  function clearMapLayers() {
    markers.forEach(function (m) { m.remove(); });
    markers = [];
    sourceIds.forEach(function (id) {
      if (map.getLayer(id + '-fill')) map.removeLayer(id + '-fill');
      if (map.getLayer(id + '-line')) map.removeLayer(id + '-line');
      if (map.getSource(id)) map.removeSource(id);
    });
    sourceIds = [];
    legend.innerHTML = '';
  }

  function addPolygonLayer(id, geometry, color, fillOpacity, lineWidth) {
    map.addSource(id, { type: 'geojson', data: { type: 'Feature', geometry: geometry, properties: {} } });
    map.addLayer({
      id: id + '-fill', type: 'fill', source: id,
      paint: { 'fill-color': color, 'fill-opacity': fillOpacity }
    });
    map.addLayer({
      id: id + '-line', type: 'line', source: id,
      paint: { 'line-color': color, 'line-width': lineWidth, 'line-opacity': 0.8 }
    });
    sourceIds.push(id);
  }

  function addLegendItem(color, label) {
    var item = document.createElement('div');
    item.className = 'commute-legend-item';
    item.innerHTML = '<span class="commute-legend-swatch" style="background:' + color + '"></span>' + label;
    legend.appendChild(item);
  }

  /* ── Submit flow ── */
  function handleSubmit() {
    if (!mapReady) return;

    var rows = getRowsData();
    rows.forEach(function (r) { setRowError(r.wrap, null); });
    clearResultAlert();

    var validRows = rows.filter(function (r) { return r.address; });
    if (!validRows.length) {
      showResultAlert('red', 'Add at least one location', 'Enter an address above, then click Find My Search Area.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Finding…';

    Promise.all(validRows.map(function (r) {
      return geocode(r.address).catch(function () { return { error: true }; });
    })).then(function (geocoded) {
      var hadError = false;
      geocoded.forEach(function (g, i) {
        if (g.error) {
          hadError = true;
          setRowError(validRows[i].wrap, "Couldn't find that address — try adding a city and state.");
        }
      });
      if (hadError) { resetSubmitButton(); return; }

      Promise.all(validRows.map(function (r, i) {
        return isochrone(geocoded[i].lng, geocoded[i].lat, r.mode, r.minutes).catch(function () { return { error: true }; });
      })).then(function (isochrones) {
        var hadIsoError = false;
        isochrones.forEach(function (iso, i) {
          if (iso.error) {
            hadIsoError = true;
            setRowError(validRows[i].wrap, "Couldn't calculate a travel-time area for this location.");
          }
        });
        if (hadIsoError) { resetSubmitButton(); return; }

        renderResults(validRows, geocoded, isochrones);
        resetSubmitButton();
      }).catch(function () {
        showResultAlert('red', 'Something went wrong', 'The travel-time lookup failed. Please try again in a moment.');
        resetSubmitButton();
      });
    }).catch(function () {
      showResultAlert('red', 'Something went wrong', 'The address lookup failed. Please try again in a moment.');
      resetSubmitButton();
    });
  }

  function resetSubmitButton() {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Find My Search Area';
  }

  function renderResults(validRows, geocoded, isochrones) {
    clearMapLayers();

    var bounds = new mapboxgl.LngLatBounds();

    validRows.forEach(function (r, i) {
      var g = geocoded[i];
      bounds.extend([g.lng, g.lat]);

      var marker = new mapboxgl.Marker({ color: r.color })
        .setLngLat([g.lng, g.lat])
        .setPopup(new mapboxgl.Popup({ offset: 20 }).setText((i + 1) + '. ' + g.label))
        .addTo(map);
      markers.push(marker);

      addPolygonLayer('iso-' + i, isochrones[i].geometry, r.color, 0.10, 1.5);
      addLegendItem(r.color, (i + 1) + '. ' + g.label);
    });

    var intersection = isochrones[0];
    for (var i = 1; i < isochrones.length; i++) {
      if (!intersection) break;
      intersection = turf.intersect(turf.featureCollection([intersection, isochrones[i]]));
    }

    if (validRows.length > 1 && intersection) {
      addPolygonLayer('result', intersection.geometry, RESULT_COLOR, 0.4, 2.5);
      var b = turf.bbox(intersection);
      bounds.extend([b[0], b[1]]);
      bounds.extend([b[2], b[3]]);
      addLegendItem(RESULT_COLOR, 'Your search area');
      showResultAlert('green', 'Search area found',
        'The highlighted region on the map is within your specified travel time of every location you entered.');
    } else if (validRows.length > 1) {
      showResultAlert('amber', 'No overlapping area found',
        'These locations don’t share a common area within the times you set. Try increasing a travel time or double-checking an address.');
    } else {
      showResultAlert('green', 'Search area found',
        'The highlighted region is within your specified travel time of this location.');
    }

    map.fitBounds(bounds, { padding: 60, maxZoom: 13, duration: 600 });
  }

  /* ── Init ── */
  function init() {
    rowsContainer = $('commuteRows');
    addBtn = $('commuteAddRow');
    submitBtn = $('commuteSubmit');
    resultAlert = $('commuteResultAlert');
    legend = $('commuteLegend');

    addRow();
    addRow();

    addBtn.addEventListener('click', addRow);
    submitBtn.addEventListener('click', handleSubmit);

    // Sources/layers can't be added until the style has finished loading —
    // block submission until then so an early click can't silently no-op.
    submitBtn.disabled = true;
    submitBtn.textContent = 'Loading map…';

    mapboxgl.accessToken = MAPBOX_TOKEN;
    map = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/light-v11',
      center: [-98.5795, 39.8283],
      zoom: 3.2
    });
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.on('load', function () {
      mapReady = true;
      resetSubmitButton();
    });

    // If the map hasn't finished loading after a while (slow connection,
    // network hiccup), stop leaving the button stuck on "Loading map…"
    // forever with no explanation.
    setTimeout(function () {
      if (!mapReady) {
        submitBtn.textContent = 'Map failed to load — refresh the page';
      }
    }, 15000);
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', init);
  }
}());
