// Saved locations (persisted in localStorage).
(function (W) {
  const KEY = "ow_favs";
  let list = [];
  try { list = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { list = []; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {} };
  const same = (a, lat, lon) => Math.abs(a.lat - lat) < 0.05 && Math.abs(a.lon - lon) < 0.05;

  W.favorites = {
    all() { return list.slice(); },
    has(lat, lon) { return list.some((f) => same(f, lat, lon)); },
    add(name, lat, lon) {
      if (this.has(lat, lon)) return;
      list.push({ name: name || `${lat.toFixed(2)}, ${lon.toFixed(2)}`, lat, lon });
      save();
    },
    remove(lat, lon) { list = list.filter((f) => !same(f, lat, lon)); save(); },
    toggle(name, lat, lon) {
      if (this.has(lat, lon)) { this.remove(lat, lon); return false; }
      this.add(name, lat, lon); return true;
    },
  };
})(window.W);
