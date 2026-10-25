// Global namespace + configuration
window.W = window.W || {};

W.config = {
  // Open-Meteo — free, no API key, open CORS
  forecastUrl: "https://api.open-meteo.com/v1/forecast",
  marineUrl: "https://marine-api.open-meteo.com/v1/marine",
  airQualityUrl: "https://air-quality-api.open-meteo.com/v1/air-quality",
  geocodeUrl: "https://geocoding-api.open-meteo.com/v1/search",
  rainviewerIndex: "https://api.rainviewer.com/public/weather-maps.json",

  startCenter: [31.78, 35.21], // Jerusalem
  startZoom: 6,

  windGrid: 11,       // grid points per axis for field sampling
  forecastDays: 16,   // how far the time slider reaches (max for Open-Meteo)
  gridResolution: "hourly_3", // 3-hourly grid frames keep 16 days light
  sliderStep: 1,      // advance one frame (= 3h) per slider tick

  units: { temperature: "celsius", windSpeed: "ms" },
};

// Pressure levels (hPa) for the vertical sounding, surface -> top.
W.soundingLevels = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150];

// Forecast models (Open-Meteo). best_match = Open-Meteo's auto blend.
W.models = [
  { id: "best_match",   label: "אוטומטי" },
  { id: "ecmwf_ifs025", label: "ECMWF" },
  { id: "gfs_global",   label: "GFS (NOAA)" },
  { id: "icon_global",  label: "ICON (DWD)" },
  { id: "gem_global",   label: "GEM (קנדה)" },
];

// Altitude levels. label = friendly altitude; sub = technical (hPa) / purpose.
W.levels = [
  { id: "10m",    label: "קרקע",     sub: "פני הקרקע", windSuffix: "10m",    tempVar: "temperature_2m" },
  { id: "850hPa", label: "1.5 ק\"מ", sub: "850 hPa",   windSuffix: "850hPa", tempVar: "temperature_850hPa" },
  { id: "700hPa", label: "3 ק\"מ",   sub: "700 hPa",   windSuffix: "700hPa", tempVar: "temperature_700hPa" },
  { id: "500hPa", label: "5.5 ק\"מ", sub: "500 hPa",   windSuffix: "500hPa", tempVar: "temperature_500hPa" },
  { id: "300hPa", label: "9 ק\"מ",   sub: "זרם סילון", windSuffix: "300hPa", tempVar: "temperature_300hPa" },
  { id: "250hPa", label: "10.5 ק\"מ",sub: "גובה טיסה", windSuffix: "250hPa", tempVar: "temperature_250hPa" },
];

// Overlay registry. kind: wind | scalar | radar.
// altAware overlays rebuild their variable list from the selected level.
W.overlays = {
  wind:     { label: "רוח",   kind: "wind",   altAware: true,  particles: true },
  gusts:    { label: "משבים", kind: "scalar", colorFn: "wind",     var: "wind_gusts_10m" },
  temp:     { label: "טמפ׳",  kind: "scalar", colorFn: "temp",     altAware: true },
  clouds:   { label: "עננים", kind: "scalar", colorFn: "cloud",    var: "cloud_cover", opacity: 0.7 },
  humidity: { label: "לחות",  kind: "scalar", colorFn: "humidity", var: "relative_humidity_2m", opacity: 0.55 },
  pressure: { label: "לחץ",   kind: "scalar", colorFn: "pressure", var: "pressure_msl", opacity: 0.5 },
  waves:    { label: "גלים",  kind: "scalar", colorFn: "waves",    var: "wave_height", marine: true, opacity: 0.7 },
  aqi:      { label: "אוויר", kind: "scalar", colorFn: "aqi",      var: "european_aqi", airquality: true, opacity: 0.6 },
  rain:     { label: "ראדאר", kind: "radar" },
  satellite:{ label: "לוויין", kind: "satellite" },
  webcams:  { label: "מצלמות", kind: "webcams" },
};

// WMO weather codes -> emoji + Hebrew text
W.wmo = {
  0:["☀️","בהיר"],1:["🌤️","בהיר בעיקר"],2:["⛅","מעונן חלקית"],3:["☁️","מעונן"],
  45:["🌫️","ערפל"],48:["🌫️","ערפל מתנקז"],51:["🌦️","טפטוף קל"],53:["🌦️","טפטוף"],
  55:["🌧️","טפטוף חזק"],56:["🌧️","טפטוף קפוא"],57:["🌧️","טפטוף קפוא חזק"],
  61:["🌧️","גשם קל"],63:["🌧️","גשם"],65:["🌧️","גשם חזק"],66:["🌧️","גשם קפוא"],
  67:["🌧️","גשם קפוא חזק"],71:["🌨️","שלג קל"],73:["🌨️","שלג"],75:["❄️","שלג כבד"],
  77:["🌨️","גרגרי שלג"],80:["🌦️","ממטרים קלים"],81:["🌧️","ממטרים"],82:["⛈️","ממטרים עזים"],
  85:["🌨️","ממטרי שלג"],86:["❄️","ממטרי שלג כבדים"],95:["⛈️","סופת רעמים"],
  96:["⛈️","סופת רעמים + ברד"],99:["⛈️","סופת רעמים + ברד כבד"],
};
W.describe = (c) => W.wmo[c] || ["❓", "לא ידוע"];
