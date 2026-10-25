// Scalar heat overlays (fed prebuilt grids) + colour ramps + radar tiles.
(function (W) {
  function ramp(stops, t) {
    if (t <= stops[0][0]) return stops[0].slice(1);
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const a = stops[i - 1], b = stops[i];
        const f = (t - a[0]) / (b[0] - a[0]);
        return [1, 2, 3].map((k) => Math.round(a[k] + (b[k] - a[k]) * f));
      }
    }
    return stops[stops.length - 1].slice(1);
  }

  const RAMPS = {
    temp: [[-30,40,40,110],[-10,40,90,200],[0,80,170,230],[10,120,210,160],
           [20,240,220,110],[30,240,150,60],[40,220,50,40],[50,150,20,60]],
    wind: [[0,60,110,180],[5,90,180,160],[10,120,210,120],[15,240,220,110],
           [20,245,160,60],[28,230,80,50],[40,150,20,60]],
    pressure: [[970,120,40,160],[1000,80,120,220],[1013,120,200,160],
               [1025,240,210,110],[1045,230,90,50]],
    waves: [[0,30,80,150],[1,60,150,200],[2,90,210,180],[3,240,220,110],
            [5,240,130,60],[8,200,40,60]],
    aqi: [[0,80,200,120],[20,180,220,80],[40,245,215,70],[60,245,150,60],
          [80,220,60,60],[100,150,40,120],[150,110,20,80]],
    cape: [[0,60,110,180],[300,90,200,140],[800,240,220,90],[1500,240,150,60],
           [2500,220,60,60],[4000,150,30,110]],
  };

  const COLORFN = {
    temp:     (v) => ramp(RAMPS.temp, v),
    wind:     (v) => ramp(RAMPS.wind, v),
    pressure: (v) => ramp(RAMPS.pressure, v),
    waves:    (v) => [...ramp(RAMPS.waves, v), 235],
    aqi:      (v) => [...ramp(RAMPS.aqi, v), 205],
    cape:     (v) => [...ramp(RAMPS.cape, v), v < 100 ? Math.round(v * 1.9) : 190],
    cloud:    (v) => [235, 240, 250, Math.round((v / 100) * 230)],
    humidity: (v) => [70, 150, 220, Math.round((v / 100) * 200)],
  };
  W.colorFor = (name) => COLORFN[name] || COLORFN.temp;

  // Canvas scalar layer. Fed data via setData(); never fetches.
  W.ScalarLayer = L.Layer.extend({
    initialize(opts) { this._o = Object.assign({ opacity: 0.55 }, opts); this._data = null; },
    onAdd(map) {
      this._map = map;
      this._canvas = L.DomUtil.create("canvas", "leaflet-zoom-animated");
      this._canvas.style.opacity = String(this._o.opacity);
      map.getPanes().overlayPane.appendChild(this._canvas);
      map.on("moveend zoomend", this._reposition, this);
      if (this._data) this._draw();
    },
    onRemove(map) {
      if (this._canvas) L.DomUtil.remove(this._canvas);
      map.off("moveend zoomend", this._reposition, this);
    },
    setColorFn(fn) { this._o.colorFn = fn; },
    setData(d) { this._data = d; if (this._map) this._draw(); },
    _reposition() { if (this._data) this._draw(); },
    _draw() {
      const map = this._map, g = this._data;
      if (!map || !g) return;
      const size = map.getSize(), cv = this._canvas;
      cv.width = size.x; cv.height = size.y;
      L.DomUtil.setPosition(cv, map.containerPointToLayerPoint([0, 0]));
      const ctx = cv.getContext("2d");
      ctx.clearRect(0, 0, size.x, size.y);

      const off = document.createElement("canvas");
      off.width = g.n; off.height = g.n;
      const octx = off.getContext("2d");
      const img = octx.createImageData(g.n, g.n);
      const cf = this._o.colorFn;
      for (let k = 0; k < g.values.length; k++) {
        const v = g.values[k];
        if (v == null) { img.data[k * 4 + 3] = 0; continue; }
        const c = cf(v);
        img.data[k*4] = c[0]; img.data[k*4+1] = c[1];
        img.data[k*4+2] = c[2]; img.data[k*4+3] = c.length > 3 ? c[3] : 255;
      }
      octx.putImageData(img, 0, 0);

      const nw = map.latLngToContainerPoint([g.north, g.west]);
      const se = map.latLngToContainerPoint([g.south, g.east]);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(off, nw.x, nw.y, se.x - nw.x, se.y - nw.y);
    },
  });

  // RainViewer radar tiles (scheme 4 = universal blue).
  W.radarTiles = function (host, frame) {
    return L.tileLayer(`${host}${frame.path}/256/{z}/{x}/{y}/4/1_1.png`,
      { opacity: 0.7, maxZoom: 12, attribution: "RainViewer" });
  };

  // NASA GIBS MODIS true-colour satellite (keyless, daily snapshot).
  W.satelliteTiles = function () {
    const d = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    return L.tileLayer(
      `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${d}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
      { maxNativeZoom: 9, maxZoom: 19, attribution: "NASA GIBS", opacity: 1 });
  };
})(window.W);
