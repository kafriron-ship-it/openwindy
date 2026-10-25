// UI: layer/level buttons, time slider, forecast panel, search
(function (W) {
  const $ = (id) => document.getElementById(id);
  const daysShort = ["א׳","ב׳","ג׳","ד׳","ה׳","ו׳","ש׳"];
  const daysLong = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];

  // GMT iso (no tz) -> local Date
  const toLocal = (iso) => new Date(iso.endsWith("Z") ? iso : iso + "Z");
  const hhmm = (d) => d.getHours().toString().padStart(2,"0") + ":" +
                      d.getMinutes().toString().padStart(2,"0");

  W.ui = {
    // ---- Control bars --------------------------------------------------
    buildLayers(overlays, active, onPick) {
      const bar = $("layers");
      bar.innerHTML = "";
      Object.entries(overlays).forEach(([key, o]) => {
        const b = document.createElement("button");
        b.className = "layer-btn" + (key === active ? " active" : "");
        b.textContent = o.label; b.dataset.layer = key;
        b.onclick = () => onPick(key);
        bar.appendChild(b);
      });
    },
    setActiveLayer(name) {
      document.querySelectorAll("#layers .layer-btn")
        .forEach((b) => b.classList.toggle("active", b.dataset.layer === name));
    },

    buildLevels(levels, active, onPick) {
      const bar = $("levels");
      bar.innerHTML = "";
      levels.forEach((l) => {
        const b = document.createElement("button");
        b.className = "level-btn" + (l.id === active ? " active" : "");
        b.textContent = l.label; b.dataset.level = l.id;
        b.onclick = () => onPick(l.id);
        bar.appendChild(b);
      });
    },
    setActiveLevel(id) {
      document.querySelectorAll("#levels .level-btn")
        .forEach((b) => b.classList.toggle("active", b.dataset.level === id));
    },
    setLevelsEnabled(on) { $("levels").classList.toggle("disabled", !on); },

    setLegend(text) { const l = $("legend"); l.textContent = text; l.classList.add("show"); },
    clearLegend() { $("legend").classList.remove("show"); },

    // ---- Time slider ---------------------------------------------------
    _times: [], _onScrub: null,
    initSlider({ onScrub, onPlayToggle }) {
      this._onScrub = onScrub;
      const s = $("time-slider"), p = $("play-btn");
      s.addEventListener("input", () => {
        this._updateLabel(+s.value);
        onScrub(+s.value);
      });
      p.addEventListener("click", onPlayToggle);
    },
    setTimes(times) {
      this._times = times;
      const s = $("time-slider");
      const step = W.config.sliderStepHours;
      s.max = String(Math.max(0, times.length - 1));
      s.step = String(step);
      if (+s.value > +s.max) s.value = "0";
      this._updateLabel(+s.value);
    },
    _updateLabel(i) {
      const iso = this._times[i];
      if (!iso) { $("time-label").textContent = "—"; return; }
      const d = toLocal(iso);
      const now = new Date();
      const sameDay = d.toDateString() === now.toDateString();
      const tomorrow = new Date(now.getTime() + 86400000).toDateString() === d.toDateString();
      let day = sameDay ? "היום" : tomorrow ? "מחר" : `יום ${daysShort[d.getDay()]} ${d.getDate()}/${d.getMonth()+1}`;
      $("time-label").textContent = `${day} · ${hhmm(d)}`;
    },
    getTimeIndex() { return +$("time-slider").value; },
    setTimeIndex(i) { $("time-slider").value = String(i); this._updateLabel(i); },
    setPlaying(on) {
      const p = $("play-btn");
      p.textContent = on ? "⏸" : "▶";
      p.classList.toggle("playing", on);
    },
    setSliderEnabled(on) {
      $("timebar").style.opacity = on ? "1" : ".4";
      $("time-slider").disabled = !on;
      $("play-btn").disabled = !on;
    },

    // ---- Panel + search (unchanged core) -------------------------------
    openPanel() { $("panel").classList.remove("hidden"); },
    closePanel() { $("panel").classList.add("hidden"); },
    loading(on) { $("loader").classList.toggle("hidden", !on); },

    // Inline SVG meteogram for the next `span` hours from startIdx.
    _meteogram(H, startIdx, span) {
      const W0 = 344, Hh = 200, padL = 30, padR = 26;
      const x0 = padL, x1 = W0 - padR, pw = x1 - x0;
      const tempTop = 14, tempBot = 92, pBase = 138, pTop = 100, windY = 158, timeY = 184;
      const n = Math.min(span, H.time.length - startIdx);
      if (n < 2) return "";
      const idx = (i) => startIdx + i;
      const xAt = (i) => x0 + (i / (n - 1)) * pw;

      const temps = [], precs = [];
      for (let i = 0; i < n; i++) {
        temps.push(H.temperature_2m[idx(i)]);
        precs.push(H.precipitation[idx(i)] || 0);
      }
      let tMin = Math.min(...temps), tMax = Math.max(...temps);
      if (tMax - tMin < 2) { tMax += 1; tMin -= 1; }
      const yTemp = (t) => tempBot - ((t - tMin) / (tMax - tMin)) * (tempBot - tempTop);
      const maxP = Math.max(0.5, ...precs);

      // temperature area + line
      let line = "", area = `M ${xAt(0)} ${tempBot}`;
      for (let i = 0; i < n; i++) {
        const X = xAt(i).toFixed(1), Y = yTemp(temps[i]).toFixed(1);
        line += (i ? "L" : "M") + ` ${X} ${Y} `;
        area += ` L ${X} ${Y}`;
      }
      area += ` L ${xAt(n - 1)} ${tempBot} Z`;

      // precipitation bars
      let bars = "";
      const bw = Math.max(1.5, pw / n - 1);
      for (let i = 0; i < n; i++) {
        if (precs[i] <= 0) continue;
        const h = (precs[i] / maxP) * (pBase - pTop);
        bars += `<rect x="${(xAt(i) - bw / 2).toFixed(1)}" y="${(pBase - h).toFixed(1)}"
          width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="#39a0ff" opacity="0.8"/>`;
      }

      // wind arrows + time labels every 6h
      let wind = "", labels = "", grid = "";
      for (let i = 0; i < n; i += 6) {
        const X = xAt(i);
        grid += `<line x1="${X}" y1="${tempTop}" x2="${X}" y2="${pBase}" stroke="#223052" stroke-width="1"/>`;
        const dir = H.wind_direction_10m[idx(i)] || 0;
        const sp = Math.round(W.units.windVal(H.wind_speed_10m[idx(i)] || 0));
        wind += `<g transform="translate(${X.toFixed(1)},${windY}) rotate(${dir + 180})">
          <line x1="0" y1="-7" x2="0" y2="7" stroke="#9fd0ff" stroke-width="1.5"/>
          <path d="M0 -8 L3 -3 L-3 -3 Z" fill="#9fd0ff"/></g>
          <text x="${X.toFixed(1)}" y="${windY + 18}" fill="#93a0bd" font-size="9" text-anchor="middle">${sp}</text>`;
        const d = toLocal(H.time[idx(i)]);
        const lbl = (i === 0 ? "עכשיו" : (d.getHours() === 0 ? `${d.getDate()}/${d.getMonth()+1}` : `${d.getHours()}:00`));
        labels += `<text x="${X.toFixed(1)}" y="${timeY}" fill="#93a0bd" font-size="9" text-anchor="middle">${lbl}</text>`;
      }

      return `<svg viewBox="0 0 ${W0} ${Hh}" width="100%" style="display:block">
        <defs><linearGradient id="tg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#f46d43" stop-opacity="0.5"/>
          <stop offset="1" stop-color="#f46d43" stop-opacity="0"/></linearGradient></defs>
        ${grid}
        <path d="${area}" fill="url(#tg)"/>
        <path d="${line}" fill="none" stroke="#fdae61" stroke-width="2"/>
        <text x="4" y="${tempTop + 4}" fill="#93a0bd" font-size="9">${W.units.tempStr(tMax)}</text>
        <text x="4" y="${tempBot}" fill="#93a0bd" font-size="9">${W.units.tempStr(tMin)}</text>
        ${bars}
        <text x="${W0 - 2}" y="${pTop + 6}" fill="#39a0ff" font-size="9" text-anchor="end">${maxP.toFixed(1)}מ"מ</text>
        ${wind}${labels}
      </svg>`;
    },

    renderForecast(data, label) {
      const c = data.current;
      const [icon, desc] = W.describe(c.weather_code);
      const loc = label || `${data.latitude.toFixed(2)}, ${data.longitude.toFixed(2)}`;
      const H = data.hourly;
      const nowIdx = Math.max(0, H.time.findIndex((t) => new Date(t) >= new Date()));
      const hours = [];
      for (let i = nowIdx; i < Math.min(nowIdx + 24, H.time.length); i += 2) {
        const [hi] = W.describe(H.weather_code[i]);
        const d = new Date(H.time[i]);
        hours.push(`<div class="hour"><div class="h">${d.getHours().toString().padStart(2,"0")}:00</div>
          <div class="i">${hi}</div><div class="t">${W.units.tempStr(H.temperature_2m[i])}</div>
          <div class="p">${H.precipitation_probability[i] ?? 0}%</div></div>`);
      }
      const D = data.daily;
      const daily = D.time.map((t, i) => {
        const [di] = W.describe(D.weather_code[i]);
        return `<div class="day"><span class="name">${i===0?"היום":daysLong[new Date(t).getDay()]}</span>
          <span class="i">${di}</span><span class="pop">${D.precipitation_probability_max[i] ?? 0}%</span>
          <span class="rng"><span class="max">${W.units.tempStr(D.temperature_2m_max[i])}</span>
          <span class="min"> ${W.units.tempStr(D.temperature_2m_min[i])}</span></span></div>`;
      }).join("");

      $("panel-content").innerHTML = `
        <h2 class="loc-name">${loc}</h2>
        <div class="loc-sub">${data.timezone||""} · עדכון ${hhmm(new Date(c.time))}</div>
        <div class="current"><div class="icon">${icon}</div><div class="temp">${W.units.tempStr(c.temperature_2m)}</div>
          <div><div class="desc">${desc}</div><div class="desc">מרגיש כמו ${W.units.tempStr(c.apparent_temperature)}</div></div></div>
        <div class="metrics">
          <div class="metric"><div class="k">רוח</div><div class="v">${W.units.windStr(c.wind_speed_10m)}</div></div>
          <div class="metric"><div class="k">לחות</div><div class="v">${c.relative_humidity_2m}%</div></div>
          <div class="metric"><div class="k">לחץ</div><div class="v">${Math.round(c.surface_pressure)} hPa</div></div>
          <div class="metric"><div class="k">משקעים</div><div class="v">${c.precipitation} מ"מ</div></div></div>
        <div class="section-title">24 השעות הקרובות</div><div class="hourly">${hours.join("")}</div>
        <div class="section-title">מטאוגרמה — 48 שעות</div>
        <div class="meteogram">${this._meteogram(H, nowIdx, 48)}</div>
        <div class="section-title">תחזית שבועית</div><div class="daily">${daily}</div>
        <div class="section-title">זריחה / שקיעה</div>
        <div class="metrics">
          <div class="metric"><div class="k">🌅 זריחה</div><div class="v">${hhmm(new Date(D.sunrise[0]))}</div></div>
          <div class="metric"><div class="k">🌇 שקיעה</div><div class="v">${hhmm(new Date(D.sunset[0]))}</div></div></div>
        <div class="loc-sub" style="margin-top:18px">נתונים: Open-Meteo (חינמי, קוד פתוח)</div>`;
      this.openPanel();
    },

    // Route planner panel
    renderRoute(route, handlers) {
      const presets = [
        { label: "רגל", v: 5 }, { label: "אופניים", v: 20 },
        { label: "רכב", v: 90 }, { label: "סירה", v: 28 },
      ];
      const rows = route.rows.map((r, i) => {
        const [icon] = W.describe(r.code);
        const eta = toLocal(new Date(r.etaMs).toISOString());
        const sameDay = eta.toDateString() === new Date().toDateString();
        const etaStr = (sameDay ? "" : `${eta.getDate()}/${eta.getMonth()+1} `) + hhmm(eta);
        return `<div class="rt-row">
          <span class="rt-n">${i + 1}</span>
          <span class="rt-eta">${i === 0 ? "יציאה" : etaStr}</span>
          <span class="rt-i">${icon}</span>
          <span class="rt-t">${r.temp != null ? W.units.tempStr(r.temp) : "—"}</span>
          <span class="rt-w">${r.wind != null ? "💨 " + W.units.windStr(r.wind) : ""}</span>
          <span class="rt-p">${r.precip > 0 ? "🌧️ " + r.precip + 'מ"מ' : ""}</span>
          <span class="rt-km">${Math.round(r.km)} ק"מ</span>
        </div>`;
      }).join("");

      const dur = route.totalHours;
      const durStr = dur >= 1 ? `${Math.floor(dur)}ש' ${Math.round((dur % 1) * 60)}ד'` : `${Math.round(dur * 60)}ד'`;

      $("panel-content").innerHTML = `
        <h2 class="loc-name">🧭 תכנון מסלול</h2>
        <div class="loc-sub">לחץ על המפה כדי להוסיף נקודות ציון</div>
        <div class="rt-speed">
          <span>מהירות:</span>
          ${presets.map((p) => `<button class="rt-sp ${route.speedKmh === p.v ? "active" : ""}" data-v="${p.v}">${p.label}</button>`).join("")}
          <input id="rt-speed-input" type="number" min="1" value="${route.speedKmh}" /> <span>קמ"ש</span>
        </div>
        ${route.waypoints.length < 2
          ? `<div class="fav-empty">הוסף לפחות 2 נקודות כדי לראות תחזית לאורך המסלול.</div>`
          : `<div class="rt-totals">מרחק כולל: <b>${Math.round(route.totalKm)} ק"מ</b> · זמן נסיעה: <b>${durStr}</b></div>
             <div class="rt-list">${rows}</div>`}
        <button id="rt-clear" class="rt-clear">🗑️ נקה מסלול</button>
        <div class="loc-sub" style="margin-top:14px">התחזית מחושבת לכל נקודה לפי זמן ההגעה המשוער. נתונים: Open-Meteo</div>`;

      $("panel-content").querySelectorAll(".rt-sp").forEach((b) =>
        b.addEventListener("click", () => handlers.onSpeed(+b.dataset.v)));
      $("rt-speed-input").addEventListener("change", (e) => handlers.onSpeed(+e.target.value));
      $("rt-clear").addEventListener("click", handlers.onClear);
      this.openPanel();
    },

    renderSearchResults(results, onPick) {
      const box = $("search-results");
      if (!results.length) { box.classList.remove("show"); box.innerHTML = ""; return; }
      box.innerHTML = results.map((r, i) => {
        const parts = [r.admin1, r.country].filter(Boolean).join(", ");
        return `<div class="result-item" data-i="${i}">${r.name} <small>${parts}</small></div>`;
      }).join("");
      box.classList.add("show");
      box.querySelectorAll(".result-item").forEach((el) =>
        el.addEventListener("click", () => { box.classList.remove("show"); onPick(results[+el.dataset.i]); }));
    },
    hideSearch() { $("search-results").classList.remove("show"); },
  };
})(window.W);
