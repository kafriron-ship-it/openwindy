// Unit preferences + conversion/formatting (persisted in localStorage).
(function (W) {
  const KEY = "ow_units";
  const def = { temp: "c", wind: "ms" };
  let prefs = def;
  try { prefs = Object.assign({}, def, JSON.parse(localStorage.getItem(KEY) || "{}")); }
  catch (e) { prefs = { ...def }; }

  const windFactor = { ms: 1, kmh: 3.6, kt: 1.94384 };
  const windLabels = { ms: "m/s", kmh: 'קמ"ש', kt: "קשר" };

  W.units = {
    get temp() { return prefs.temp; },
    get wind() { return prefs.wind; },

    set(partial) {
      prefs = Object.assign({}, prefs, partial);
      try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) {}
    },

    // temperature: input is °C
    tempVal(c) { return prefs.temp === "f" ? c * 9 / 5 + 32 : c; },
    tempStr(c) { return `${Math.round(this.tempVal(c))}°`; },
    tempUnit() { return prefs.temp === "f" ? "°F" : "°C"; },

    // wind: input is m/s
    windVal(ms) { return ms * windFactor[prefs.wind]; },
    windStr(ms) { return `${Math.round(this.windVal(ms))} ${windLabels[prefs.wind]}`; },
    windUnit() { return windLabels[prefs.wind]; },
  };
})(window.W);
