# OpenWindy 🌬️

A free, open-source weather map — an independent alternative to Windy.com, built
entirely on free, keyless public APIs and open-source libraries. No account, no
subscription, no ads.

> The UI is in Hebrew (RTL). Everything runs client-side as a static web app.

## Features

- **10 weather layers** — animated wind, gusts, temperature, clouds, humidity,
  pressure, waves, air quality, live precipitation radar, and satellite imagery.
- **Altitude levels** — surface up to ~10.5 km (850/700/500/300/250 hPa),
  including the jet stream.
- **Time animation** — scrub or play the forecast up to several days ahead.
- **Multiple models** — ECMWF, GFS, ICON, GEM, or an auto blend.
- **Point forecast** — click anywhere for current + hourly + 7-day details and a
  48-hour meteogram.
- **Vertical sounding (airgram)** — temperature, dew point and wind by altitude.
- **Route planner** — drop waypoints and see the weather at each one at your
  estimated arrival time.
- **Spot alerts** — save a spot, pick a sport (kite, windsurf, sail, paraglide,
  surf, SUP) and get the good time windows over the next 7 days.
- **Favorites, unit preferences, installable PWA (offline-capable).**

## Run locally

No build step. Serve the folder over HTTP and open it:

```bash
python3 -m http.server 8777
# then open http://localhost:8777
```

## Self-hosted data (optional, removes rate limits)

The public Open-Meteo API has a generous per-IP free limit — fine for normal
use. To remove it entirely, run your own Open-Meteo instance:

```bash
cd selfhost
docker compose up -d
```

Then in **Settings (⚙)** set the Open-Meteo server to `http://localhost:8080`.
It streams model data on demand from the public bucket, so there is no large
upfront download.

## Data sources & credits

- **[Open-Meteo](https://open-meteo.com/)** — forecast, marine, air-quality and
  geocoding APIs (free for non-commercial use).
- **[RainViewer](https://www.rainviewer.com/)** — precipitation radar tiles.
- **[NASA GIBS](https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs)** — satellite imagery.
- **[OpenStreetMap](https://www.openstreetmap.org/copyright)** — base map tiles.
- **[Leaflet](https://leafletjs.com/)** and
  **[leaflet-velocity](https://github.com/onaci/leaflet-velocity)** — mapping and
  wind animation.
- Webcams (optional) use the **Windy Webcams API** and require your own free key.

Please respect each provider's usage terms. For high-traffic deployments,
consider self-hosting map tiles and the Open-Meteo API.

## License

[MIT](LICENSE) — free to use, modify, and share.
