// Spot condition engine: score forecast hours per sport, find good time windows.
(function (W) {
  // Thresholds in KNOTS for wind, METERS for waves.
  W.SPORTS = {
    kite:      { label: "קייטסרף",      icon: "🪁", kind: "wind",    good: [12, 40], great: [16, 30] },
    windsurf:  { label: "וינדסרף",      icon: "🏄", kind: "wind",    good: [12, 35], great: [15, 28] },
    sail:      { label: "שייט",          icon: "⛵", kind: "wind",    good: [7, 27],  great: [10, 20] },
    paraglide: { label: "פאראגלידינג",   icon: "🪂", kind: "windLow", good: [1, 15],  great: [3, 11], rainBad: true },
    surf:      { label: "גלישת גלים",     icon: "🌊", kind: "wave",    goodWave: [0.8, 4], greatWave: [1.2, 2.8], windMax: 18 },
    sup:       { label: "סאפ / דיג",      icon: "🛶", kind: "calm",    windMax: 12, waveMax: 0.6, rainBad: true },
  };
  W.sportsNeedingWaves = ["surf", "sup"];

  const inRange = (v, r) => v >= r[0] && v <= r[1];
  const MS_TO_KT = 1.94384;

  // score one hour -> 0 (no) | 1 (good) | 2 (great)
  function scoreHour(sport, h) {
    const s = W.SPORTS[sport];
    if (!s) return 0;
    if (s.rainBad && (h.precip || 0) > 0.3) return 0;
    const kt = (h.windMs || 0) * MS_TO_KT;
    if (s.kind === "wind" || s.kind === "windLow") {
      if (inRange(kt, s.great)) return 2;
      if (inRange(kt, s.good)) return 1;
      return 0;
    }
    if (s.kind === "wave") {
      const w = h.waveM;
      if (w == null) return 0;
      if (kt > s.windMax + 8) return 0;
      if (inRange(w, s.greatWave) && kt <= s.windMax) return 2;
      if (inRange(w, s.goodWave)) return 1;
      return 0;
    }
    if (s.kind === "calm") {
      if (kt > s.windMax) return 0;
      if (h.waveM != null && h.waveM > s.waveMax) return 0;
      return kt <= s.windMax * 0.6 ? 2 : 1;
    }
    return 0;
  }

  // hours: [{time(ISO local), windMs, waveM, precip}] -> windows of score>=1 in daytime
  function findWindows(sport, hours) {
    const scored = hours.map((h) => ({ ...h, s: scoreHour(sport, h), d: new Date(h.time) }));
    const windows = [];
    let cur = null;
    for (let i = 0; i < scored.length; i++) {
      const h = scored[i];
      const daytime = h.d.getHours() >= 6 && h.d.getHours() <= 20;
      if (h.s >= 1 && daytime) {
        if (!cur) cur = { start: i, end: i, peak: h.s, winds: [h.windMs], waves: [] };
        else { cur.end = i; cur.peak = Math.max(cur.peak, h.s); cur.winds.push(h.windMs); }
        if (h.waveM != null) cur.waves.push(h.waveM);
      } else if (cur) { windows.push(cur); cur = null; }
    }
    if (cur) windows.push(cur);
    return windows.map((w) => ({
      startTime: scored[w.start].d, endTime: scored[w.end].d,
      peak: w.peak,
      windMinMs: Math.min(...w.winds), windMaxMs: Math.max(...w.winds),
      waveMax: w.waves.length ? Math.max(...w.waves) : null,
    }));
  }

  W.spots = { scoreHour, findWindows };
})(window.W);
