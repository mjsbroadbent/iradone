/* IradOne info strip: Irad Time clock, weather for four cities, and
 * Bank of Irad exchange rates.
 *
 * Weather: Open-Meteo (free, no key). Each Irad city takes its weather from
 * a real-world point that matches its place in the lore.
 * Rates: open.er-api.com (free, daily, no key; attribution required).
 * The som is pegged at 5 per US dollar, so every rate is the real dollar
 * rate converted through the peg. Results are cached for 30 minutes.
 */
(function () {
  "use strict";

  var IRT_OFFSET_HOURS = 6;
  var SOM_PER_USD = 5;
  var CACHE_MINUTES = 30;

  var CITIES = [
    { name: "Talas", lat: 42.52, lon: 72.24, elevation: 1270 },
    { name: "Nurzhan", lat: 43.2, lon: 73.0, elevation: 740 },         // lower Chu plain
    { name: "Iyık Janyl", lat: 41.48, lon: 72.38, elevation: 1280 },   // Fergana Range foothills
    { name: "Tash-Kömür", lat: 41.35, lon: 72.23, elevation: 690 }
  ];

  // Quoted as the Bank of Irad would show them: units of foreign currency in som.
  var RATES = [
    { code: "USD", units: 1, fixed: true },
    { code: "EUR", units: 1 },
    { code: "CNY", units: 1 },
    { code: "RUB", units: 100 },
    { code: "KZT", units: 1000 },
    { code: "UZS", units: 10000 }
  ];

  var WMO = [  // [max code, label, icon by day, icon by night]
    [0, "Clear", "fa-sun", "fa-moon"],
    [2, "Partly cloudy", "fa-cloud-sun", "fa-cloud-moon"],
    [3, "Overcast", "fa-cloud", "fa-cloud"],
    [48, "Fog", "fa-smog", "fa-smog"],
    [57, "Drizzle", "fa-cloud-rain", "fa-cloud-rain"],
    [67, "Rain", "fa-cloud-showers-heavy", "fa-cloud-showers-heavy"],
    [77, "Snow", "fa-snowflake", "fa-snowflake"],
    [82, "Showers", "fa-cloud-sun-rain", "fa-cloud-moon-rain"],
    [86, "Snow showers", "fa-snowflake", "fa-snowflake"],
    [99, "Thunderstorm", "fa-bolt", "fa-bolt"]
  ];

  function wmo(code, isDay) {
    for (var i = 0; i < WMO.length; i++) {
      if (code <= WMO[i][0]) return { label: WMO[i][1], icon: isDay ? WMO[i][2] : WMO[i][3] };
    }
    return { label: "", icon: "fa-cloud" };
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
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status + " " + url); return r.json(); });
  }

  function fmt(n) {
    var digits = n >= 100 ? 1 : 2;
    return n.toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  // ---------- clock ----------

  function startClock(node) {
    var days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    function tick() {
      var t = new Date(Date.now() + IRT_OFFSET_HOURS * 3600000);
      var hh = ("0" + t.getUTCHours()).slice(-2), mm = ("0" + t.getUTCMinutes()).slice(-2);
      node.querySelector(".info-time").textContent = hh + ":" + mm;
      node.querySelector(".info-date").textContent =
        days[t.getUTCDay()] + " " + t.getUTCDate() + " " + months[t.getUTCMonth()] + " · Talas";
    }
    tick();
    setInterval(tick, 20000);
  }

  // ---------- weather ----------

  function loadWeather(node) {
    var url = "https://api.open-meteo.com/v1/forecast?latitude=" + CITIES.map(function (c) { return c.lat; }).join(",") +
      "&longitude=" + CITIES.map(function (c) { return c.lon; }).join(",") +
      "&elevation=" + CITIES.map(function (c) { return c.elevation; }).join(",") +
      "&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min" +
      "&timezone=auto&forecast_days=1";
    return cached("iradone-weather-v1", CACHE_MINUTES, function () { return getJson(url); }).then(function (data) {
      var list = Array.isArray(data) ? data : [data];
      var row = node.querySelector(".info-weather-list");
      row.innerHTML = "";
      CITIES.forEach(function (city, i) {
        var d = list[i];
        if (!d || !d.current) return;
        var w = wmo(d.current.weather_code, d.current.is_day);
        var item = el("li", "info-city");
        item.title = w.label + (d.daily ? " · high " + Math.round(d.daily.temperature_2m_max[0]) +
          "°, low " + Math.round(d.daily.temperature_2m_min[0]) + "°" : "");
        var icon = el("i", "fas " + w.icon);
        icon.setAttribute("aria-hidden", "true");
        item.appendChild(icon);
        item.appendChild(el("span", "info-city-name", city.name));
        item.appendChild(el("span", "info-city-temp", Math.round(d.current.temperature_2m) + "°C"));
        row.appendChild(item);
      });
      node.hidden = false;
    });
  }

  // ---------- rates ----------

  function loadRates(node) {
    return cached("iradone-rates-v1", CACHE_MINUTES, function () {
      return getJson("https://open.er-api.com/v6/latest/USD");
    }).then(function (data) {
      if (data.result !== "success") throw new Error("rates unavailable");
      var row = node.querySelector(".info-rates-list");
      row.innerHTML = "";
      RATES.forEach(function (r) {
        var perUsd = r.fixed ? 1 : data.rates[r.code];
        if (!perUsd) return;
        var som = SOM_PER_USD / perUsd * r.units;
        var item = el("li", "info-rate");
        item.appendChild(el("span", "info-rate-code", (r.units > 1 ? r.units.toLocaleString("en-GB") + " " : "") + r.code));
        item.appendChild(el("span", "info-rate-value", fmt(som)));
        if (r.fixed) item.title = "Fixed by the Bank of Irad since 1993";
        row.appendChild(item);
      });
      node.hidden = false;
    });
  }

  function init() {
    var strip = document.getElementById("info-strip");
    if (!strip) return;
    startClock(strip.querySelector(".info-clock"));
    loadWeather(strip.querySelector(".info-weather")).catch(function () { /* stays hidden */ });
    loadRates(strip.querySelector(".info-rates")).catch(function () { /* stays hidden */ });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
