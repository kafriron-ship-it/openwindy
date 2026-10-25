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
