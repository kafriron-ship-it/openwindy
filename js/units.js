// Unit preferences + conversions (persisted). International unit symbols.
(function (W) {
  const KEY = "ow_units";
  const def = { temp: "c", wind: "ms", pressure: "hpa", precip: "mm", dist: "km", wave: "m" };
  let prefs = def;
  try { prefs = Object.assign({}, def, JSON.parse(localStorage.getItem(KEY) || "{}")); }
  catch (e) { prefs = { ...def }; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) {} };

  const windF = { ms: 1, kmh: 3.6, kt: 1.94384, mph: 2.23694 };
  const windL_he = { ms: "m/s", kmh: 'קמ"ש', kt: "קשר", mph: "mph" };
  const windL_en = { ms: "m/s", kmh: "km/h", kt: "kt", mph: "mph" };
  const windL = () => (W.i18n && W.i18n.lang === "en" ? windL_en : windL_he);
  const presF = { hpa: 1, inhg: 0.02953, mmhg: 0.750062 };
  const presL = { hpa: "hPa", inhg: "inHg", mmhg: "mmHg" };
  const presD = { hpa: 0, inhg: 2, mmhg: 0 };
  const r = (v, d) => (d ? v.toFixed(d) : String(Math.round(v)));

  W.units = {
    get temp() { return prefs.temp; }, get wind() { return prefs.wind; },
    get pressure() { return prefs.pressure; }, get precip() { return prefs.precip; },
    get dist() { return prefs.dist; }, get wave() { return prefs.wave; },

    set(partial) { prefs = Object.assign({}, prefs, partial); save(); },
    setSystem(sys) {
      prefs = sys === "imperial"
        ? { temp: "f", wind: "mph", pressure: "inhg", precip: "in", dist: "mi", wave: "ft" }
        : { temp: "c", wind: "ms", pressure: "hpa", precip: "mm", dist: "km", wave: "m" };
      save();
    },

    // temperature (input °C)
    tempVal(c) { return prefs.temp === "f" ? c * 9 / 5 + 32 : c; },
    tempStr(c) { return `${Math.round(this.tempVal(c))}°`; },
    tempUnit() { return prefs.temp === "f" ? "°F" : "°C"; },

    // wind (input m/s)
    windVal(ms) { return ms * windF[prefs.wind]; },
    windStr(ms) { return `${Math.round(this.windVal(ms))} ${windL()[prefs.wind]}`; },
    windUnit() { return windL()[prefs.wind]; },

    // pressure (input hPa)
    presVal(hpa) { return hpa * presF[prefs.pressure]; },
    presStr(hpa) { return `${r(this.presVal(hpa), presD[prefs.pressure])} ${presL[prefs.pressure]}`; },
    presUnit() { return presL[prefs.pressure]; },

    // precipitation (input mm)
    precipVal(mm) { return prefs.precip === "in" ? mm * 0.0393701 : mm; },
    precipStr(mm) { return `${r(this.precipVal(mm), prefs.precip === "in" ? 2 : 1)} ${prefs.precip === "in" ? "in" : "mm"}`; },
    precipUnit() { return prefs.precip === "in" ? "in" : "mm"; },

    // distance (input km)
    distVal(km) { return prefs.dist === "mi" ? km * 0.621371 : km; },
    distStr(km) { return `${Math.round(this.distVal(km))} ${prefs.dist === "mi" ? "mi" : "km"}`; },
    distUnit() { return prefs.dist === "mi" ? "mi" : "km"; },

    // wave height (input m)
    waveVal(m) { return prefs.wave === "ft" ? m * 3.28084 : m; },
    waveStr(m) { return `${this.waveVal(m).toFixed(1)} ${prefs.wave === "ft" ? "ft" : "m"}`; },
    waveUnit() { return prefs.wave === "ft" ? "ft" : "m"; },
  };
})(window.W);
