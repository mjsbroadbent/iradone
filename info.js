/* IradOne info strip: Irad Time clock, weather for four cities, Bank of Irad
 * exchange rates and the Toktogul reservoir.
 *
 * Everything but the clock comes from IradOne's daily market data,
 * data/today.json (updated every morning at 03:07 Irad Time). If it cannot be
 * read, the rates fall back to the figures below and the weather stays hidden.
 * Results are cached for 30 minutes.
 */
(function () {
  "use strict";

  var IRT_OFFSET_HOURS = 6;
  var CACHE_MINUTES = 30;
  var DATA_URL = (document.querySelector('script[src$="info.js"]') || { src: "info.js" }).src.replace(/info\.js(\?.*)?$/, "data/today.json");

  // Shown as the Bank of Irad would show them: units of foreign currency in som.
  var RATES = [
    { code: "USD", units: 1 },
    { code: "EUR", units: 1 },
    { code: "CNY", units: 1 },
    { code: "RUB", units: 100 },
    { code: "KZT", units: 1000 },
    { code: "UZS", units: 10000 }
  ];

  // Used only when data/today.json cannot be read (som per one unit).
  var FALLBACK_RATES = { USD: 8.40, EUR: 9.74, CNY: 1.18, RUB: 0.1031, KZT: 0.0161, UZS: 0.000664 };

  var WMO = [  // [max code, icon by day, icon by night]
    [0, "fa-sun", "fa-moon"],
    [2, "fa-cloud-sun", "fa-cloud-moon"],
    [3, "fa-cloud", "fa-cloud"],
    [48, "fa-smog", "fa-smog"],
    [57, "fa-cloud-rain", "fa-cloud-rain"],
    [67, "fa-cloud-showers-heavy", "fa-cloud-showers-heavy"],
    [77, "fa-snowflake", "fa-snowflake"],
    [82, "fa-cloud-sun-rain", "fa-cloud-moon-rain"],
    [86, "fa-snowflake", "fa-snowflake"],
    [99, "fa-bolt", "fa-bolt"]
  ];

  function icon(code, isDay) {
    for (var i = 0; i < WMO.length; i++) if (code <= WMO[i][0]) return isDay ? WMO[i][1] : WMO[i][2];
    return "fa-cloud";
  }

  // ---------- small helpers ----------

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function cached(key, maxMinutes, fetcher) {
    try {
      var hit = JSON.parse(localStorage.getItem(key) || "null");
      if (hit && Date.now() - hit.at < maxMinutes * 60000) return Promise.resolve(hit.data);
    } catch (e) { /* storage unavailable */ }
    return fetcher().then(function (data) {
      try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), data: data })); } catch (e) { /* ignore */ }
      return data;
    });
  }

  function getJson(url) {
    return fetch(url, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error(r.status + " " + url);
      return r.json();
    });
  }

  function fmt(n) {
    var digits = n >= 100 ? 1 : 2;
    return n.toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function irt() { return new Date(Date.now() + IRT_OFFSET_HOURS * 3600000); }

  // ---------- clock ----------

  function startClock(node) {
    var days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    function tick() {
      var t = irt();
      var hh = ("0" + t.getUTCHours()).slice(-2), mm = ("0" + t.getUTCMinutes()).slice(-2);
      node.querySelector(".info-time").textContent = hh + ":" + mm;
      node.querySelector(".info-date").textContent =
        days[t.getUTCDay()] + " " + t.getUTCDate() + " " + months[t.getUTCMonth()] + " · Talas";
    }
    tick();
    setInterval(tick, 20000);
  }

  // ---------- weather ----------

  // temperature now, from the day's three-hourly readings
  function tempNow(place, hours) {
    var t = irt(), h = t.getUTCHours() + t.getUTCMinutes() / 60, v = place.temps_3h;
    if (!v || !v.length) return place.high;
    var i = Math.min(v.length - 1, Math.floor(h / 3)), j = Math.min(v.length - 1, i + 1);
    var f = i === j ? 0 : (h - hours[i]) / 3;
    return v[i] + (v[j] - v[i]) * f;
  }

  function showWeather(node, data) {
    var w = data.weather;
    if (!w || !w.places) return;
    var row = node.querySelector(".info-weather-list");
    var hour = irt().getUTCHours(), isDay = hour >= 7 && hour < 19;
    row.innerHTML = "";
    w.places.forEach(function (p) {
      var item = el("li", "info-city");
      item.title = (p.label && p.label.en ? p.label.en : "") + " · high " + p.high + "°, low " + p.low + "°";
      var i = el("i", "fas " + icon(p.code, isDay));
      i.setAttribute("aria-hidden", "true");
      item.appendChild(i);
      item.appendChild(el("span", "info-city-name", p.name.en));
      item.appendChild(el("span", "info-city-temp", Math.round(tempNow(p, w.hours || [0, 3, 6, 9, 12, 15, 18, 21])) + "°C"));
      row.appendChild(item);
    });
    node.hidden = false;
  }

  // ---------- rates and the reservoir ----------

  function showRates(node, perUnit) {
    var row = node.querySelector(".info-rates-list");
    row.innerHTML = "";
    RATES.forEach(function (r) {
      if (!perUnit[r.code]) return;
      var item = el("li", "info-rate");
      item.appendChild(el("span", "info-rate-code", (r.units > 1 ? r.units.toLocaleString("en-GB") + " " : "") + r.code));
      item.appendChild(el("span", "info-rate-value", fmt(perUnit[r.code] * r.units)));
      if (r.code === "USD") item.title = "Fixed by the Bank of Irad since 17 March 2008";
      row.appendChild(item);
    });
    node.hidden = false;
  }

  function showWater(node, data) {
    var t = data.water && data.water.toktogul;
    if (!t) return;
    var old = node.querySelector(".info-water");
    if (old) old.parentNode.removeChild(old);
    var item = el("span", "info-label info-water", "Toktogul " + Math.round(t.fill_pct) + "%");
    item.title = "Toktogul reservoir: " + t.storage_km3.toFixed(2) + " km³ of " + t.total_km3 + " (" +
      (t.trend_label ? t.trend_label.en.toLowerCase() : t.trend) + ")";
    node.appendChild(item);
  }

  function init() {
    var strip = document.getElementById("info-strip");
    if (!strip) return;
    startClock(strip.querySelector(".info-clock"));
    var rates = strip.querySelector(".info-rates");
    cached("iradone-today-v1", CACHE_MINUTES, function () { return getJson(DATA_URL); }).then(function (data) {
      var perUnit = {};
      data.rates.official.rows.forEach(function (r) { perUnit[r.code] = r.som / r.units; });
      showRates(rates, perUnit);
      showWeather(strip.querySelector(".info-weather"), data);
      showWater(rates, data);
    }).catch(function () {
      showRates(rates, FALLBACK_RATES);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
