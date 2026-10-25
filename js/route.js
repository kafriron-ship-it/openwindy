// Route planner: drop waypoints, compute ETA per point, fetch weather at arrival.
(function (W) {
  const R = 6371; // km
  const rad = (d) => (d * Math.PI) / 180;
  function haversine(a, b) {
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const toDate = (iso) => new Date(iso.endsWith("Z") ? iso : iso + "Z");
  function nearestIndex(times, ms) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < times.length; i++) {
      const d = Math.abs(toDate(times[i]).getTime() - ms);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  const VARS = ["temperature_2m", "weather_code", "precipitation",
    "wind_speed_10m", "wind_direction_10m"];

  W.route = {
    mode: false,
    waypoints: [],
    speedKmh: 60,
    startMs: Date.now(),
    rows: [], totalKm: 0, totalHours: 0,
    _map: null, _group: null,

    init(map) {
      this._map = map;
      this._group = L.layerGroup().addTo(map);
    },

    setSpeed(kmh) { this.speedKmh = Math.max(1, kmh); },

    addPoint(lat, lon) {
      this.waypoints.push({ lat, lon });
      this._redraw();
    },

    clear() {
      this.waypoints = []; this.rows = []; this.totalKm = 0; this.totalHours = 0;
      this._group.clearLayers();
    },

    _redraw() {
      this._group.clearLayers();
      const pts = this.waypoints.map((p) => [p.lat, p.lon]);
      if (pts.length > 1) {
        L.polyline(pts, { color: "#39a0ff", weight: 3, opacity: 0.9, dashArray: "6 6" })
          .addTo(this._group);
      }
      this.waypoints.forEach((p, i) => {
        const icon = L.divIcon({
          className: "", html: `<div class="wp">${i + 1}</div>`,
          iconSize: [24, 24], iconAnchor: [12, 12],
        });
        L.marker([p.lat, p.lon], { icon }).addTo(this._group);
      });
    },

    // distance + ETA per waypoint
    _compute() {
      const cum = [0];
      for (let i = 1; i < this.waypoints.length; i++) {
        cum[i] = cum[i - 1] + haversine(this.waypoints[i - 1], this.waypoints[i]);
      }
      this.totalKm = cum[cum.length - 1] || 0;
      this.totalHours = this.totalKm / this.speedKmh;
      const etaMs = cum.map((km) => this.startMs + (km / this.speedKmh) * 3600 * 1000);
      return { cum, etaMs };
    },

    async refresh() {
      if (this.waypoints.length < 1) { this.rows = []; return; }
      const { cum, etaMs } = this._compute();
      const { times, series } = await W.api.multiPointHourly(this.waypoints, VARS);
      this.rows = this.waypoints.map((p, i) => {
        const ti = nearestIndex(times, etaMs[i]);
        const s = series[i] || {};
        return {
          lat: p.lat, lon: p.lon, km: cum[i], etaMs: etaMs[i],
          temp: s.temperature_2m ? s.temperature_2m[ti] : null,
          code: s.weather_code ? s.weather_code[ti] : 0,
          wind: s.wind_speed_10m ? s.wind_speed_10m[ti] : null,
          dir: s.wind_direction_10m ? s.wind_direction_10m[ti] : 0,
          precip: s.precipitation ? s.precipitation[ti] : 0,
        };
      });
    },
  };
})(window.W);
