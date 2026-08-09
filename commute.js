'use strict';

(function () {
  var MAPBOX_TOKEN = 'pk.eyJ1IjoibW92ZXVwbWFwcGVyIiwiYSI6ImNtc2t3Nmg4YzB2azIyeHB5NDVxem54c3AifQ.0zwYjQyoPmoD6oC9B002LQ';
  var MIN_LOCATIONS = 1;
  var MAX_LOCATIONS = 4;
  var SUGGEST_DEBOUNCE_MS = 300;
  var SUGGEST_MIN_CHARS = 3;
  var ROW_COLORS = ['#4f46e5', '#0d9488', '#d97706', '#db2777'];
  var RESULT_COLOR = '#16a34a';
  var ZCTA_QUERY_URL = 'https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_TAB2020/PUMA_TAD_TAZ_UGA_ZCTA/MapServer/3/query';

  var map = null;
  var mapReady = false;
  var markers = [];
  var sourceIds = [];
  var pickRow = null;
  var pickBtn = null;
  var lastRender = null;
  var lastZcta = null;
  var rowsContainer, addBtn, submitBtn, resultAlert, legend, pickHint, pickHintDot, pickHintText, styleToggle, styleBtns, zipSection, zipList;

  function $(id) { return document.getElementById(id); }

  /* ── Row management ── */
  function createRow() {
    var wrap = document.createElement('div');
    wrap.className = 'commute-row-wrap';
    wrap.innerHTML =
      '<div class="commute-row">' +
        '<div class="commute-row-badge"></div>' +
        '<div class="commute-row-address">' +
          '<div class="input-wrap">' +
            '<input type="text" class="commute-address" placeholder="Address, city, or landmark" autocomplete="off">' +
            '<button type="button" class="commute-pick-btn" aria-label="Pick this location on the map" title="Pick this location on the map">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>' +
            '</button>' +
          '</div>' +
          '<div class="commute-suggestions"></div>' +
        '</div>' +
        '<div class="mode-toggle commute-row-mode">' +
          '<button type="button" class="mode-btn active" data-mode="driving">Driving</button>' +
          '<button type="button" class="mode-btn" data-mode="walking">Walking</button>' +
        '</div>' +
        '<div class="input-wrap suffix commute-row-minutes"><input type="number" class="commute-minutes" min="5" max="60" step="5" value="15" title="Maximum 60 minutes — the limit of our travel-time data provider"><span class="affix">min</span></div>' +
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
      if (pickRow === wrap) exitPickMode();
      if (wrap._previewMarker) wrap._previewMarker.remove();
      wrap.remove();
      renumberRows();
    });

    wrap.querySelector('.commute-pick-btn').addEventListener('click', function (e) {
      if (pickRow === wrap) exitPickMode();
      else enterPickMode(wrap, e.currentTarget);
    });

    wireAddressAutocomplete(
      wrap,
      wrap.querySelector('.commute-address'),
      wrap.querySelector('.commute-suggestions')
    );

    return wrap;
  }

  function rowColor(wrap) {
    var rows = Array.prototype.slice.call(rowsContainer.querySelectorAll('.commute-row-wrap'));
    return ROW_COLORS[rows.indexOf(wrap) % ROW_COLORS.length];
  }

  /* ── Pick-on-map mode ── */
  function enterPickMode(wrap, btn) {
    exitPickMode();
    pickRow = wrap;
    pickBtn = btn;
    btn.classList.add('active');
    if (map) map.getCanvas().style.cursor = 'crosshair';

    var rows = Array.prototype.slice.call(rowsContainer.querySelectorAll('.commute-row-wrap'));
    var idx = rows.indexOf(wrap) + 1;
    pickHintDot.style.background = rowColor(wrap);
    pickHintText.textContent = 'Click the map to set location ' + idx + '.';
    pickHint.style.display = 'flex';
  }

  function exitPickMode() {
    if (pickBtn) pickBtn.classList.remove('active');
    pickRow = null;
    pickBtn = null;
    if (map) map.getCanvas().style.cursor = '';
    pickHint.style.display = 'none';
  }

  function formatCoord(lng, lat) {
    return lat.toFixed(5) + ', ' + lng.toFixed(5);
  }

  function placePreviewMarker(wrap, lng, lat, color) {
    if (wrap._previewMarker) wrap._previewMarker.remove();
    var marker = new mapboxgl.Marker({ color: color, draggable: true }).setLngLat([lng, lat]).addTo(map);
    marker.on('dragend', function () {
      var pos = marker.getLngLat();
      applyPickedLocation(wrap, pos.lng, pos.lat);
    });
    wrap._previewMarker = marker;
    return marker;
  }

  function applyPickedLocation(wrap, lng, lat) {
    var input = wrap.querySelector('.commute-address');
    var box = wrap.querySelector('.commute-suggestions');
    box.classList.remove('open');
    box.innerHTML = '';
    input.blur();
    input.value = 'Locating…';
    wrap._verified = null;

    reverseGeocode(lng, lat).then(function (label) {
      input.value = label;
      wrap._verified = { lng: lng, lat: lat, label: label };
    }).catch(function () {
      var fallback = formatCoord(lng, lat);
      input.value = fallback;
      wrap._verified = { lng: lng, lat: lat, label: fallback };
    });
  }

  function handleMapPick(e) {
    if (!pickRow) return;
    var wrap = pickRow;
    var lng = e.lngLat.lng, lat = e.lngLat.lat;
    exitPickMode();
    placePreviewMarker(wrap, lng, lat, rowColor(wrap));
    applyPickedLocation(wrap, lng, lat);
  }

  /* ── Address autocomplete ── */
  function wireAddressAutocomplete(wrap, input, box) {
    var debounceTimer = null;
    var requestSeq = 0;
    var activeIndex = -1;
    var currentResults = [];

    function closeBox() {
      box.classList.remove('open');
      box.innerHTML = '';
      currentResults = [];
      activeIndex = -1;
    }

    function selectResult(result) {
      input.value = result.label;
      wrap._verified = { lng: result.lng, lat: result.lat, label: result.label };
      closeBox();
    }

    function highlight(index) {
      var items = box.querySelectorAll('.commute-suggestion');
      items.forEach(function (el, i) { el.classList.toggle('active', i === index); });
      activeIndex = index;
    }

    function renderResults(results) {
      currentResults = results;
      activeIndex = -1;
      if (!results.length) { closeBox(); return; }
      box.innerHTML = '';
      results.forEach(function (r) {
        var item = document.createElement('div');
        item.className = 'commute-suggestion';
        var main = document.createElement('div');
        main.className = 'commute-suggestion-main';
        main.textContent = r.mainText;
        var sub = document.createElement('div');
        sub.className = 'commute-suggestion-sub';
        sub.textContent = r.subText;
        item.appendChild(main);
        item.appendChild(sub);
        // mousedown (not click) fires before the input's blur handler closes the box
        item.addEventListener('mousedown', function (e) {
          e.preventDefault();
          selectResult(r);
        });
        box.appendChild(item);
      });
      box.classList.add('open');
    }

    input.addEventListener('input', function () {
      wrap._verified = null;
      var q = input.value.trim();
      clearTimeout(debounceTimer);
      if (q.length < SUGGEST_MIN_CHARS) { closeBox(); return; }
      var seq = ++requestSeq;
      debounceTimer = setTimeout(function () {
        suggest(q).then(function (results) {
          if (seq !== requestSeq) return; // a newer keystroke has since fired
          renderResults(results);
        }).catch(function () {
          if (seq !== requestSeq) return;
          closeBox();
        });
      }, SUGGEST_DEBOUNCE_MS);
    });

    input.addEventListener('keydown', function (e) {
      if (!box.classList.contains('open')) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        highlight(Math.min(activeIndex + 1, currentResults.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        highlight(Math.max(activeIndex - 1, 0));
      } else if (e.key === 'Enter') {
        if (activeIndex >= 0) {
          e.preventDefault();
          selectResult(currentResults[activeIndex]);
        }
      } else if (e.key === 'Escape') {
        closeBox();
      }
    });

    input.addEventListener('blur', function () {
      setTimeout(closeBox, 150);
    });
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
      // parseInt(...) || 15 would silently turn a literal "0" into 15 (0 is
      // falsy) and skip the 5-60 range check entirely — check NaN explicitly
      // so an out-of-range value like 0 surfaces the same inline error a
      // value like 90 already does, instead of being coerced with no feedback.
      var minutesVal = parseInt(wrap.querySelector('.commute-minutes').value, 10);
      data.push({
        wrap: wrap,
        address: wrap.querySelector('.commute-address').value.trim(),
        mode: wrap.querySelector('.commute-row-mode .mode-btn.active').dataset.mode,
        minutes: isNaN(minutesVal) ? 15 : minutesVal,
        color: ROW_COLORS[i % ROW_COLORS.length],
        verified: wrap._verified || null
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

  function suggest(query) {
    var url = 'https://api.mapbox.com/search/geocode/v6/forward?q=' + encodeURIComponent(query) +
      '&limit=5&autocomplete=true&access_token=' + MAPBOX_TOKEN;
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error('suggest-failed');
      return res.json();
    }).then(function (json) {
      var feats = json.features || [];
      return feats.map(function (feat) {
        var props = feat.properties || {};
        var full = props.full_address || props.name || query;
        return {
          lng: feat.geometry.coordinates[0],
          lat: feat.geometry.coordinates[1],
          label: full,
          mainText: props.name || full,
          subText: props.place_formatted || ''
        };
      });
    });
  }

  function reverseGeocode(lng, lat) {
    var url = 'https://api.mapbox.com/search/geocode/v6/reverse?longitude=' + lng + '&latitude=' + lat +
      '&access_token=' + MAPBOX_TOKEN;
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error('reverse-failed');
      return res.json();
    }).then(function (json) {
      var feat = json.features && json.features[0];
      if (!feat) throw new Error('reverse-not-found');
      var props = feat.properties || {};
      return props.full_address || props.name || formatCoord(lng, lat);
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

  // The US Census Bureau's TIGERweb service (free, public, CORS-enabled) lets
  // us query ZCTA (ZIP code) polygons that genuinely intersect our exact
  // search-area geometry — no bundled dataset, no precision loss from
  // approximating the shape.
  function toEsriRings(geometry) {
    if (geometry.type === 'Polygon') return geometry.coordinates;
    var rings = [];
    geometry.coordinates.forEach(function (poly) {
      poly.forEach(function (ring) { rings.push(ring); });
    });
    return rings;
  }

  function queryZctas(geometry) {
    var body = new URLSearchParams({
      geometry: JSON.stringify({ rings: toEsriRings(geometry), spatialReference: { wkid: 4326 } }),
      geometryType: 'esriGeometryPolygon',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'ZCTA5',
      returnGeometry: 'true',
      outSR: '4326',
      f: 'geojson'
    });
    return fetch(ZCTA_QUERY_URL, { method: 'POST', body: body }).then(function (res) {
      if (!res.ok) throw new Error('zcta-query-failed');
      return res.json();
    }).then(function (geojson) {
      if (!geojson.features) throw new Error('zcta-query-bad-response');
      var zips = geojson.features.map(function (f) { return f.properties.ZCTA5; }).filter(Boolean);
      zips.sort();
      return { zips: zips, geojson: geojson };
    });
  }

  function addZctaLayer(geojson) {
    map.addSource('zcta', { type: 'geojson', data: geojson });
    map.addLayer({
      id: 'zcta-line', type: 'line', source: 'zcta',
      paint: { 'line-color': '#6b7280', 'line-width': 1.25, 'line-dasharray': [2, 2], 'line-opacity': 0.8 }
    });
  }

  function removeZctaLayer() {
    if (map.getLayer('zcta-line')) map.removeLayer('zcta-line');
    if (map.getSource('zcta')) map.removeSource('zcta');
  }

  function clearZipList() {
    lastZcta = null;
    zipList.innerHTML = '';
    zipSection.style.display = 'none';
  }

  function renderZipList(zips) {
    zipList.innerHTML = '';
    zips.forEach(function (zip) {
      var a = document.createElement('a');
      a.className = 'commute-zip-pill';
      a.href = 'https://www.zillow.com/homes/' + encodeURIComponent(zip) + '_rb/';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = zip;
      zipList.appendChild(a);
    });
    zipSection.style.display = zips.length ? '' : 'none';
  }

  // Fetches and renders in the background — this is supplementary context on
  // top of an already-successful search, so a slow or failed lookup here
  // shouldn't disrupt the map result that already rendered. The submit
  // button re-enables as soon as renderResults() returns, before this fetch
  // resolves, so a fast resubmit can start a second lookup before the first
  // one lands — guard with a sequence number the same way suggest() does,
  // so a stale response can't overwrite a newer search's results.
  var zctaRequestSeq = 0;
  function fetchAndShowZctas(geometry) {
    var seq = ++zctaRequestSeq;
    queryZctas(geometry).then(function (result) {
      if (seq !== zctaRequestSeq) return;
      lastZcta = result;
      if (!result.zips.length) return;
      addZctaLayer(result.geojson);
      renderZipList(result.zips);
    }).catch(function () {});
  }

  /* ── Map rendering ── */
  function clearMapLayers() {
    markers.forEach(function (m) { m.remove(); });
    markers = [];
    rowsContainer.querySelectorAll('.commute-row-wrap').forEach(function (wrap) {
      if (wrap._previewMarker) { wrap._previewMarker.remove(); wrap._previewMarker = null; }
    });
    sourceIds.forEach(function (id) {
      if (map.getLayer(id + '-fill')) map.removeLayer(id + '-fill');
      if (map.getLayer(id + '-line')) map.removeLayer(id + '-line');
      if (map.getSource(id)) map.removeSource(id);
    });
    sourceIds = [];
    removeZctaLayer();
    legend.innerHTML = '';
    clearZipList();
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
    var swatch = document.createElement('span');
    swatch.className = 'commute-legend-swatch';
    swatch.style.background = color;
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(label));
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

    // Mapbox's Isochrone API caps contours_minutes at 60 (driving/walking) —
    // the field's max="60" only limits the spinner, not free typing, so a
    // typed value like 90 would otherwise reach the API and fail there.
    var hadRangeError = false;
    validRows.forEach(function (r) {
      if (r.minutes < 5 || r.minutes > 60) {
        hadRangeError = true;
        setRowError(r.wrap, 'Enter a travel time between 5 and 60 minutes — 60 is the max our travel-time data provider supports.');
      }
    });
    if (hadRangeError) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Finding…';
    // setStyle() wipes sources/layers until the new style finishes loading,
    // so switching mid-search could throw inside renderResults right as a
    // successful fetch resolves — block it while a search is in flight.
    styleBtns.forEach(function (b) { b.disabled = true; });

    Promise.all(validRows.map(function (r) {
      if (r.verified) return Promise.resolve(r.verified);
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
    styleBtns.forEach(function (b) { b.disabled = false; });
  }

  function renderResults(validRows, geocoded, isochrones) {
    lastRender = { validRows: validRows, geocoded: geocoded, isochrones: isochrones };
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
      fetchAndShowZctas(intersection.geometry);
    } else if (validRows.length > 1) {
      showResultAlert('amber', 'No overlapping area found',
        'These locations don’t share a common area within the times you set. Try increasing a travel time or double-checking an address.');
    } else {
      showResultAlert('green', 'Search area found',
        'The highlighted region is within your specified travel time of this location.');
      fetchAndShowZctas(isochrones[0].geometry);
    }

    map.fitBounds(bounds, { padding: 60, maxZoom: 13, duration: 600 });
  }

  // setStyle() replaces the whole style, wiping any sources/layers we added
  // (markers are separate DOM overlays and survive it automatically) — so
  // the last rendered result needs to be redrawn once the new style is ready.
  function redrawAfterStyleChange() {
    if (!lastRender) return;
    sourceIds = [];
    legend.innerHTML = '';

    var validRows = lastRender.validRows, geocoded = lastRender.geocoded, isochrones = lastRender.isochrones;
    validRows.forEach(function (r, i) {
      addPolygonLayer('iso-' + i, isochrones[i].geometry, r.color, 0.10, 1.5);
      addLegendItem(r.color, (i + 1) + '. ' + geocoded[i].label);
    });

    var intersection = isochrones[0];
    for (var i = 1; i < isochrones.length; i++) {
      if (!intersection) break;
      intersection = turf.intersect(turf.featureCollection([intersection, isochrones[i]]));
    }
    if (validRows.length > 1 && intersection) {
      addPolygonLayer('result', intersection.geometry, RESULT_COLOR, 0.4, 2.5);
      addLegendItem(RESULT_COLOR, 'Your search area');
    }

    if (lastZcta && lastZcta.zips.length) addZctaLayer(lastZcta.geojson);
  }

  function resetAll() {
    exitPickMode();
    rowsContainer.querySelectorAll('.commute-row-wrap').forEach(function (wrap) {
      if (wrap._previewMarker) wrap._previewMarker.remove();
    });
    if (map && mapReady) clearMapLayers();
    lastRender = null;
    clearResultAlert();
    clearZipList();

    rowsContainer.innerHTML = '';
    addRow();
    addRow();

    if (map) {
      var lightBtn = styleToggle.querySelector('.mode-btn[data-style="light-v11"]');
      if (!lightBtn.classList.contains('active')) {
        styleBtns.forEach(function (b) { b.classList.remove('active'); });
        lightBtn.classList.add('active');
        map.setStyle('mapbox://styles/mapbox/light-v11');
      }
      map.flyTo({ center: [-98.5795, 39.8283], zoom: 3.2, duration: 600 });
    }
  }

  /* ── Init ── */
  function init() {
    rowsContainer = $('commuteRows');
    addBtn = $('commuteAddRow');
    submitBtn = $('commuteSubmit');
    resultAlert = $('commuteResultAlert');
    legend = $('commuteLegend');
    pickHint = $('commutePickHint');
    pickHintDot = pickHint.querySelector('.commute-pick-hint-dot');
    pickHintText = $('commutePickHintText');
    styleToggle = $('commuteStyleToggle');
    zipSection = $('commuteZipSection');
    zipList = $('commuteZipList');

    addRow();
    addRow();

    addBtn.addEventListener('click', addRow);
    submitBtn.addEventListener('click', handleSubmit);
    $('commuteReset').addEventListener('click', resetAll);
    $('commutePickCancel').addEventListener('click', exitPickMode);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && pickRow) exitPickMode();
    });

    styleBtns = styleToggle.querySelectorAll('.mode-btn');
    styleBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.classList.contains('active') || !map) return;
        styleBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        map.setStyle('mapbox://styles/mapbox/' + btn.dataset.style);
      });
    });

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
    map.on('click', handleMapPick);
    map.on('load', function () {
      mapReady = true;
      resetSubmitButton();
    });
    map.on('style.load', redrawAfterStyleChange);

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
