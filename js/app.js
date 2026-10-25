// Main app: map, layer/level/time orchestration
(function (W) {
  const C = W.config;

  const map = L.map("map", { zoomControl: true, worldCopyJump: true })
    .setView(C.startCenter, C.startZoom);

  // Dark base map — OSM darkened via CSS filter on its own pane
  map.createPane("basemap");
  const bmPane = map.getPane("basemap");
  bmPane.style.zIndex = 150;
  bmPane.style.filter = "invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.9)";
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, pane: "basemap", attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  const state = {
    layer: "wind", level: "10m", model: "best_match", marker: null,
    lastPoint: null, scalar: null, radar: null, playTimer: null,
  };

  // ---- Variable resolution for the active layer ----------------------
  function spec() {
    const o = W.overlays[state.layer];
    const lvl = W.levels.find((l) => l.id === state.level) || W.levels[0];
    if (o.kind === "wind") {
      const suf = lvl.windSuffix;
      const speedVar = `wind_speed_${suf}`, dirVar = `wind_direction_${suf}`;
      return { kind: "wind", vars: [speedVar, dirVar], speedVar, dirVar,
        colorFn: W.colorFor("wind"), opacity: 0.45, marine: false, model: state.model };
    }
    if (o.kind === "scalar") {
      const v = o.altAware ? lvl.tempVar : o.var;
      return { kind: "scalar", vars: [v], scalarVar: v,
        colorFn: W.colorFor(o.colorFn), opacity: o.opacity || 0.55,
        marine: !!o.marine, airquality: !!o.airquality, model: state.model };
    }
    return { kind: o.kind };
  }

  // ---- Teardown ------------------------------------------------------
  function teardown() {
    W.wind.remove(map);
    if (state.scalar) { map.removeLayer(state.scalar); state.scalar = null; }
    if (state.radar) { map.removeLayer(state.radar); state.radar = null; }
    if (state.webcamGroup) { map.removeLayer(state.webcamGroup); state.webcamGroup = null; }
  }

  // ---- Webcams (Windy Webcams API — needs the user's own free key) ----
  const getWindyKey = () => { try { return localStorage.getItem("ow_windy_key") || ""; } catch (e) { return ""; } };
  async function loadWebcams() {
    if (state.webcamGroup) { map.removeLayer(state.webcamGroup); state.webcamGroup = null; }
    const key = getWindyKey();
    if (!key) {
      W.ui.setLegend("🎥 מצלמות — הזן מפתח חינמי בהגדרות (⚙) כדי להפעיל");
      return;
    }
    W.ui.loading(true);
    try {
      const cams = await W.api.webcams(map.getBounds(), key);
      state.webcamGroup = L.layerGroup().addTo(map);
      let shown = 0;
      cams.forEach((cam) => {
        const loc = cam.location || {};
        const lat = loc.latitude, lon = loc.longitude;
        if (lat == null || lon == null) return;
        const imgs = cam.images || {};
        const img = (imgs.current && (imgs.current.preview || imgs.current.thumbnail)) || imgs.preview || "";
        const p = cam.player || {};
        const live = p.live || p.day || p.month || p.lifetime || "";
        const icon = L.divIcon({ className: "", html: '<div class="webcam-pin">📷</div>',
          iconSize: [24, 24], iconAnchor: [12, 12] });
        const m = L.marker([lat, lon], { icon }).addTo(state.webcamGroup);
        m.bindPopup(`<div class="wc-pop"><div class="wc-t">${cam.title || "מצלמה"}</div>` +
          (img ? `<img src="${img}" loading="lazy"/>` : "") +
          (live ? `<a href="${live}" target="_blank" rel="noopener">▶ צפייה חיה</a>` : "") + `</div>`);
        shown++;
      });
      W.ui.setLegend(`🎥 ${shown} מצלמות באזור (Windy Webcams)`);
    } catch (e) {
      W.ui.setLegend(e.code === 401 || e.code === 403
        ? "🎥 מפתח לא תקין — בדוק בהגדרות (⚙)"
        : "🎥 שגיאה בטעינת מצלמות");
    } finally { W.ui.loading(false); }
  }

  // ---- Build active layer (fetches field) ----------------------------
  async function buildLayer() {
    stopPlay();
    const s = spec();
    teardown();

    const altAware = W.overlays[state.layer].altAware;
    W.ui.setActiveLayer(state.layer);
    W.ui.setActiveLevel(state.level);
    W.ui.setLevelsEnabled(!!altAware);

    if (s.kind === "webcams") {
      W.ui.setSliderEnabled(false);
      await loadWebcams();
      return;
    }

    if (s.kind === "radar" || s.kind === "satellite") {
      W.ui.setSliderEnabled(false);
      W.ui.loading(true);
      try {
        if (s.kind === "satellite") {
          state.radar = W.satelliteTiles().addTo(map);
          W.ui.setLegend("🛰️ לוויין MODIS (צבע אמיתי, NASA) — תמונה יומית, זום עד 9");
        } else {
          const rv = await W.api.rainviewer();
          if (rv.radar.length) {
            state.radar = W.radarTiles(rv.host, rv.radar[rv.radar.length - 1]).addTo(map);
            W.ui.setLegend("🌧️ ראדאר משקעים בזמן אמת (RainViewer)");
          } else W.ui.setLegend("אין כרגע נתוני ראדאר");
        }
      } catch (e) { alert("שגיאה: " + e.message); }
      finally { W.ui.loading(false); }
      return;
    }

    W.ui.setSliderEnabled(true);
    W.ui.loading(true);
    try {
      await W.Field.load(map.getBounds(), s.vars,
        { marine: s.marine, airquality: s.airquality, model: s.model });
      W.ui.setTimes(W.Field.times);
      // create layers
      if (s.kind === "wind" || W.overlays[state.layer].particles) {
        // speed color overlay underneath particles
      }
      state.scalar = new W.ScalarLayer({ colorFn: s.colorFn, opacity: s.opacity }).addTo(map);
      renderAt(W.ui.getTimeIndex());
      setLegendFor(s);
    } catch (e) {
      console.error(e);
      W.ui.setLegend(e.code === 429
        ? "⏳ חרגת ממכסת הבקשות החינמית של Open-Meteo — נסה שוב בעוד כמה דקות"
        : "שגיאה בטעינת נתונים — נסה אזור/זום אחר");
    } finally { W.ui.loading(false); }
  }

  function setLegendFor(s) {
    const L2 = state.level !== "10m" ? ` · ${state.level}` : "";
    const map2 = {
      wind: `💨 רוח (${W.units.windUnit()})${L2} — חלקיקים + צבע מהירות`,
      gusts: `🌬️ משבי רוח (${W.units.windUnit()})`,
      temp: `🌡️ טמפרטורה (${W.units.tempUnit()})${L2}`,
      clouds: "☁️ כיסוי עננים (%)",
      humidity: "💧 לחות יחסית (%)",
      pressure: "🎈 לחץ ברומטרי (hPa)",
      waves: "🌊 גובה גלים (מ') — מעל ים בלבד",
      aqi: "😷 איכות אוויר (EAQI) — ירוק טוב · סגול מסוכן",
    };
    W.ui.setLegend(map2[state.layer] || "");
  }

  // ---- Render at a time index (no network) ---------------------------
  function renderAt(ti) {
    if (!W.Field.grid) return;
    const s = spec();
    if (s.kind === "wind") {
      W.wind.show(map, W.Field.velocityAt(ti, s.speedVar, s.dirVar));
      if (state.scalar) state.scalar.setData(W.Field.scalarAt(ti, s.speedVar));
    } else if (s.kind === "scalar") {
      if (state.scalar) state.scalar.setData(W.Field.scalarAt(ti, s.scalarVar));
    }
  }

  // ---- Play / pause --------------------------------------------------
  function startPlay() {
    if (state.playTimer) return;
    W.ui.setPlaying(true);
    const max = W.Field.times.length - 1, step = C.sliderStepHours;
    state.playTimer = setInterval(() => {
      let i = W.ui.getTimeIndex() + step;
      if (i > max) i = 0;
      W.ui.setTimeIndex(i);
      renderAt(i);
    }, 650);
  }
  function stopPlay() {
    if (state.playTimer) { clearInterval(state.playTimer); state.playTimer = null; }
    W.ui.setPlaying(false);
  }

  // ---- Build control bars + wiring -----------------------------------
  W.ui.buildLayers(W.overlays, state.layer, (key) => { state.layer = key; buildLayer(); });
  W.ui.buildLevels(W.levels, state.level, (id) => { state.level = id; buildLayer(); });
  W.ui.initSlider({
    onScrub: (i) => renderAt(i),
    onPlayToggle: () => (state.playTimer ? stopPlay() : startPlay()),
  });

  // Model selector
  const modelSel = document.getElementById("model-select");
  W.models.forEach((m) => {
    const o = document.createElement("option");
    o.value = m.id; o.textContent = m.label; modelSel.appendChild(o);
  });
  modelSel.value = state.model;
  modelSel.addEventListener("change", () => {
    state.model = modelSel.value;
    buildLayer();
    if (state.lastPoint) showForecast(state.lastPoint.lat, state.lastPoint.lon, state.lastPoint.label);
  });

  // Webcams key field
  const wkInput = document.getElementById("webcam-key");
  wkInput.value = getWindyKey();
  document.getElementById("webcam-save").addEventListener("click", () => {
    try { localStorage.setItem("ow_windy_key", wkInput.value.trim()); } catch (e) {}
    document.getElementById("settings-popover").classList.add("hidden");
    if (state.layer === "webcams") buildLayer();
  });

  // Self-hosted Open-Meteo base field
  const omInput = document.getElementById("om-base");
  try { omInput.value = localStorage.getItem("ow_om_base") || ""; } catch (e) {}
  document.getElementById("om-save").addEventListener("click", () => {
    try { localStorage.setItem("ow_om_base", omInput.value.trim()); } catch (e) {}
    document.getElementById("settings-popover").classList.add("hidden");
    W.Field._key = null; // invalidate cache so next load hits the new endpoint
    buildLayer();
  });

  // Reload when view changes (debounced)
  let moveTimer = null;
  map.on("moveend", () => {
    const s = spec();
    if (s.kind === "radar" || s.kind === "satellite") return;
    clearTimeout(moveTimer);
    moveTimer = setTimeout(async () => {
      if (s.kind === "webcams") { loadWebcams(); return; }
      try {
        await W.Field.load(map.getBounds(), s.vars,
          { marine: s.marine, airquality: s.airquality, model: s.model });
        W.ui.setTimes(W.Field.times);
        renderAt(W.ui.getTimeIndex());
      } catch (e) { console.warn(e); }
    }, 500);
  });

  // ---- Point forecast on click ---------------------------------------
  async function showForecast(lat, lon, label) {
    state.lastPoint = { lat, lon, label };
    W.ui.loading(true);
    try {
      const data = await W.api.pointForecast(lat, lon, state.model);
      state.lastForecast = data;
      if (state.marker) map.removeLayer(state.marker);
      state.marker = L.marker([lat, lon]).addTo(map);
      W.ui.renderForecast(data, label);
      updateFavButton();
      const sb = document.getElementById("open-sounding");
      if (sb) sb.addEventListener("click", () => showSounding(lat, lon, label));
    } catch (e) {
      alert(e.code === 429 ? "חרגת ממכסת Open-Meteo — נסה בעוד כמה דקות" : "שגיאת תחזית: " + e.message);
    } finally { W.ui.loading(false); }
  }

  async function showSounding(lat, lon, label) {
    W.ui.loading(true);
    try {
      const hourly = await W.api.sounding(lat, lon);
      W.ui.renderSounding(hourly, label || `${lat.toFixed(2)}, ${lon.toFixed(2)}`, () => {
        if (state.lastForecast) { W.ui.renderForecast(state.lastForecast, label); updateFavButton();
          const sb = document.getElementById("open-sounding");
          if (sb) sb.addEventListener("click", () => showSounding(lat, lon, label)); }
      });
    } catch (e) {
      alert(e.code === 429 ? "חרגת ממכסת Open-Meteo — נסה בעוד כמה דקות" : "שגיאת סאונדינג: " + e.message);
    } finally { W.ui.loading(false); }
  }

  // ---- Favorites -----------------------------------------------------
  const favBtn = document.getElementById("panel-fav");
  function updateFavButton() {
    const p = state.lastPoint;
    if (!p) { favBtn.classList.add("hidden"); return; }
    favBtn.classList.remove("hidden");
    const saved = W.favorites.has(p.lat, p.lon);
    favBtn.textContent = saved ? "★ נשמר" : "☆ שמור";
    favBtn.classList.toggle("saved", saved);
  }
  favBtn.addEventListener("click", () => {
    const p = state.lastPoint; if (!p) return;
    W.favorites.toggle(p.label, p.lat, p.lon);
    updateFavButton();
  });

  const favPop = document.getElementById("fav-popover");
  function renderFavPopover() {
    const favs = W.favorites.all();
    favPop.innerHTML = `<div class="fav-title">מיקומים שמורים</div>` +
      (favs.length ? favs.map((f, i) =>
        `<div class="fav-item" data-i="${i}"><span>📍 ${f.name}</span>
         <button class="del" data-i="${i}" title="מחק">×</button></div>`).join("")
        : `<div class="fav-empty">אין עדיין מיקומים שמורים. פתח תחזית ולחץ "שמור".</div>`);
    favPop.querySelectorAll(".fav-item").forEach((el) =>
      el.addEventListener("click", (e) => {
        if (e.target.classList.contains("del")) return;
        const f = W.favorites.all()[+el.dataset.i];
        favPop.classList.add("hidden");
        map.setView([f.lat, f.lon], 8);
        showForecast(f.lat, f.lon, f.name);
      }));
    favPop.querySelectorAll(".del").forEach((el) =>
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const f = W.favorites.all()[+el.dataset.i];
        W.favorites.remove(f.lat, f.lon);
        renderFavPopover(); updateFavButton();
      }));
  }
  document.getElementById("fav-btn").addEventListener("click", () => {
    document.getElementById("settings-popover").classList.add("hidden");
    favPop.classList.toggle("hidden");
    if (!favPop.classList.contains("hidden")) renderFavPopover();
  });

  // ---- Settings (units) ----------------------------------------------
  const setPop = document.getElementById("settings-popover");
  function syncSegs() {
    document.querySelectorAll("#seg-temp button").forEach((b) =>
      b.classList.toggle("active", b.dataset.v === W.units.temp));
    document.querySelectorAll("#seg-wind button").forEach((b) =>
      b.classList.toggle("active", b.dataset.v === W.units.wind));
  }
  document.getElementById("settings-btn").addEventListener("click", () => {
    favPop.classList.add("hidden");
    setPop.classList.toggle("hidden");
    syncSegs();
  });
  document.querySelectorAll("#seg-temp button").forEach((b) =>
    b.addEventListener("click", () => { W.units.set({ temp: b.dataset.v }); onUnitsChange(); }));
  document.querySelectorAll("#seg-wind button").forEach((b) =>
    b.addEventListener("click", () => { W.units.set({ wind: b.dataset.v }); onUnitsChange(); }));
  function onUnitsChange() {
    syncSegs();
    const o = W.overlays[state.layer];
    if (o.kind === "wind" || o.kind === "scalar") setLegendFor(spec());
    if (state.lastForecast) { W.ui.renderForecast(state.lastForecast, state.lastPoint.label); updateFavButton(); }
  }
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#settings-popover") && e.target.id !== "settings-btn") setPop.classList.add("hidden");
    if (!e.target.closest("#fav-popover") && e.target.id !== "fav-btn") favPop.classList.add("hidden");
  });
  map.on("click", (e) => {
    if (W.route.mode) { addWaypoint(e.latlng.lat, e.latlng.lng); return; }
    showForecast(e.latlng.lat, e.latlng.lng);
  });
  document.getElementById("panel-close").addEventListener("click", () => W.ui.closePanel());

  // ---- Route planner -------------------------------------------------
  W.route.init(map);
  const routeHandlers = {
    onSpeed: (kmh) => { W.route.setSpeed(kmh); refreshRoute(); },
    onClear: () => { W.route.clear(); W.ui.renderRoute(W.route, routeHandlers); },
  };
  async function addWaypoint(lat, lon) {
    W.route.addPoint(lat, lon);
    await refreshRoute();
  }
  async function refreshRoute() {
    W.ui.loading(true);
    try { await W.route.refresh(); W.ui.renderRoute(W.route, routeHandlers); }
    catch (e) {
      W.ui.renderRoute(W.route, routeHandlers);
      if (e.code === 429) alert("חרגת ממכסת Open-Meteo — נסה בעוד כמה דקות");
    } finally { W.ui.loading(false); }
  }
  const routeBtn = document.getElementById("route-btn");
  routeBtn.addEventListener("click", () => {
    W.route.mode = !W.route.mode;
    routeBtn.classList.toggle("active", W.route.mode);
    map.getContainer().style.cursor = W.route.mode ? "crosshair" : "";
    if (W.route.mode) { W.route.startMs = Date.now(); W.ui.renderRoute(W.route, routeHandlers); }
    else W.ui.closePanel();
  });

  // ---- Search --------------------------------------------------------
  const input = document.getElementById("search-input");
  let searchTimer = null;
  input.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const q = input.value;
    searchTimer = setTimeout(async () => {
      try {
        const results = await W.api.geocode(q);
        W.ui.renderSearchResults(results, (r) => {
          input.value = r.name; W.ui.hideSearch();
          map.setView([r.latitude, r.longitude], 8);
          showForecast(r.latitude, r.longitude, r.name);
        });
      } catch (e) { console.warn(e); }
    }, 300);
  });
  document.addEventListener("click", (e) => { if (!e.target.closest("#search-form")) W.ui.hideSearch(); });
  document.getElementById("search-form").addEventListener("submit", (e) => e.preventDefault());

  // ---- Boot ----------------------------------------------------------
  buildLayer();
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], 7),
      () => {}, { timeout: 4000 });
  }
})(window.W);
