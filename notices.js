/* Public notices and mountain pass reports (homepage).
 * Pass status comes from the real Open-Meteo forecast at each pass's
 * real-world point: heavy snow or gales close it, snow means chains, frost
 * means ice. Notices come from notices.json by date. Cached for 30 minutes.
 */
(function () {
  "use strict";

  var IRT_MS = 6 * 3600000;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function todayIrt() {
    var t = new Date(Date.now() + IRT_MS);
    return { y: t.getUTCFullYear(), md: ("0" + (t.getUTCMonth() + 1)).slice(-2) + "-" + ("0" + t.getUTCDate()).slice(-2) };
  }

  function inRange(from, to, today) {
    var full = today.y + "-" + today.md;
    if (from.length > 5 || to.length > 5) {
      var f = from.length > 5 ? from : today.y + "-" + from, t = to.length > 5 ? to : today.y + "-" + to;
      return full >= f && full <= t;
    }
    return from <= to ? today.md >= from && today.md <= to : today.md >= from || today.md <= to;
  }

  function cached(key, fetcher) {
    try {
      var hit = JSON.parse(localStorage.getItem(key) || "null");
      if (hit && Date.now() - hit.at < 30 * 60000) return Promise.resolve(hit.data);
    } catch (e) { /* ignore */ }
    return fetcher().then(function (d) {
      try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), data: d })); } catch (e) { /* ignore */ }
      return d;
    });
  }

  function passStatus(pass, wx, today) {
    if (pass.season_closed && inRange(pass.season_closed[0], pass.season_closed[1], today)) {
      return { level: "closed", label: "Closed for the season", note: "Reopens in spring." };
    }
    if (!wx || !wx.daily) return null;
    var d = wx.daily, n = d.time.length;
    var snow = Math.max.apply(null, d.snowfall_sum.slice(0, n).map(Number));
    var gust = Math.max.apply(null, d.wind_gusts_10m_max.slice(0, n).map(Number));
    var low = Math.min.apply(null, d.temperature_2m_min.slice(0, n).map(Number));
    var wet = Math.max.apply(null, d.precipitation_sum.slice(0, n).map(Number));
    var lowTxt = "low " + Math.round(low) + "°C";
    if (snow >= 20 || gust >= 90) {
      return { level: "closed", label: "Closed", note: (snow >= 20 ? Math.round(snow) + " cm of snow" : "gusts of " + Math.round(gust) + " km/h") + ", " + lowTxt + ". Use another route." };
    }
    if (snow >= 3) return { level: "chains", label: "Chains required", note: Math.round(snow) + " cm of snow, " + lowTxt + "." };
    if (low <= -8 || (low <= -1 && wet > 0)) return { level: "ice", label: "Ice: drive with care", note: lowTxt + "." };
    return { level: "open", label: "Open", note: lowTxt + "." };
  }

  function render(root, config, weather) {
    var today = todayIrt();
    var roads = root.querySelector(".pass-list");
    var list = root.querySelector(".notice-list");
    roads.innerHTML = "";
    var alerts = [];
    config.passes.forEach(function (p, i) {
      var st = passStatus(p, weather ? weather[i] : null, today);
      var li = el("li", "pass" + (st ? " pass-" + st.level : ""));
      var head = el("div", "pass-head");
      head.appendChild(el("strong", null, p.name));
      head.appendChild(el("span", "pass-badge", st ? st.label : "No report"));
      li.appendChild(head);
      li.appendChild(el("span", "pass-road", p.road + " · " + p.elevation.toLocaleString("en-GB") + " m"));
      if (st) li.appendChild(el("span", "pass-note", st.note));
      roads.appendChild(li);
      if (st && st.level === "closed" && st.label === "Closed") alerts.push(p.name + " is closed: " + st.note);
    });

    list.innerHTML = "";
    var items = alerts.map(function (a) { return { text: a, source: "Road Patrol", alert: true }; })
      .concat(config.notices.filter(function (n) { return inRange(n.from, n.to, today); }));
    items.slice(0, 4).forEach(function (n) {
      var li = el("li", n.alert ? "notice-alert" : "");
      li.appendChild(el("span", "notice-source", n.source));
      li.appendChild(el("span", "notice-text", n.text));
      list.appendChild(li);
    });
  }

  function init() {
    var root = document.getElementById("notices");
    if (!root) return;
    fetch("notices.json", { cache: "no-cache" }).then(function (r) { return r.json(); }).then(function (config) {
      render(root, config, null);  // notices straight away; passes when the forecast arrives
      var p = config.passes;
      var url = "https://api.open-meteo.com/v1/forecast?latitude=" + p.map(function (x) { return x.lat; }).join(",") +
        "&longitude=" + p.map(function (x) { return x.lon; }).join(",") +
        "&elevation=" + p.map(function (x) { return x.elevation; }).join(",") +
        "&daily=snowfall_sum,precipitation_sum,temperature_2m_min,wind_gusts_10m_max&past_days=1&forecast_days=2&timezone=auto";
      cached("iradone-passes-v1", function () {
        return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
      }).then(function (w) { render(root, config, Array.isArray(w) ? w : [w]); })
        .catch(function () { /* passes show "No report" unless season-closed */ });
    }).catch(function () { root.hidden = true; });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
