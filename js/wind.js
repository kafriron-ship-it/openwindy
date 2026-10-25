// Wind particle layer (leaflet-velocity) — fed prebuilt u/v data.
(function (W) {
  W.wind = {
    _layer: null,

    show(map, data) {
      if (this._layer) { this._layer.setData(data); return; }
      this._layer = L.velocityLayer({
        displayValues: true,
        displayOptions: {
          velocityType: "רוח", position: "bottomleft",
          emptyString: "אין נתוני רוח", angleConvention: "bearingCW",
          speedUnit: "m/s", directionString: "כיוון", speedString: "מהירות",
        },
        data,
        minVelocity: 0, maxVelocity: 40, velocityScale: 0.01,
        particleAge: 90, lineWidth: 1.2, particleMultiplier: 1 / 300,
        colorScale: ["#3288bd","#66c2a5","#abdda4","#e6f598",
          "#fee08b","#fdae61","#f46d43","#d53e4f","#9e0142"],
      });
      this._layer.addTo(map);
    },

    remove(map) {
      if (!this._layer) return;
      // Stop the animation loop before removal to avoid a teardown race
      // where leaflet-velocity's queued frame calls getSize() on a nulled map.
      try { if (this._layer._windy) this._layer._windy.stop(); } catch (e) {}
      map.removeLayer(this._layer);
      this._layer = null;
    },
  };
})(window.W);
