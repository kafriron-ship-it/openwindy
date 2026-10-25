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
    if (state.radarAnim) { state.radarAnim.layers.forEach((l) => map.removeLayer(l)); state.radarAnim = null; }
    if (state.webcamGroup) { map.removeLayer(state.webcamGroup); state.webcamGroup = null; }
  }
  const isRadar = () => W.overlays[state.layer].kind === "radar";
  function renderRadarAt(i) {
    const a = state.radarAnim; if (!a) return;
    a.layers.forEach((l, idx) => l.setOpacity(idx === i ? 0.75 : 0));
    const f = a.frames[i];
    if (f) W.ui.setLegend(`🌧️ ראדאר · ${f.time > Date.now() / 1000 ? "תחזית" : "עבר"} · כחול=קל · סגול=חזק`);
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
    updateCrosshair();

    if (s.kind === "webcams") {
      W.ui.setSliderEnabled(false);
      await loadWebcams();
      return;
    }

    if (s.kind === "satellite") {
      W.ui.setSliderEnabled(false);
      W.ui.loading(true);
      try {
        state.radar = W.satelliteTiles().addTo(map);
        W.ui.setLegend("🛰️ לוויין MODIS (צבע אמיתי, NASA) — תמונה יומית, זום עד 9");
      } catch (e) { alert("שגיאה: " + e.message); }
      finally { W.ui.loading(false); }
      return;
    }

    if (s.kind === "radar") {
      W.ui.loading(true);
      try {
        const rv = await W.api.rainviewer();
        if (!rv.radar.length) { W.ui.setSliderEnabled(false); W.ui.setLegend("אין כרגע נתוני ראדאר"); return; }
        state.radarAnim = { host: rv.host, frames: rv.radar, layers: [] };
        rv.radar.forEach((f) => {
          const t = W.radarTiles(rv.host, f); t.setOpacity(0); t.addTo(map);
          state.radarAnim.layers.push(t);
        });
        const times = rv.radar.map((f) => new Date(f.time * 1000).toISOString().slice(0, 16));
        W.ui.setSliderEnabled(true);
        W.ui.setTimes(times);
        // default to the frame closest to "now"
        let nowIdx = 0, best = Infinity;
        rv.radar.forEach((f, i) => { const d = Math.abs(f.time * 1000 - Date.now()); if (d < best) { best = d; nowIdx = i; } });
        W.ui.setTimeIndex(nowIdx);
        renderRadarAt(nowIdx);
      } catch (e) { W.ui.setSliderEnabled(false); W.ui.setLegend("שגיאה בטעינת ראדאר"); }
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
      setLegendFor();
    } catch (e) {
      console.error(e);
      W.ui.setLegend(e.code === 429
        ? "⏳ חרגת ממכסת הבקשות החינמית של Open-Meteo — נסה שוב בעוד כמה דקות"
        : "שגיאה בטעינת נתונים — נסה אזור/זום אחר");
    } finally { W.ui.loading(false); }
  }

  function setLegendFor() {
    const lvl = state.level !== "10m"
      ? ` · ${(W.levels.find((l) => l.id === state.level) || {}).label}` : "";
    const windFmt = (v) => Math.round(W.units.windVal(v));
    const tempFmt = (v) => Math.round(W.units.tempVal(v));
    const specs = {
      wind:     { title: `${W.t("legend.wind")}${lvl}`, colorFn: W.colorFor("wind"), min: 0, max: 35, unit: W.units.windUnit(), fmt: windFmt },
      gusts:    { title: W.t("legend.gusts"), colorFn: W.colorFor("wind"), min: 0, max: 40, unit: W.units.windUnit(), fmt: windFmt },
      temp:     { title: `${W.t("legend.temp")}${lvl}`, colorFn: W.colorFor("temp"), min: -20, max: 45, unit: W.units.tempUnit(), fmt: tempFmt },
      clouds:   { title: W.t("legend.clouds"), colorFn: W.colorFor("cloud"), min: 0, max: 100, unit: "%", fmt: (v) => Math.round(v) },
      humidity: { title: W.t("legend.humidity"), colorFn: W.colorFor("humidity"), min: 0, max: 100, unit: "%", fmt: (v) => Math.round(v) },
      pressure: { title: W.t("legend.pressure"), colorFn: W.colorFor("pressure"), min: 970, max: 1045, unit: W.units.presUnit(), fmt: (v) => (W.units.pressure === "inhg" ? W.units.presVal(v).toFixed(1) : Math.round(W.units.presVal(v))) },
      waves:    { title: W.t("legend.waves"), colorFn: W.colorFor("waves"), min: 0, max: 6, unit: W.units.waveUnit(), fmt: (v) => W.units.waveVal(v).toFixed(1) },
      aqi:      { title: W.t("legend.aqi"), colorFn: W.colorFor("aqi"), min: 0, max: 120, unit: "EAQI", fmt: (v) => Math.round(v) },
      storms:   { title: W.t("legend.storms"), colorFn: W.colorFor("cape"), min: 0, max: 3000, unit: "J/kg", fmt: (v) => Math.round(v) },
    };
    const spec = specs[state.layer];
    if (spec) W.ui.setScaleLegend(spec);
  }

  // ---- Render at a time index (no network) ---------------------------
  function renderAt(ti) {
    if (isRadar()) { renderRadarAt(ti); return; }
    if (!W.Field.grid) return;
    updateCrosshair();
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
    const frameCount = isRadar() ? (state.radarAnim ? state.radarAnim.frames.length : 0) : W.Field.times.length;
    const max = frameCount - 1, step = C.sliderStep || 1;
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
  const onLayerPick = (key) => { state.layer = key; buildLayer(); scheduleHash(); };
  const onLevelPick = (id) => { state.level = id; buildLayer(); scheduleHash(); };
  W.ui.buildLayers(W.overlays, state.layer, onLayerPick);
  W.ui.buildLevels(W.levels, state.level, onLevelPick);
  W.ui.initSlider({
    onScrub: (i) => { renderAt(i); scheduleHash(); },
    onPlayToggle: () => (state.playTimer ? stopPlay() : startPlay()),
  });

  // Model selector
  const modelSel = document.getElementById("model-select");
  function populateModels() {
    modelSel.innerHTML = "";
    W.models.forEach((m) => {
      const o = document.createElement("option");
      o.value = m.id; o.textContent = W.t("model." + m.id); modelSel.appendChild(o);
    });
    modelSel.value = state.model;
  }
  populateModels();
  modelSel.addEventListener("change", () => {
    state.model = modelSel.value;
    buildLayer(); scheduleHash();
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
      const [data, marine] = await Promise.all([
        W.api.pointForecast(lat, lon, state.model),
        W.api.marineForecast(lat, lon).catch(() => null),
      ]);
      state.lastForecast = data; state.lastMarine = marine;
      if (state.marker) map.removeLayer(state.marker);
      state.marker = L.marker([lat, lon]).addTo(map);
      W.ui.renderForecast(data, label, marine);
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
        if (state.lastForecast) { W.ui.renderForecast(state.lastForecast, label, state.lastMarine); updateFavButton();
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
  function sportOptions(sel) {
    return `<option value="">— בחר ספורט —</option>` +
      Object.entries(W.SPORTS).map(([k, s]) =>
        `<option value="${k}" ${k === sel ? "selected" : ""}>${s.icon} ${s.label}</option>`).join("");
  }
  function renderFavPopover() {
    const favs = W.favorites.all();
    favPop.innerHTML = `<div class="fav-title">ספוטים שמורים</div>` +
      (favs.length ? favs.map((f, i) => `
        <div class="fav-item">
          <div class="fav-row-main" data-open="${i}"><span>📍 ${f.name}</span>
            <button class="del" data-del="${i}" title="מחק">×</button></div>
          <div class="fav-sport">
            <select data-sport="${i}">${sportOptions(f.sport)}</select>
            <button class="go" data-report="${i}" ${f.sport ? "" : "disabled"}>תנאים 📊</button>
          </div>
        </div>`).join("")
        : `<div class="fav-empty">אין עדיין ספוטים. פתח תחזית ולחץ "שמור", ואז בחר ספורט.</div>`);

    favPop.querySelectorAll("[data-open]").forEach((el) =>
      el.addEventListener("click", (e) => {
        if (e.target.classList.contains("del")) return;
        const f = W.favorites.all()[+el.dataset.open];
        favPop.classList.add("hidden");
        map.setView([f.lat, f.lon], 8);
        showForecast(f.lat, f.lon, f.name);
      }));
    favPop.querySelectorAll("[data-del]").forEach((el) =>
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const f = W.favorites.all()[+el.dataset.del];
        W.favorites.remove(f.lat, f.lon);
        renderFavPopover(); updateFavButton();
      }));
    favPop.querySelectorAll("[data-sport]").forEach((el) =>
      el.addEventListener("change", () => {
        const f = W.favorites.all()[+el.dataset.sport];
        W.favorites.setSport(f.lat, f.lon, el.value);
        renderFavPopover();
      }));
    favPop.querySelectorAll("[data-report]").forEach((el) =>
      el.addEventListener("click", () => {
        const f = W.favorites.all()[+el.dataset.report];
        favPop.classList.add("hidden");
        showSpotReport(f);
      }));
  }

  async function showSpotReport(f) {
    if (!f.sport) return;
    W.ui.loading(true);
    try {
      const needWaves = W.sportsNeedingWaves.includes(f.sport);
      const hours = await W.api.spotForecast(f.lat, f.lon, needWaves);
      const windows = W.spots.findWindows(f.sport, hours);
      W.ui.renderSpotReport(f.name, f.sport, windows, () => W.ui.closePanel());
    } catch (e) {
      alert(e.code === 429 ? "חרגת ממכסת Open-Meteo — נסה בעוד כמה דקות" : "שגיאה: " + e.message);
    } finally { W.ui.loading(false); }
  }
  // Tools menu
  const toolsPop = document.getElementById("tools-popover");
  const toolsBtn = document.getElementById("tools-btn");
  const closeTools = () => toolsPop.classList.add("hidden");
  toolsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setPop.classList.add("hidden"); favPop.classList.add("hidden");
    toolsPop.classList.toggle("hidden");
  });
  document.getElementById("tool-route").addEventListener("click", (e) => { e.stopPropagation(); closeTools(); toggleRoute(); });
  document.getElementById("tool-fav").addEventListener("click", (e) => {
    e.stopPropagation(); closeTools(); renderFavPopover(); favPop.classList.remove("hidden");
  });
  document.getElementById("tool-settings").addEventListener("click", (e) => {
    e.stopPropagation(); closeTools(); syncSegs(); setPop.classList.remove("hidden");
  });

  // Language (i18n)
  const setToolText = (id, key, hasDesc) => {
    const el = document.getElementById(id);
    el.querySelector("b").textContent = W.t(key);
    if (hasDesc !== false) { const s = el.querySelector("small"); if (s) s.textContent = W.t(key + ".d"); }
  };
  function applyLang() {
    const l = W.i18n.lang;
    document.documentElement.setAttribute("dir", l === "en" ? "ltr" : "rtl");
    document.documentElement.setAttribute("lang", l);
    document.getElementById("search-input").placeholder = W.t("search");
    document.getElementById("locate-btn").title = W.t("locate");
    document.querySelector("#tools-popover .fav-title").textContent = W.t("tools.title");
    setToolText("tool-route", "tool.route");
    setToolText("tool-fav", "tool.fav");
    setToolText("tool-xh", "tool.xh", false);
    setToolText("tool-alerts", "tool.alerts");
    setToolText("tool-share", "tool.share");
    setToolText("tool-settings", "tool.settings");
    document.querySelector("#tool-lang b").textContent = W.t("tool.lang");
    document.querySelector("#tool-lang small").textContent = l === "en" ? "החלף שפה" : "Switch language";
    const wl = l === "en" ? { ms: "m/s", kmh: "km/h", kt: "kt", mph: "mph" } : { ms: "m/s", kmh: 'קמ"ש', kt: "קשר", mph: "mph" };
    document.querySelectorAll('#settings-popover [data-pref="wind"] button').forEach((b) => { b.textContent = wl[b.dataset.v]; });
    W.ui.buildLayers(W.overlays, state.layer, onLayerPick);
    W.ui.buildLevels(W.levels, state.level, onLevelPick);
    W.ui.setActiveLayer(state.layer); W.ui.setActiveLevel(state.level);
    W.ui.setLevelsEnabled(!!W.overlays[state.layer].altAware);
    populateModels();
    applyXh();
    const k = W.overlays[state.layer].kind;
    if (k === "wind" || k === "scalar") setLegendFor();
  }
  document.getElementById("tool-lang").addEventListener("click", (e) => {
    e.stopPropagation(); closeTools();
    W.i18n.set(W.i18n.lang === "en" ? "he" : "en");
    applyLang();
  });

  // ---- Settings (units) ----------------------------------------------
  const setPop = document.getElementById("settings-popover");
  function syncSegs() {
    document.querySelectorAll("#settings-popover .seg[data-pref]").forEach((seg) => {
      const pref = seg.dataset.pref;
      seg.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.v === W.units[pref]));
    });
    const u = W.units;
    const isImp = u.temp === "f" && u.wind === "mph" && u.pressure === "inhg" && u.precip === "in" && u.dist === "mi" && u.wave === "ft";
    const isMet = u.temp === "c" && u.wind === "ms" && u.pressure === "hpa" && u.precip === "mm" && u.dist === "km" && u.wave === "m";
    document.querySelectorAll("#seg-system button").forEach((b) =>
      b.classList.toggle("active", (b.dataset.sys === "imperial" && isImp) || (b.dataset.sys === "metric" && isMet)));
  }
  document.querySelectorAll("#settings-popover .seg[data-pref] button").forEach((b) =>
    b.addEventListener("click", () => {
      W.units.set({ [b.parentElement.dataset.pref]: b.dataset.v }); onUnitsChange();
    }));
  document.querySelectorAll("#seg-system button").forEach((b) =>
    b.addEventListener("click", () => { W.units.setSystem(b.dataset.sys); onUnitsChange(); }));
  function onUnitsChange() {
    syncSegs();
    const o = W.overlays[state.layer];
    if (o.kind === "wind" || o.kind === "scalar") { setLegendFor(); updateCrosshair(); }
    if (state.lastForecast) { W.ui.renderForecast(state.lastForecast, state.lastPoint.label, state.lastMarine); updateFavButton(); }
  }
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#settings-popover")) setPop.classList.add("hidden");
    if (!e.target.closest("#fav-popover")) favPop.classList.add("hidden");
    if (!e.target.closest("#tools-popover") && e.target.id !== "tools-btn") toolsPop.classList.add("hidden");
  });
  map.on("click", (e) => {
    if (W.route.mode) { addWaypoint(e.latlng.lat, e.latlng.lng); return; }
    showForecast(e.latlng.lat, e.latlng.lng);
  });

  // ---- Center crosshair picker (like Windy) --------------------------
  function fmtScalar(layer, v) {
    switch (layer) {
      case "temp": return W.units.tempStr(v);
      case "gusts": return W.units.windStr(v);
      case "clouds": case "humidity": return Math.round(v) + "%";
      case "pressure": return W.units.presStr(v);
      case "waves": return W.units.waveStr(v);
      case "aqi": return Math.round(v) + " EAQI";
      case "storms": return Math.round(v) + " J/kg";
      default: return Math.round(v);
    }
  }
  function layerValueHTML(lat, lon) {
    const o = W.overlays[state.layer];
    if (!(o.kind === "wind" || o.kind === "scalar") || !W.Field.grid) return null;
    const s = spec(), ti = W.ui.getTimeIndex();
    if (o.kind === "wind") {
      const sp = W.Field.sampleAt(lat, lon, s.speedVar, ti);
      if (sp == null) return null;
      const dr = W.Field.nearestAt(lat, lon, s.dirVar, ti);
      return `<span class="xh-arrow" style="transform:rotate(${(dr || 0) + 180}deg)">↑</span> ${W.units.windStr(sp)}`;
    }
    const v = W.Field.sampleAt(lat, lon, s.scalarVar, ti);
    return v == null ? null : fmtScalar(state.layer, v);
  }
  function updateCrosshair() {
    document.getElementById("xh-readout").innerHTML =
      layerValueHTML(map.getCenter().lat, map.getCenter().lng) || "📍";
  }
  document.getElementById("xh-readout").addEventListener("click", () => {
    const c = map.getCenter();
    showForecast(c.lat, c.lng);
  });
  map.on("move", updateCrosshair);

  // Value-at-cursor tooltip (desktop hover)
  const cursorEl = document.getElementById("cursor-val");
  map.on("mousemove", (e) => {
    const html = layerValueHTML(e.latlng.lat, e.latlng.lng);
    if (!html) { cursorEl.classList.add("hidden"); return; }
    cursorEl.innerHTML = html;
    cursorEl.style.left = e.originalEvent.clientX + "px";
    cursorEl.style.top = e.originalEvent.clientY + "px";
    cursorEl.classList.remove("hidden");
  });
  map.on("mouseout", () => cursorEl.classList.add("hidden"));

  // Crosshair on/off toggle (persisted), driven from the Tools menu
  let xhOn = true;
  try { xhOn = localStorage.getItem("ow_crosshair") !== "0"; } catch (e) {}
  const applyXh = () => {
    document.getElementById("crosshair").classList.toggle("hidden", !xhOn);
    document.getElementById("tool-xh").classList.toggle("active", xhOn);
    document.querySelector(".tool-xh-state").textContent = xhOn ? W.t("tool.xh.on") : W.t("tool.xh.off");
  };
  applyXh();
  document.getElementById("tool-xh").addEventListener("click", () => {
    xhOn = !xhOn;
    try { localStorage.setItem("ow_crosshair", xhOn ? "1" : "0"); } catch (e) {}
    applyXh();
  });
  document.getElementById("panel-close").addEventListener("click", () => W.ui.closePanel());

  // Bottom-sheet drag-to-resize (touch + mouse)
  (function () {
    const panel = document.getElementById("panel");
    const handle = document.getElementById("panel-handle");
    let startY = 0, startH = 0, dragging = false;
    handle.addEventListener("pointerdown", (e) => {
      dragging = true; startY = e.clientY;
      startH = panel.getBoundingClientRect().height;
      panel.classList.add("dragging"); handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      let h = startH + (startY - e.clientY);
      h = Math.max(70, Math.min(window.innerHeight * 0.92, h));
      panel.style.height = h + "px";
    });
    const end = () => {
      if (!dragging) return; dragging = false; panel.classList.remove("dragging");
      if (panel.getBoundingClientRect().height < window.innerHeight * 0.2) {
        W.ui.closePanel(); panel.style.height = "";
      }
    };
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  })();

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
  function toggleRoute() {
    W.route.mode = !W.route.mode;
    document.getElementById("tool-route").classList.toggle("active", W.route.mode);
    document.getElementById("tools-btn").classList.toggle("active", W.route.mode);
    map.getContainer().style.cursor = W.route.mode ? "crosshair" : "";
    if (W.route.mode) { W.route.startMs = Date.now(); W.ui.renderRoute(W.route, routeHandlers); }
    else W.ui.closePanel();
  }

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

  // ---- First-run hint ------------------------------------------------
  const hint = document.getElementById("hint");
  const dismissHint = () => { hint.classList.add("hidden"); try { localStorage.setItem("ow_seen_hint", "1"); } catch (e) {} };
  let seenHint = false;
  try { seenHint = localStorage.getItem("ow_seen_hint") === "1"; } catch (e) {}
  if (!seenHint) {
    hint.classList.remove("hidden");
    document.getElementById("hint-close").addEventListener("click", dismissHint);
    setTimeout(dismissHint, 12000);
  }

  // ---- Shareable URL state: #zoom/lat/lon/layer/level/model/timeIndex ----
  let hashTimer = null, applyingHash = false;
  function serializeState() {
    const c = map.getCenter();
    return [map.getZoom(), c.lat.toFixed(3), c.lng.toFixed(3),
      state.layer, state.level, state.model, W.ui.getTimeIndex()].join("/");
  }
  function scheduleHash() {
    if (applyingHash) return;
    clearTimeout(hashTimer);
    hashTimer = setTimeout(() => {
      try { history.replaceState(null, "", "#" + serializeState()); } catch (e) {}
    }, 400);
  }
  function parseHash() {
    const h = decodeURIComponent((location.hash || "").replace(/^#/, ""));
    if (!h) return null;
    const p = h.split("/");
    if (p.length < 3 || !isFinite(+p[1]) || !isFinite(+p[2])) return null;
    return { zoom: +p[0] || 7, lat: +p[1], lon: +p[2],
      layer: p[3], level: p[4], model: p[5], ti: p[6] != null ? +p[6] : 0 };
  }
  map.on("moveend", scheduleHash);

  // Share
  function showToast(msg, ms) {
    const t = document.getElementById("toast");
    t.textContent = msg; t.classList.remove("hidden");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => t.classList.add("hidden"), ms || 2200);
  }
  document.getElementById("tool-share").addEventListener("click", async (e) => {
    e.stopPropagation(); closeTools();
    try { history.replaceState(null, "", "#" + serializeState()); } catch (e2) {}
    const url = location.href;
    try {
      if (navigator.share) await navigator.share({ title: "OpenWindy", url });
      else { await navigator.clipboard.writeText(url); showToast("🔗 הקישור הועתק!"); }
    } catch (err) {
      try { await navigator.clipboard.writeText(url); showToast("🔗 הקישור הועתק!"); }
      catch (e3) { showToast(url, 5000); }
    }
  });

  // Spot alerts via browser notifications (checked on open — no server push)
  const alertsOn = () => { try { return localStorage.getItem("ow_alerts") === "1"; } catch (e) { return false; } };
  async function checkSpotAlerts() {
    if (!alertsOn() || !("Notification" in window) || Notification.permission !== "granted") return;
    for (const f of W.favorites.all().filter((x) => x.sport)) {
      try {
        const hours = await W.api.spotForecast(f.lat, f.lon, W.sportsNeedingWaves.includes(f.sport));
        const w = W.spots.findWindows(f.sport, hours).find((x) => {
          const dt = x.startTime.getTime() - Date.now();
          return dt > 0 && dt < 48 * 3600 * 1000;
        });
        if (w) {
          const s = W.SPORTS[f.sport];
          new Notification(`${s.icon} תנאים טובים ל${s.label}`, {
            body: `${f.name} — ${w.startTime.toLocaleString("he-IL", { weekday: "short", hour: "2-digit", minute: "2-digit" })}`,
            icon: "icon.svg",
          });
        }
      } catch (e) { /* skip */ }
    }
  }
  const toolAlerts = document.getElementById("tool-alerts");
  toolAlerts.classList.toggle("active", alertsOn());
  toolAlerts.addEventListener("click", async (e) => {
    e.stopPropagation(); closeTools();
    if (!("Notification" in window)) { showToast("התראות לא נתמכות בדפדפן"); return; }
    if (alertsOn()) {
      try { localStorage.setItem("ow_alerts", "0"); } catch (e2) {}
      toolAlerts.classList.remove("active"); showToast("התראות ספוטים כבויות");
      return;
    }
    let perm = Notification.permission;
    if (perm === "default") perm = await Notification.requestPermission();
    if (perm !== "granted") { showToast("יש לאשר התראות בדפדפן"); return; }
    try { localStorage.setItem("ow_alerts", "1"); } catch (e2) {}
    toolAlerts.classList.add("active");
    if (!W.favorites.all().some((f) => f.sport)) showToast("🔔 הופעל! שמור ספוט ובחר ספורט לקבלת התראות");
    else { showToast("🔔 התראות ספוטים הופעלו"); checkSpotAlerts(); }
  });

  // My location
  const locateBtn = document.getElementById("locate-btn");
  locateBtn.addEventListener("click", () => {
    if (!navigator.geolocation) { showToast("איתור מיקום לא נתמך"); return; }
    locateBtn.classList.add("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        locateBtn.classList.remove("loading");
        map.setView([pos.coords.latitude, pos.coords.longitude], 9);
      },
      () => { locateBtn.classList.remove("loading"); showToast("לא ניתן לאתר מיקום"); },
      { timeout: 8000, enableHighAccuracy: true });
  });

  // ---- Boot ----------------------------------------------------------
  applyLang();
  const initial = parseHash();
  if (initial) {
    applyingHash = true;
    if (initial.layer && W.overlays[initial.layer]) state.layer = initial.layer;
    if (initial.level && W.levels.find((l) => l.id === initial.level)) state.level = initial.level;
    if (initial.model && W.models.find((m) => m.id === initial.model)) { state.model = initial.model; modelSel.value = state.model; }
    map.setView([initial.lat, initial.lon], initial.zoom);
    buildLayer().then(() => {
      if (initial.ti) { W.ui.setTimeIndex(initial.ti); renderAt(initial.ti); }
      applyingHash = false; scheduleHash();
    });
  } else {
    buildLayer();
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], 7),
        () => {}, { timeout: 4000 });
    }
  }
  if (alertsOn()) setTimeout(checkSpotAlerts, 3000);
})(window.W);
