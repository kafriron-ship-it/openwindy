// Lightweight i18n: Hebrew (default) + English for the core UI.
(function () {
  window.W = window.W || {};
  const W = window.W;
  const he = {
    tagline: "מזג אוויר חינמי",
    search: "חפש עיר או מקום…",
    "levels.title": "גובה",
    "tools.title": "כלים",
    // layers
    "layer.wind": "רוח", "layer.gusts": "משבים", "layer.temp": "טמפ׳",
    "layer.clouds": "עננים", "layer.humidity": "לחות", "layer.pressure": "לחץ",
    "layer.waves": "גלים", "layer.aqi": "אוויר", "layer.storms": "סופות",
    "layer.rain": "ראדאר", "layer.satellite": "לוויין", "layer.webcams": "מצלמות",
    // levels
    "lvl.10m": "קרקע", "lvl.10m.sub": "פני הקרקע",
    "lvl.850hPa": "1.5 ק\"מ", "lvl.700hPa": "3 ק\"מ", "lvl.500hPa": "5.5 ק\"מ",
    "lvl.300hPa": "9 ק\"מ", "lvl.300hPa.sub": "זרם סילון",
    "lvl.250hPa": "10.5 ק\"מ", "lvl.250hPa.sub": "גובה טיסה",
    // models
    "model.best_match": "אוטומטי", "model.ecmwf_ifs025": "ECMWF", "model.gfs_global": "GFS (NOAA)",
    "model.icon_global": "ICON (DWD)", "model.gem_global": "GEM (קנדה)",
    // sports
    "sport.kite": "קייטסרף", "sport.windsurf": "וינדסרף", "sport.sail": "שייט",
    "sport.paraglide": "פאראגלידינג", "sport.surf": "גלישת גלים", "sport.sup": "סאפ / דיג",
    // tools menu
    "tool.route": "תכנון מסלול", "tool.route.d": "תחזית בכל נקודה לאורך הדרך",
    "tool.fav": "ספוטים והתראות", "tool.fav.d": "שמור ספוט + ספורט לקבלת חלונות טובים",
    "tool.xh": "כוונת מרכז",
    "tool.xh.on": "מוצגת — לחץ לכיבוי", "tool.xh.off": "מוסתרת — לחץ להצגה",
    "tool.alerts": "התראות ספוטים", "tool.alerts.d": "התראה כשיש תנאים טובים בספוטים שלך",
    "tool.share": "שתף מפה", "tool.share.d": "העתק קישור למיקום והשכבה הנוכחיים",
    "tool.settings": "הגדרות", "tool.settings.d": "יחידות, שפה, מצלמות, שרת עצמאי",
    "tool.lang": "English",
    "locate": "המיקום שלי",
    "share.copied": "🔗 הקישור הועתק!",
    "legend.wind": "💨 מהירות רוח", "legend.gusts": "🌬️ משבי רוח",
    "legend.temp": "🌡️ טמפרטורה", "legend.clouds": "☁️ כיסוי עננים",
    "legend.humidity": "💧 לחות יחסית", "legend.pressure": "🎈 לחץ ברומטרי",
    "legend.waves": "🌊 גובה גלים", "legend.aqi": "😷 איכות אוויר",
    "legend.storms": "⛈️ פוטנציאל סופות",
  };

  const en = {
    tagline: "Free weather",
    search: "Search city or place…",
    "levels.title": "Altitude",
    "tools.title": "Tools",
    "layer.wind": "Wind", "layer.gusts": "Gusts", "layer.temp": "Temp",
    "layer.clouds": "Clouds", "layer.humidity": "Humidity", "layer.pressure": "Pressure",
    "layer.waves": "Waves", "layer.aqi": "Air", "layer.storms": "Storms",
    "layer.rain": "Radar", "layer.satellite": "Satellite", "layer.webcams": "Webcams",
    "lvl.10m": "Surface", "lvl.10m.sub": "ground level",
    "lvl.850hPa": "1.5 km", "lvl.700hPa": "3 km", "lvl.500hPa": "5.5 km",
    "lvl.300hPa": "9 km", "lvl.300hPa.sub": "jet stream",
    "lvl.250hPa": "10.5 km", "lvl.250hPa.sub": "flight level",
    "model.best_match": "Auto", "model.ecmwf_ifs025": "ECMWF", "model.gfs_global": "GFS (NOAA)",
    "model.icon_global": "ICON (DWD)", "model.gem_global": "GEM (Canada)",
    "sport.kite": "Kitesurf", "sport.windsurf": "Windsurf", "sport.sail": "Sailing",
    "sport.paraglide": "Paragliding", "sport.surf": "Surfing", "sport.sup": "SUP / Fishing",
    "tool.route": "Route planner", "tool.route.d": "Weather at every point along the way",
    "tool.fav": "Spots & alerts", "tool.fav.d": "Save a spot + sport for good windows",
    "tool.xh": "Center crosshair",
    "tool.xh.on": "shown — tap to hide", "tool.xh.off": "hidden — tap to show",
    "tool.alerts": "Spot alerts", "tool.alerts.d": "Get notified when conditions are good",
    "tool.share": "Share map", "tool.share.d": "Copy a link to the current view",
    "tool.settings": "Settings", "tool.settings.d": "Units, language, webcams, self-host",
    "tool.lang": "עברית",
    "locate": "My location",
    "share.copied": "🔗 Link copied!",
    "legend.wind": "💨 Wind speed", "legend.gusts": "🌬️ Wind gusts",
    "legend.temp": "🌡️ Temperature", "legend.clouds": "☁️ Cloud cover",
    "legend.humidity": "💧 Relative humidity", "legend.pressure": "🎈 Pressure",
    "legend.waves": "🌊 Wave height", "legend.aqi": "😷 Air quality",
    "legend.storms": "⛈️ Storm potential",
  };

  let lang = "he";
  try { lang = localStorage.getItem("ow_lang") || "he"; } catch (e) {}

  W.i18n = {
    get lang() { return lang; },
    t(k) { const d = lang === "en" ? en : he; return d[k] != null ? d[k] : (he[k] != null ? he[k] : k); },
    set(l) { lang = l; try { localStorage.setItem("ow_lang", l); } catch (e) {} },
  };
  W.t = (k) => W.i18n.t(k);
})();
