// Data access layer — all free, keyless APIs
(function (W) {
  const C = W.config;

  // Optional self-hosted Open-Meteo base (set in settings) to bypass rate limits.
  function omBase() { try { return localStorage.getItem("ow_om_base") || ""; } catch (e) { return ""; } }
  function forecastEP() {
    const b = omBase();
    return b ? b.replace(/\/+$/, "") + "/v1/forecast" : C.forecastUrl;
  }

  async function getJSON(url) {
    const res = await fetch(url);
    if (res.status === 429) { const e = new Error("rate-limit"); e.code = 429; throw e; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function buildGrid(bounds, n) {
    const north = bounds.getNorth(), south = bounds.getSouth();
    const west = bounds.getWest(), east = bounds.getEast();
    const lats = [], lons = [];
    const dLat = (north - south) / (n - 1);
    const dLon = (east - west) / (n - 1);
    for (let j = 0; j < n; j++) {
      const lat = north - j * dLat;
      for (let i = 0; i < n; i++) {
        lats.push(+lat.toFixed(3));
        lons.push(+(west + i * dLon).toFixed(3));
      }
    }
    return { lats, lons, north, south, west, east, dLat, dLon, n };
  }

  W.api = {
    // Detailed single-point forecast for the side panel.
    async pointForecast(lat, lon, model) {
      const params = new URLSearchParams({
        latitude: lat.toFixed(4), longitude: lon.toFixed(4), timezone: "auto",
        temperature_unit: C.units.temperature, wind_speed_unit: C.units.windSpeed,
        current: ["temperature_2m","relative_humidity_2m","apparent_temperature",
          "is_day","weather_code","wind_speed_10m","wind_direction_10m",
          "surface_pressure","precipitation"].join(","),
        hourly: ["temperature_2m","weather_code","precipitation_probability",
          "precipitation","wind_speed_10m","wind_direction_10m","cloud_cover"].join(","),
        daily: ["weather_code","temperature_2m_max","temperature_2m_min",
          "precipitation_probability_max","wind_speed_10m_max","sunrise","sunset"].join(","),
        forecast_days: "7",
      });
      if (model && model !== "best_match") params.set("models", model);
      return getJSON(`${forecastEP()}?${params}`);
    },

    async geocode(name) {
      if (!name || name.trim().length < 2) return [];
      const params = new URLSearchParams({ name: name.trim(), count: "6", language: "he", format: "json" });
      const data = await getJSON(`${C.geocodeUrl}?${params}`);
      return data.results || [];
    },

    // Time-varying grid. variables: array of Open-Meteo hourly var names.
    // Returns aligned times (GMT) + per-point series. opts.marine uses marine API.
    async hourlyGrid(bounds, n, variables, opts = {}) {
      const g = buildGrid(bounds, n);
      const base = { latitude: g.lats.join(","), longitude: g.lons.join(","),
        hourly: variables.join(","), timezone: "GMT",
        forecast_days: String(C.forecastDays) };
      let endpoint = forecastEP();
      if (opts.marine) endpoint = C.marineUrl;
      else if (opts.airquality) endpoint = C.airQualityUrl;
      else {
        base.wind_speed_unit = C.units.windSpeed;
        base.temperature_unit = C.units.temperature;
        if (opts.model && opts.model !== "best_match") base.models = opts.model;
      }
      const url = endpoint + "?" + new URLSearchParams(base);
      const data = await getJSON(url);
      const arr = Array.isArray(data) ? data : [data];
      const times = (arr[0] && arr[0].hourly && arr[0].hourly.time) || [];
      const series = arr.map((r) => {
        const h = r.hourly || {};
        const o = {};
        variables.forEach((v) => { o[v] = h[v] || []; });
        return o;
      });
      return { times, series, north: g.north, south: g.south, west: g.west,
        east: g.east, dLat: g.dLat, dLon: g.dLon, n };
    },

    // Hourly forecast for a list of exact points (route waypoints). One request.
    async multiPointHourly(points, variables) {
      if (!points.length) return { times: [], series: [] };
      const params = new URLSearchParams({
        latitude: points.map((p) => p.lat.toFixed(4)).join(","),
        longitude: points.map((p) => p.lon.toFixed(4)).join(","),
        hourly: variables.join(","), timezone: "GMT",
        forecast_days: "7",
        wind_speed_unit: C.units.windSpeed, temperature_unit: C.units.temperature,
      });
      const data = await getJSON(`${forecastEP()}?${params}`);
      const arr = Array.isArray(data) ? data : [data];
      const times = (arr[0] && arr[0].hourly && arr[0].hourly.time) || [];
      const series = arr.map((r) => {
        const h = r.hourly || {}; const o = {};
        variables.forEach((v) => { o[v] = h[v] || []; });
        return o;
      });
      return { times, series };
    },

    // Vertical sounding: pressure-level profile for one point (current day).
    async sounding(lat, lon) {
      const vars = [];
      W.soundingLevels.forEach((p) => {
        vars.push(`temperature_${p}hPa`, `relative_humidity_${p}hPa`,
          `wind_speed_${p}hPa`, `wind_direction_${p}hPa`, `geopotential_height_${p}hPa`);
      });
      const params = new URLSearchParams({
        latitude: lat.toFixed(4), longitude: lon.toFixed(4), timezone: "GMT",
        hourly: vars.join(","), forecast_days: "1",
        wind_speed_unit: C.units.windSpeed, temperature_unit: "celsius",
      });
      const data = await getJSON(`${forecastEP()}?${params}`);
      return data.hourly || {};
    },

    // Windy Webcams API v3 — needs the user's own free key (x-windy-api-key).
    async webcams(bounds, key) {
      const c = bounds.getCenter();
      const radiusKm = Math.min(250, Math.max(10,
        Math.round(c.distanceTo(bounds.getNorthEast()) / 1000)));
      const params = new URLSearchParams({
        nearby: `${c.lat.toFixed(3)},${c.lng.toFixed(3)},${radiusKm}`,
        include: "images,location,player", limit: "50",
      });
      const res = await fetch(
        `https://api.windy.com/webcams/api/v3/webcams?${params}`,
        { headers: { "x-windy-api-key": key } });
      if (res.status === 401 || res.status === 403) { const e = new Error("bad-key"); e.code = res.status; throw e; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      return d.webcams || d.result || [];
    },

    async rainviewer() {
      const data = await getJSON(C.rainviewerIndex);
      const past = (data.radar && data.radar.past) || [];
      const nowcast = (data.radar && data.radar.nowcast) || [];
      return { host: data.host, radar: [...past, ...nowcast] };
    },
  };
})(window.W);
