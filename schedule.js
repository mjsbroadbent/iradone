/* IradOne programme schedule.
 *
 * Builds the TV guide from schedule.json. Every visitor sees the same
 * schedule for a given date: films, episodes and topics are chosen by a
 * seeded random number generator keyed on the date, not on page load.
 * All times are Irad Time (UTC+6). The broadcast day runs from 05:00 to
 * 05:00, so a programme at 01:30 belongs to the previous day's schedule.
 *
 * The engine (IradSchedule.buildDay) has no DOM dependencies, so it can be
 * tested on its own.
 */
(function (global) {
  "use strict";

  var IRT_OFFSET_HOURS = 6;
  var DAY_START_MIN = 5 * 60;          // broadcast day starts at 05:00
  var DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MS_DAY = 86400000;

  // ---------- dates (calendar dates are UTC-midnight Date objects) ----------

  function ymd(d) { return d.toISOString().slice(0, 10); }
  function parseYmd(s) { return new Date(s + "T00:00:00Z"); }
  function addDays(d, n) { return new Date(d.getTime() + n * MS_DAY); }
  function daysBetween(a, b) { return Math.round((b.getTime() - a.getTime()) / MS_DAY); }

  function nowIrt(nowMs) {
    // A Date whose UTC fields read as Irad wall-clock time.
    return new Date((nowMs === undefined ? Date.now() : nowMs) + IRT_OFFSET_HOURS * 3600000);
  }

  function broadcastToday(nowMs) {
    var irt = nowIrt(nowMs);
    var mins = irt.getUTCHours() * 60 + irt.getUTCMinutes();
    var day = new Date(Date.UTC(irt.getUTCFullYear(), irt.getUTCMonth(), irt.getUTCDate()));
    return { date: mins < DAY_START_MIN ? addDays(day, -1) : day,
             minute: mins < DAY_START_MIN ? mins + 1440 : mins };
  }

  function easterSunday(year) {  // Gregorian (the church calendar since 1931)
    var a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
    var f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(year, month - 1, day));
  }

  // ---------- times ----------

  function toMin(t) {  // "01:30" -> 1530 (after midnight counts as the same broadcast day)
    var p = t.split(":"), m = parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
    return m < DAY_START_MIN ? m + 1440 : m;
  }

  function fmtMin(m) {
    m = m % 1440;
    var h = Math.floor(m / 60), mm = m % 60;
    return (h < 10 ? "0" : "") + h + ":" + (mm < 10 ? "0" : "") + mm;
  }

  // ---------- seeded randomness ----------

  function hashString(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function rng(seed) {  // mulberry32
    var a = typeof seed === "string" ? hashString(seed) : seed;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffled(list, seed) {
    var out = list.slice(), r = rng(seed);
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1)), tmp = out[i]; out[i] = out[j]; out[j] = tmp;
    }
    return out;
  }

  function pick(list, seed) { return list[Math.floor(rng(seed)() * list.length)]; }

  // ---------- specials ----------

  function specialMatches(sp, date) {
    var mmdd = ymd(date).slice(5), year = date.getUTCFullYear();
    if (sp.date) return sp.date.length === 5 ? sp.date === mmdd : sp.date === ymd(date);
    if (typeof sp.easter === "number") return ymd(addDays(easterSunday(year), sp.easter)) === ymd(date);
    if (sp.nth_weekday) {
      var nw = sp.nth_weekday;
      if (date.getUTCMonth() + 1 !== nw.month || DAY_KEYS[date.getUTCDay()] !== nw.weekday) return false;
      return Math.floor((date.getUTCDate() - 1) / 7) + 1 === nw.n;
    }
    if (sp.first_weekday_after) {
      var fw = sp.first_weekday_after, p = fw.date.split("-");
      var d = new Date(Date.UTC(year, parseInt(p[0], 10) - 1, parseInt(p[1], 10)));
      do { d = addDays(d, 1); } while (DAY_KEYS[d.getUTCDay()] !== fw.weekday);
      return ymd(d) === ymd(date);
    }
    return false;
  }

  // ---------- programme details ----------

  function airingsSince(start, every, date) {
    // How many times a show airing on `every` weekdays has aired from `start` up to and including `date`.
    var days = daysBetween(start, date);
    if (days < 0) return 0;
    var weeks = Math.floor(days / 7), n = weeks * every.length;
    for (var i = weeks * 7; i <= days; i++) {
      if (every.indexOf(DAY_KEYS[addDays(start, i).getUTCDay()]) !== -1) n++;
    }
    return n;
  }

  function headlineFor(news, date, maxAgeDays, today) {
    if (!news || !news.length || date.getTime() > today.getTime()) return null;
    for (var i = 0; i < news.length; i++) {
      var pub = parseYmd(news[i].published.slice(0, 10));
      var age = daysBetween(pub, date);
      if (age >= 0 && age <= maxAgeDays) return news[i];
    }
    return null;
  }

  function detailFor(id, show, date, data, news, today, slotIndex) {
    var d = show.detail;
    if (!d) return null;
    var key = ymd(date) + "|" + id + "|" + slotIndex;
    var pool = d.pool ? data.pools[d.pool] : null;
    switch (d.type) {
      case "pool":
        return (d.prefix || "") + pick(pool, key);
      case "film": {
        // One shuffle per week and pool, so a film doesn't repeat within the week.
        var films = data.films[d.pool];
        var week = Math.floor(daysBetween(parseYmd("2024-01-01"), date) / 7);
        var order = shuffled(films, d.pool + "|week" + week);
        return order[((date.getUTCDay() + 6) % 7) % order.length];  // Monday-first, 7 different films a week
      }
      case "series": {
        var n = airingsSince(parseYmd(d.start), d.every, date);
        if (n < 1) return null;
        if (!pool) return (d.label || "Episode") + " " + n;
        var len = pool.length, idx = (n - 1) % len;
        if (d.label === "Part") return "Part " + (idx + 1) + ": " + pool[idx];
        return "Ep. " + (idx + 1) + ": " + pool[idx];
      }
      case "serial": {
        var ep = airingsSince(parseYmd(d.start), d.every, date) + (d.first_episode || 1) - 1;
        if (ep < 1) return null;
        return "Episode " + ep + ": " + pool[(ep - 1) % pool.length];
      }
      case "headline": {
        var h = headlineFor(news, date, 1, today);
        return h ? (d.prefix || "") + h.headline : null;
      }
      case "headline_or_pool": {
        var hh = headlineFor(news, date, d.max_age_days || 3, today);
        return (d.prefix || "") + (hh ? hh.headline : pick(pool, key));
      }
    }
    return null;
  }

  // ---------- building a day ----------

  function resolveShow(ref, date) {
    if (!ref) return null;
    if (typeof ref === "string") return ref;
    if (ref.months && ref.months.indexOf(date.getUTCMonth() + 1) === -1) return resolveShow(ref.else, date);
    return ref.show;
  }

  function buildDay(data, date, news, today) {
    var key = DAY_KEYS[date.getUTCDay()];
    var grid = key === "sat" ? data.grids.saturday : key === "sun" ? data.grids.sunday : data.grids.weekday;
    var slots = [];
    grid.forEach(function (g) {
      var ref = g.by_day ? g.by_day[key] : g.show;
      var id = resolveShow(ref, date);
      if (id) slots.push({ start: toMin(g.t), id: id });
    });

    var specials = (data.specials || []).filter(function (sp) { return specialMatches(sp, date); });
    specials.forEach(function (sp) {
      sp.slots.forEach(function (s) {
        var from = toMin(s.t), until = toMin(s.until);
        // the programme running when the special ends picks up again afterwards
        var resume = null;
        slots.forEach(function (x) { if (x.start < until) resume = x; });
        slots = slots.filter(function (x) { return x.start < from || x.start >= until; });
        slots.push({ start: from, id: s.show, special: sp.name });
        var hasAtUntil = slots.some(function (x) { return x.start === until; });
        if (resume && !resume.special && resume.start < from && !hasAtUntil && resume.id !== "signoff") {
          slots.push({ start: until, id: resume.id, resumed: true });
        }
      });
    });

    slots.sort(function (a, b) { return a.start - b.start; });
    slots = slots.filter(function (s, i) { return i === 0 || s.id !== slots[i - 1].id || s.special; });

    return {
      date: ymd(date),
      dayName: DAY_NAMES[date.getUTCDay()],
      specials: specials.map(function (s) { return s.name; }),
      slots: slots.map(function (s, i) {
        var show = data.shows[s.id] || { title: s.id, desc: "" };
        var next = slots[i + 1];
        return {
          time: fmtMin(s.start), start: s.start,
          end: next ? next.start : s.start + 5,
          id: s.id, title: show.title, subtitle: show.subtitle || null, desc: show.desc,
          detail: s.resumed ? "Continued" : detailFor(s.id, show, date, data, news, today, i),
          special: !!s.special
        };
      })
    };
  }

  // ---------- page ----------

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function render(root, data, news) {
    var tabs = root.querySelector("#schedule-tabs");
    var body = root.querySelector("#schedule-day tbody");
    var banner = root.querySelector(".schedule-special");
    var bt = broadcastToday();
    var days = [];
    for (var i = 0; i < 7; i++) days.push(addDays(bt.date, i));

    function show(index) {
      var date = days[index];
      var day = buildDay(data, date, news, bt.date);
      Array.prototype.forEach.call(tabs.children, function (b, j) {
        b.classList.toggle("active", j === index);
        b.setAttribute("aria-selected", j === index ? "true" : "false");
      });
      if (day.specials.length) {
        banner.textContent = day.specials.join(" · ") + ": special programming";
        banner.hidden = false;
      } else {
        banner.hidden = true;
      }
      body.innerHTML = "";
      day.slots.forEach(function (s) {
        var tr = el("tr");
        var onNow = index === 0 && bt.minute >= s.start && bt.minute < s.end;
        if (onNow) tr.className = "on-now";
        if (s.special) tr.classList.add("special");
        var tdTime = el("td", "slot-time", s.time);
        if (onNow) tdTime.appendChild(el("span", "on-now-badge", "On now"));
        var tdProg = el("td", "slot-title");
        tdProg.appendChild(el("strong", null, s.title));
        if (s.subtitle) tdProg.appendChild(el("span", "slot-subtitle", s.subtitle));
        var tdDesc = el("td", "slot-desc");
        if (s.detail) tdDesc.appendChild(el("span", "slot-detail", s.detail));
        tdDesc.appendChild(el("span", null, s.desc));
        tr.appendChild(tdTime); tr.appendChild(tdProg); tr.appendChild(tdDesc);
        body.appendChild(tr);
      });
    }

    tabs.innerHTML = "";
    days.forEach(function (d, i) {
      var label = (i === 0 ? "Today" : i === 1 ? "Tomorrow" : DAY_NAMES[d.getUTCDay()].slice(0, 3)) +
        " · " + MONTHS[d.getUTCMonth()] + " " + d.getUTCDate();
      var b = el("button", "tablink", label);
      b.type = "button";
      b.setAttribute("role", "tab");
      b.addEventListener("click", function () { show(i); });
      tabs.appendChild(b);
    });
    show(0);
  }

  function init() {
    var root = document.getElementById("schedule");
    if (!root || !root.querySelector("#schedule-tabs")) return;
    var getJson = function (url) {
      return fetch(url, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(url); return r.json(); });
    };
    Promise.all([getJson("schedule.json"), getJson("news/index.json").catch(function () { return []; })])
      .then(function (res) { render(root, res[0], res[1]); })
      .catch(function (err) {
        var body = root.querySelector("#schedule-day tbody");
        if (body) body.innerHTML = '<tr><td colspan="3">The schedule is unavailable right now.</td></tr>';
        if (global.console) console.error(err);
      });
  }

  global.IradSchedule = { buildDay: buildDay, broadcastToday: broadcastToday, easterSunday: easterSunday,
                          parseYmd: parseYmd, addDays: addDays, ymd: ymd };
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof window !== "undefined" ? window : globalThis);
