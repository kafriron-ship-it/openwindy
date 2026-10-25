// Field cache: holds one hourly grid and serves velocity/scalar data by time index.
(function (W) {
  function toUV(speed, dirDeg) {
    const r = (dirDeg * Math.PI) / 180;
    return { u: -speed * Math.sin(r), v: -speed * Math.cos(r) };
  }

  W.Field = {
    grid: null,
    _key: null,

    get times() { return (this.grid && this.grid.times) || []; },
    get n() { return this.grid ? this.grid.n : 0; },

    // Load variables for the viewport. Skips refetch if key (bounds+vars) unchanged.
    async load(bounds, variables, opts = {}) {
      const b = bounds;
      const key = [
        b.getNorth().toFixed(2), b.getSouth().toFixed(2),
        b.getWest().toFixed(2), b.getEast().toFixed(2),
        variables.join("|"),
        opts.marine ? "m" : opts.airquality ? "a" : "f",
        opts.model || "best_match",
      ].join(",");
      if (key === this._key && this.grid) return this.grid;
      this.grid = await W.api.hourlyGrid(bounds, W.config.windGrid, variables, opts);
      this._key = key;
      return this.grid;
    },

    // Build leaflet-velocity [u,v] data for a given time index.
    velocityAt(ti, speedVar, dirVar) {
      const g = this.grid;
      const u = new Array(g.series.length), v = new Array(g.series.length);
      for (let k = 0; k < g.series.length; k++) {
        const sp = g.series[k][speedVar][ti];
        const dr = g.series[k][dirVar][ti];
        const c = toUV(sp || 0, dr || 0);
        u[k] = c.u; v[k] = c.v;
      }
      const header = {
        parameterUnit: "m.s-1", nx: g.n, ny: g.n,
        lo1: g.west, la1: g.north, dx: g.dLon, dy: g.dLat,
        refTime: g.times[ti] || new Date().toISOString(), forecastTime: 0,
      };
      return [
        { header: { ...header, parameterCategory: 2, parameterNumber: 2 }, data: u },
        { header: { ...header, parameterCategory: 2, parameterNumber: 3 }, data: v },
      ];
    },

    // Bilinear-interpolate one variable at an arbitrary lat/lon for time ti.
    sampleAt(lat, lon, variable, ti) {
      const g = this.grid;
      if (!g) return null;
      const col = (lon - g.west) / g.dLon;      // 0..n-1 (west->east)
      const row = (g.north - lat) / g.dLat;     // 0..n-1 (north->south)
      if (col < 0 || col > g.n - 1 || row < 0 || row > g.n - 1) return null;
      const i0 = Math.floor(col), j0 = Math.floor(row);
      const i1 = Math.min(i0 + 1, g.n - 1), j1 = Math.min(j0 + 1, g.n - 1);
      const fx = col - i0, fy = row - j0;
      const val = (j, i) => {
        const a = g.series[j * g.n + i][variable];
        return a ? a[ti] : null;
      };
      const v00 = val(j0, i0), v10 = val(j0, i1), v01 = val(j1, i0), v11 = val(j1, i1);
      if ([v00, v10, v01, v11].some((v) => v == null)) {
        return v00 != null ? v00 : v10 != null ? v10 : v01 != null ? v01 : v11; // nearest fallback
      }
      const top = v00 * (1 - fx) + v10 * fx;
      const bot = v01 * (1 - fx) + v11 * fx;
      return top * (1 - fy) + bot * fy;
    },

    // Nearest grid value (for circular quantities like wind direction).
    nearestAt(lat, lon, variable, ti) {
      const g = this.grid;
      if (!g) return null;
      const i = Math.round((lon - g.west) / g.dLon);
      const j = Math.round((g.north - lat) / g.dLat);
      if (i < 0 || i > g.n - 1 || j < 0 || j > g.n - 1) return null;
      const a = g.series[j * g.n + i][variable];
      return a ? a[ti] : null;
    },

    // Values for a scalar variable at a time index (row-major, null-safe).
    scalarAt(ti, variable) {
      const g = this.grid;
      return {
        values: g.series.map((s) => {
          const a = s[variable];
          return a && a[ti] != null ? a[ti] : null;
        }),
        north: g.north, south: g.south, west: g.west, east: g.east, n: g.n,
      };
    },
  };
})(window.W);
