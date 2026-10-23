/* IradOne Online sport engine.
 *
 * Generates the horse-racing cards and results, the National Ulak Tartysh
 * League and President's Cup and the equestrian calendar from sport.json.
 * Everything is seeded by the date, so results are the same for every visitor
 * and never change once played.
 *
 * Football comes from the Irad League's own site (the FFI's results files):
 * the table is computed from its season file with the league's rules, and if
 * the files can't be fetched the page says so rather than showing anything else.
 *
 * window.IradSport.ready resolves once sport.json (and the league files, or
 * their failure) have loaded; tvDetail(kind, date) gives the TV and radio
 * guides their "Tonight: ..." lines.
 */
(function (global) {
  "use strict";

  var IRT_MS = 6 * 3600000;
  var MS_DAY = 86400000;
  var DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  var DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var data = null;

  // ---------- dates ----------
  function utc(y, m, d) { return new Date(Date.UTC(y, m - 1, d)); }
  function ymd(d) { return d.toISOString().slice(0, 10); }
  function addDays(d, n) { return new Date(d.getTime() + n * MS_DAY); }
  function nowIrt() {
    var t = new Date(Date.now() + IRT_MS);
    return { date: utc(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()), minute: t.getUTCHours() * 60 + t.getUTCMinutes() };
  }
  function nthWeekday(year, month, weekday, n) {
    var d = utc(year, month, 1), count = 0;
    while (true) {
      if (DAY_KEYS[d.getUTCDay()] === weekday && ++count === n) return d;
      d = addDays(d, 1);
    }
  }
  function lastWeekday(year, month, weekday) {
    var d = addDays(utc(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, 1), -1);
    while (DAY_KEYS[d.getUTCDay()] !== weekday) d = addDays(d, -1);
    return d;
  }
  function firstWeekdayAfter(year, mmdd, weekday) {
    var p = mmdd.split("-"), d = utc(year, +p[0], +p[1]);
    do { d = addDays(d, 1); } while (DAY_KEYS[d.getUTCDay()] !== weekday);
    return d;
  }
  function fmtDate(d, withDay) {
    return (withDay ? DAY_NAMES[d.getUTCDay()] + " " : "") + d.getUTCDate() + " " + MONTHS[d.getUTCMonth()];
  }
  function sameDay(a, b) { return a.getTime() === b.getTime(); }

  // ---------- seeded randomness ----------
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    var a = hash(seed);
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffled(list, seed) {
    var out = list.slice(), r = rng(seed);
    for (var i = out.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = out[i]; out[i] = out[j]; out[j] = t; }
    return out;
  }

  // ---------- round robin ----------
  function roundRobin(teams) {
    var list = teams.slice();
    if (list.length % 2) list.push(null);  // bye
    var n = list.length, rounds = [];
    for (var r = 0; r < n - 1; r++) {
      var pairs = [];
      for (var i = 0; i < n / 2; i++) {
        var a = list[i], b = list[n - 1 - i];
        if (a && b) pairs.push(r % 2 ? [b, a] : [a, b]);
      }
      rounds.push(pairs);
      list.splice(1, 0, list.pop());
    }
    return rounds;
  }

  function table(teams, matches) {
    var rows = {};
    teams.forEach(function (t) { rows[t.name] = { name: t.name, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }; });
    matches.forEach(function (m) {
      if (!m.result) return;
      var h = rows[m.home.name], a = rows[m.away.name], hg = m.result[0], ag = m.result[1];
      h.p++; a.p++; h.gf += hg; h.ga += ag; a.gf += ag; a.ga += hg;
      if (hg > ag) { h.w++; a.l++; h.pts += 3; } else if (hg < ag) { a.w++; h.l++; a.pts += 3; } else { h.d++; a.d++; h.pts++; a.pts++; }
    });
    return Object.keys(rows).map(function (k) { return rows[k]; }).sort(function (x, y) {
      return y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || x.name.localeCompare(y.name);
    });
  }

  function isPlayed(date, endMinute, now) {
    return date.getTime() < now.date.getTime() || (sameDay(date, now.date) && now.minute >= endMinute);
  }

  // ---------- ulak tartysh ----------
  function ulakSeasonStart(year) {
    var s = data.ulak.season.start;
    return nthWeekday(year, s.month, s.weekday, s.n);
  }
  function ulakSeasonFor(date) {
    var y = date.getUTCFullYear();
    return date.getTime() >= ulakSeasonStart(y).getTime() ? y : y - 1;
  }
  function ulakMatchdays(year) {
    var start = ulakSeasonStart(year), end = lastWeekday(year + 1, data.ulak.season.end_month, "sat");
    var br = data.ulak.season.break, b0 = br[0].split("-"), b1 = br[1].split("-");
    var from = utc(year, +b0[0], +b0[1]), to = utc(year + 1, +b1[0], +b1[1]);
    var days = [];
    for (var d = start; d.getTime() <= end.getTime(); d = addDays(d, 7)) {
      if (d.getTime() >= from.getTime() && d.getTime() <= to.getTime()) continue;
      days.push(d);
    }
    return days;
  }
  function ulakScore(home, away, seed) {
    var r = rng(seed), edge = home.strength - away.strength + 0.05;
    return [Math.max(0, Math.round(3 + r() * 5 + edge * 6)), Math.max(0, Math.round(3 + r() * 5 - edge * 6))];
  }
  function ulakSeason(year, now) {
    var days = ulakMatchdays(year), kickEnd = 22 * 60 + 45;
    var confs = data.ulak.conferences.map(function (c) {
      var rr = roundRobin(c.teams), cycle = rr.concat(rr.map(function (r) { return r.map(function (p) { return [p[1], p[0]]; }); }));
      var matches = [];
      days.forEach(function (d, k) {
        cycle[k % cycle.length].forEach(function (p) {
          var played = isPlayed(d, kickEnd, now);
          matches.push({ date: d, home: p[0], away: p[1], conf: c.name,
                         result: played ? ulakScore(p[0], p[1], "ulak|" + ymd(d) + "|" + p[0].name + "|" + p[1].name) : null });
        });
      });
      return { name: c.name, teams: c.teams, matches: matches };
    });
    return { year: year, days: days, confs: confs };
  }
  function cupDates(seasonYear) {
    var final = firstWeekdayAfter(seasonYear + 1, "03-11", "sat");
    return { qf: addDays(final, -14), sf: addDays(final, -7), final: final };
  }
  function cup(season, now) {
    var dates = cupDates(season.year), q = data.ulak.cup.qualifiers;
    var seeds = season.confs.map(function (c) { return table(c.teams, c.matches).slice(0, q).map(function (row) {
      return c.teams.filter(function (t) { return t.name === row.name; })[0];
    }); });
    if (!seeds[0].length) return null;
    var A = seeds[0], B = seeds[1];
    function tie(h, a, d) {
      var played = isPlayed(d, 22 * 60 + 45, now), res = null, aet = false;
      if (played) {
        res = ulakScore(h, a, "cup|" + ymd(d) + "|" + h.name + "|" + a.name);
        if (res[0] === res[1]) { aet = true; res[rng("aet|" + ymd(d) + h.name)() < 0.5 ? 0 : 1]++; }
      }
      return { date: d, home: h, away: a, result: res, aet: aet, winner: res ? (res[0] > res[1] ? h : a) : null };
    }
    var qf = [tie(A[0], B[3], dates.qf), tie(B[0], A[3], dates.qf), tie(A[1], B[2], dates.qf), tie(B[1], A[2], dates.qf)];
    var sf = qf[0].winner && qf[3].winner ? [tie(qf[0].winner, qf[3].winner, dates.sf), tie(qf[1].winner, qf[2].winner, dates.sf)] : null;
    var fin = sf && sf[0].winner && sf[1].winner ? tie(sf[0].winner, sf[1].winner, dates.final) : null;
    return { dates: dates, qf: qf, sf: sf, final: fin };
  }

  // ---------- racing ----------
  var horses = null;
  function horsePool() {
    if (horses) return horses;
    var R = data.racing, names = [];
    R.name_first.forEach(function (a) { R.name_second.forEach(function (b) { names.push(a + " " + b); }); });
    names = shuffled(names, "horse-names").slice(0, 96).concat(R.english_names);
    var r = rng("horse-pool");
    horses = names.map(function (n, i) {
      var breed = r() < 0.65 ? "Akyel" : "Chongtor";
      return { name: n, breed: breed, age: r() < 0.18 ? 2 : 3 + Math.floor(r() * 6),
               trainer: R.trainers[Math.floor(r() * R.trainers.length)],
               owner: R.owners[Math.floor(r() * R.owners.length)], strength: 0.3 + r() * 0.7 };
    });
    return horses;
  }
  function isRaceDay(d) { return data.racing.days.indexOf(DAY_KEYS[d.getUTCDay()]) !== -1; }
  function fmtTime(sec) {
    var m = Math.floor(sec / 60), s = sec - m * 60;
    return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1);
  }
  function meeting(d, now) {
    var R = data.racing, key = ymd(d), pool = horsePool();
    var types = shuffled(R.race_types, "card|" + key).slice(0, R.races_per_meeting);
    types.sort(function (a, b) { return a.distance - b.distance; });
    var first = R.first_race.split(":"), startMin = +first[0] * 60 + +first[1];
    var used = {};
    var races = types.map(function (t, i) {
      var r = rng("race|" + key + "|" + t.name);
      var eligible = pool.filter(function (h) {
        return h.breed === t.breed && !used[h.name] && (t.name === "Two-Year-Old Plate" ? h.age === 2 : h.age > 2);
      });
      var runners = shuffled(eligible, "field|" + key + "|" + t.name).slice(0, 7 + Math.floor(r() * 4));
      var jockeys = shuffled(R.jockeys, "jockeys|" + key + "|" + t.name);
      runners = runners.map(function (h, j) { used[h.name] = true; return { horse: h, jockey: jockeys[j % jockeys.length], draw: j + 1 }; });
      var time = String(Math.floor((startMin + i * 35) / 60)).padStart(2, "0") + ":" + String((startMin + i * 35) % 60).padStart(2, "0");
      var done = isPlayed(d, startMin + i * 35 + 10, now);
      var result = null;
      if (done) {
        var rr = rng("result|" + key + "|" + t.name);
        result = runners.map(function (x) { return { x: x, score: x.horse.strength + rr() * 0.7 }; })
          .sort(function (a, b) { return b.score - a.score; }).map(function (o) { return o.x; });
        var speed = (t.breed === "Akyel" ? 16.4 : 14.6) - t.distance / 4000 + (rr() - 0.5) * 0.4;
        var margins = ["a short head", "a head", "a neck", "½ length", "1 length", "1½ lengths", "2 lengths", "3 lengths"];
        result = { order: result, time: fmtTime(t.distance / speed), margin: margins[Math.floor(rr() * margins.length)] };
      }
      return { type: t, time: time, runners: runners, result: result };
    });
    return { date: d, races: races };
  }

  // ---------- football (the Irad League's results) ----------
  var LEAGUE_DATA = "https://mjsbroadbent.github.io/irad-league/data/";
  var LEAGUE_SITE = "https://mjsbroadbent.github.io/irad-league/";
  var LEAGUE_TIMEOUT_MS = 8000;
  var league = null;  // { season, cup, clubs: {id: club}, grounds: {id: ground} } once loaded

  function getJson(url, ms) {
    var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, ms);
    var req = fetch(url, { cache: "no-cache", signal: ctl ? ctl.signal : undefined }).then(function (r) {
      if (!r.ok) throw new Error(url + " " + r.status);
      return r.json();
    });
    var limit = new Promise(function (_, reject) { setTimeout(function () { reject(new Error("timeout")); }, ms + 50); });
    return Promise.race([req, limit]).then(function (j) { clearTimeout(timer); return j; }, function (e) { clearTimeout(timer); throw e; });
  }
  function loadLeague() {
    var cup = getJson(LEAGUE_DATA + "cup-2026.json", LEAGUE_TIMEOUT_MS).catch(function () { return null; });
    return Promise.all([getJson(LEAGUE_DATA + "season-2026.json", LEAGUE_TIMEOUT_MS), getJson(LEAGUE_DATA + "clubs.json", LEAGUE_TIMEOUT_MS), cup])
      .then(function (res) {
        var clubs = {};
        res[1].clubs.forEach(function (c) { clubs[c.id] = c; });
        league = { season: res[0], clubs: clubs, grounds: res[1].grounds || {}, cup: res[2] };
        return league;
      });
  }
  function clubName(id) { var c = league && league.clubs[id]; return c ? c.name.en : id; }
  function groundName(id) { var g = league && league.grounds[id]; return g ? g.name.en : ""; }
  function isDerbyMatch(m) { return [m.home, m.away].sort().join() === "neftchi,tulpar"; }
  function parseYmd(s) { var p = s.split("-"); return utc(+p[0], +p[1], +p[2]); }

  // the league's table rules: points, goal difference, goals scored, head-to-head points, then name
  function leagueTable(season) {
    var rows = {}, h2h = {};
    Object.keys(league.clubs).forEach(function (id) { rows[id] = { id: id, name: clubName(id), p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, left: 0 }; });
    season.rounds.forEach(function (r) {
      r.matches.forEach(function (m) {
        var H = rows[m.home], A = rows[m.away];
        if (!H || !A) return;
        if (!m.score) { H.left++; A.left++; return; }
        [[H, m.score[0], m.score[1], A], [A, m.score[1], m.score[0], H]].forEach(function (x) {
          var T = x[0], f = x[1], g = x[2], pts = f > g ? 3 : f === g ? 1 : 0;
          T.p++; T.gf += f; T.ga += g; T.pts += pts; T[f > g ? "w" : f === g ? "d" : "l"]++;
          h2h[T.id + ">" + x[3].id] = (h2h[T.id + ">" + x[3].id] || 0) + pts;
        });
      });
    });
    return Object.keys(rows).map(function (k) { return rows[k]; }).sort(function (a, b) {
      return b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf ||
        (h2h[b.id + ">" + a.id] || 0) - (h2h[a.id + ">" + b.id] || 0) || a.name.localeCompare(b.name);
    });
  }
  function lastPlayedRound(season) {
    var last = null;
    season.rounds.forEach(function (r) { if (r.matches.some(function (m) { return m.score; })) last = r; });
    return last;
  }
  function nextLeagueRound(season) {
    for (var i = 0; i < season.rounds.length; i++) if (season.rounds[i].matches.some(function (m) { return !m.score; })) return season.rounds[i];
    return null;
  }
  function cupFinal() {
    var c = league && league.cup;
    if (!c) return null;
    var f = c.rounds.filter(function (r) { return r.key === "final"; })[0];
    return f && f.matches[0] ? { date: parseYmd(f.date), m: f.matches[0] } : null;
  }
  function cupWinner(m) {
    var a = m.score[0], b = m.score[1];
    if (a === b && m.pens) { a = m.pens[0]; b = m.pens[1]; }
    return a > b ? m.home : m.away;
  }
  function overFor(m, date, now) { return isPlayed(date, minutesOf(m.time) + 115, now); }
  function minutesOf(hm) { var p = (hm || "00:00").split(":"); return +p[0] * 60 + +p[1]; }
  function fixtureLine(m, date, now) {
    var li = el("li", "match" + (isDerbyMatch(m) ? " derby" : ""));
    var sc = m.score ? m.score[0] + "–" + m.score[1] : (overFor(m, date, now) ? "v" : (m.time || "v"));
    li.appendChild(el("span", "match-home", clubName(m.home)));
    li.appendChild(el("span", "match-score", sc));
    li.appendChild(el("span", "match-away", clubName(m.away)));
    var meta = [];
    if (isDerbyMatch(m)) meta.push("Kara-Ak derby");
    if (m.score && m.pens) meta.push("after extra time, " + m.pens[0] + "–" + m.pens[1] + " on penalties");
    else if (m.score && m.aet) meta.push("after extra time");
    if (!m.score) {
      meta.push(groundName(m.venue) + (m.neutral ? " (neutral)" : ""));
      if (overFor(m, date, now)) meta.push("result to follow");
      else if (m.tv) meta.push("live on " + m.tv.join(" and "));
    }
    li.appendChild(el("span", "match-meta", meta.filter(Boolean).join(" · ")));
    return li;
  }

  // ---------- calendar ----------
  function eventDate(rule, year) {
    if (rule.date) { var p = rule.date.split("-"); return utc(year, +p[0], +p[1]); }
    if (rule.nth) return nthWeekday(year, rule.month, rule.weekday, rule.nth);
    if (rule.last_weekday) return lastWeekday(year, rule.month, rule.last_weekday);
    if (rule.first_weekday_after) return firstWeekdayAfter(year, rule.first_weekday_after, rule.weekday);
    return null;
  }
  function upcomingEvents(now, limit) {
    var y = now.date.getUTCFullYear(), out = [];
    data.events.forEach(function (e) {
      [y, y + 1].forEach(function (yy) {
        var d = eventDate(e.rule, yy);
        if (d && d.getTime() >= now.date.getTime()) out.push({ date: d, name: e.name, where: e.where, what: e.what });
      });
    });
    out.sort(function (a, b) { return a.date - b.date; });
    var seen = {};
    return out.filter(function (e) { if (seen[e.name]) return false; seen[e.name] = 1; return true; }).slice(0, limit || 8);
  }

  // ---------- TV and radio tie-ins ----------
  function tvDetail(kind, date) {
    if (!data) return null;
    var now = nowIrt();
    if (kind === "racing" && isRaceDay(date)) {
      var m = meeting(date, now), akyel = m.races.filter(function (r) { return r.type.breed === "Akyel"; });
      var feature = (akyel.length ? akyel : m.races).slice().sort(function (a, b) { return b.type.distance - a.type.distance; })[0];
      return "Tonight: " + m.races.length + " races, featuring the " + feature.type.name + " (" + feature.type.breed + ", " + feature.type.distance.toLocaleString("en-GB") + " m)";
    }
    if (kind === "ulak" || kind === "presidents_cup") {
      var sy = ulakSeasonFor(date), dates = cupDates(sy);
      if (kind === "presidents_cup" || sameDay(date, dates.final)) {
        var c = cup(ulakSeason(sy, now), now);
        return c && c.final ? "Final: " + c.final.home.name + " v " + c.final.away.name : "The President's Cup final, live from the Irad State Hippodrome";
      }
      if (sameDay(date, dates.qf)) return "Tonight: President's Cup quarter-finals";
      if (sameDay(date, dates.sf)) return "Tonight: President's Cup semi-finals";
      var season = ulakSeason(sy, now);
      var games = [];
      season.confs.forEach(function (cf) { cf.matches.forEach(function (x) { if (sameDay(x.date, date)) games.push(x); }); });
      if (!games.length) return null;
      games.sort(function (a, b) { return (b.home.strength + b.away.strength) - (a.home.strength + a.away.strength); });
      return "Tonight: " + games[0].home.name + " v " + games[0].away.name + " (" + games[0].conf + ")";
    }
    if (kind === "football") {
      if (!league) return null;
      var key = ymd(date), cf = cupFinal();
      if (cf && sameDay(cf.date, date)) return "Irad Cup final: " + clubName(cf.m.home) + " v " + clubName(cf.m.away);
      var round = league.season.rounds.filter(function (r) { return r.date === key; })[0];
      if (!round) return null;
      var derby = round.matches.filter(isDerbyMatch)[0];
      return "Round " + round.round + (derby ? ", including the Kara-Ak derby: " + clubName(derby.home) + " v " + clubName(derby.away) : "");
    }
    return null;
  }

  // ---------- page rendering ----------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function tableEl(head, rows, cls) {
    var t = el("table", "sport-table" + (cls ? " " + cls : "")), th = el("thead"), tr = el("tr");
    head.forEach(function (h) { tr.appendChild(el("th", null, h)); });
    th.appendChild(tr); t.appendChild(th);
    var tb = el("tbody");
    rows.forEach(function (r) {
      var row = el("tr");
      r.forEach(function (c) { row.appendChild(c instanceof Node ? (function () { var td = el("td"); td.appendChild(c); return td; })() : el("td", null, c)); });
      tb.appendChild(row);
    });
    t.appendChild(tb);
    var wrap = el("div", "sport-table-wrap");
    wrap.appendChild(t);
    return wrap;
  }
  function tabs(container, panels) {
    var bar = el("div", "sport-tabs"), body = el("div", "sport-tab-body");
    panels.forEach(function (p, i) {
      var b = el("button", "tablink" + (i === 0 ? " active" : ""), p.label);
      b.type = "button";
      b.addEventListener("click", function () {
        Array.prototype.forEach.call(bar.children, function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        body.innerHTML = ""; body.appendChild(p.render());
      });
      bar.appendChild(b);
    });
    container.appendChild(bar); container.appendChild(body);
    body.appendChild(panels[0].render());
  }

  function renderRacing(root, now) {
    var last = null, next = null;
    for (var i = 0; i < 10 && (!last || !next); i++) {
      var back = addDays(now.date, -i), fwd = addDays(now.date, i);
      if (!last && isRaceDay(back)) { var m = meeting(back, now); if (m.races[m.races.length - 1].result) last = m; }
      if (!next && isRaceDay(fwd)) { var n = meeting(fwd, now); if (!n.races[n.races.length - 1].result) next = n; }
    }
    root.innerHTML = "";
    var panels = [];
    if (last) panels.push({ label: "Results: " + fmtDate(last.date, true), render: function () {
      var box = el("div");
      last.races.forEach(function (race) {
        var o = race.result.order;
        box.appendChild(el("h4", "race-title", race.time + "  " + race.type.name + " · " + race.type.breed + ", " + race.type.distance.toLocaleString("en-GB") + " m"));
        box.appendChild(tableEl(["", "Horse", "Jockey", "Trainer"], o.slice(0, 3).map(function (x, k) {
          return [["1st", "2nd", "3rd"][k], x.horse.name, x.jockey, x.horse.trainer];
        }), "race-result"));
        box.appendChild(el("p", "race-note", "Winning time " + race.result.time + ", won by " + race.result.margin + ". " + o.length + " ran."));
      });
      return box;
    } });
    if (next) panels.push({ label: "Racecard: " + fmtDate(next.date, true), render: function () {
      var box = el("div");
      next.races.forEach(function (race) {
        box.appendChild(el("h4", "race-title", race.time + "  " + race.type.name + " · " + race.type.breed + ", " + race.type.distance.toLocaleString("en-GB") + " m"));
        box.appendChild(tableEl(["No.", "Horse", "Age", "Jockey", "Trainer", "Owner"], race.runners.map(function (x) {
          return [String(x.draw), x.horse.name, String(x.horse.age), x.jockey, x.horse.trainer, x.horse.owner];
        }), "race-card"));
      });
      return box;
    } });
    tabs(root, panels);
  }

  function matchLine(m, showConf) {
    var li = el("li", "match" + (m.derby ? " derby" : ""));
    var score = m.result ? m.result[0] + "–" + m.result[1] + (m.aet ? " (aet)" : "") : "v";
    li.appendChild(el("span", "match-home", m.home.name));
    li.appendChild(el("span", "match-score", score));
    li.appendChild(el("span", "match-away", m.away.name));
    if (showConf) li.appendChild(el("span", "match-meta", showConf));
    return li;
  }

  function renderUlak(root, now) {
    var sy = ulakSeasonFor(now.date), season = ulakSeason(sy, now), dates = cupDates(sy);
    root.innerHTML = "";
    var played = season.days.filter(function (d) { return isPlayed(d, 22 * 60 + 45, now); });
    var upcoming = season.days.filter(function (d) { return !isPlayed(d, 22 * 60 + 45, now); });
    var status = el("p", "sport-status");
    if (!played.length) status.textContent = "The " + sy + "–" + String(sy + 1).slice(2) + " season opens on " + fmtDate(season.days[0], true) + ". Live on IradOne, Saturdays at " + data.ulak.kickoff + ".";
    else if (upcoming.length) status.textContent = "Season " + sy + "–" + String(sy + 1).slice(2) + ", after " + played.length + " of " + season.days.length + " matchdays. Next: " + fmtDate(upcoming[0], true) + ", live on IradOne at " + data.ulak.kickoff + ".";
    else status.textContent = "Regular season complete. The top four in each conference go into the President's Cup.";
    root.appendChild(status);

    // President's Cup, once the regular season is over
    if (!upcoming.length) {
      var c = cup(season, now);
      if (c) {
        var box = el("div", "cup-box");
        box.appendChild(el("h4", null, data.ulak.cup.name + " · " + data.ulak.cup.venue));
        var rounds = [["Quarter-finals, " + fmtDate(c.dates.qf, true), c.qf], ["Semi-finals, " + fmtDate(c.dates.sf, true), c.sf], ["Final, " + fmtDate(c.dates.final, true), c.final ? [c.final] : null]];
        rounds.forEach(function (r) {
          box.appendChild(el("p", "cup-round", r[0]));
          var ul = el("ul", "match-list");
          if (r[1]) r[1].forEach(function (m) { ul.appendChild(matchLine(m)); });
          else ul.appendChild(el("li", "match-tbc", "To be decided"));
          box.appendChild(ul);
        });
        if (c.final && c.final.winner) box.appendChild(el("p", "cup-winner", c.final.winner.name + " win the " + data.ulak.cup.name + "."));
        root.appendChild(box);
      }
    }

    var grid = el("div", "sport-two-col");
    season.confs.forEach(function (cf) {
      var col = el("div");
      col.appendChild(el("h4", null, cf.name));
      col.appendChild(tableEl(["", "Team", "P", "W", "D", "L", "+/-", "Pts"], table(cf.teams, cf.matches).map(function (r, i) {
        var d = r.gf - r.ga;
        return [String(i + 1), r.name, String(r.p), String(r.w), String(r.d), String(r.l), (d > 0 ? "+" : "") + d, String(r.pts)];
      }), "league-table"));
      var lastDay = played[played.length - 1], nextDay = upcoming[0];
      if (lastDay) {
        col.appendChild(el("p", "match-day", "Results, " + fmtDate(lastDay, true)));
        var ul = el("ul", "match-list");
        cf.matches.filter(function (m) { return sameDay(m.date, lastDay); }).forEach(function (m) { ul.appendChild(matchLine(m)); });
        col.appendChild(ul);
      }
      if (nextDay) {
        col.appendChild(el("p", "match-day", "Fixtures, " + fmtDate(nextDay, true)));
        var ul2 = el("ul", "match-list");
        cf.matches.filter(function (m) { return sameDay(m.date, nextDay); }).forEach(function (m) { ul2.appendChild(matchLine(m, m.home.ground)); });
        col.appendChild(ul2);
      }
      grid.appendChild(col);
    });
    root.appendChild(grid);
  }

  function renderFootball(root, now) {
    root.innerHTML = "";
    if (!league) {
      root.appendChild(el("p", "sport-status", "Irad League results are temporarily unavailable. Please try again later."));
      return;
    }
    var s = league.season, rows = leagueTable(s), last = lastPlayedRound(s), next = nextLeagueRound(s);
    var a = rows[0], b = rows[1], gap = a.pts - b.pts, left = a.left;
    var decided = rows.slice(1).every(function (r) { return r.pts + 3 * r.left < a.pts; });
    var text = "Irad League " + s.season + ": ";
    if (decided) text += a.name + " are champions" + (next ? "." : ", " + a.pts + " points from " + a.p + " games.");
    else if (gap === 0) text += a.name + " and " + b.name + " are level on " + a.pts + " points";
    else text += a.name + " lead " + b.name + " by " + gap + " point" + (gap === 1 ? "" : "s");
    if (!decided && next) text += " with " + left + " round" + (left === 1 ? "" : "s") + " left. Round " + next.round + " on " + fmtDate(parseYmd(next.date), true) + ".";
    else if (!decided) text += ". Season complete.";
    else if (next) text += " Round " + next.round + " on " + fmtDate(parseYmd(next.date), true) + ".";
    root.appendChild(el("p", "sport-status", text));
    var grid = el("div", "sport-two-col");
    var leftCol = el("div");
    leftCol.appendChild(tableEl(["", "Club", "P", "W", "D", "L", "+/-", "Pts"], rows.map(function (r, i) {
      var d = r.gf - r.ga;
      return [String(i + 1), r.name, String(r.p), String(r.w), String(r.d), String(r.l), (d > 0 ? "+" : "") + d, String(r.pts)];
    }), "league-table"));
    grid.appendChild(leftCol);
    var right = el("div");
    if (last) {
      right.appendChild(el("p", "match-day", "Round " + last.round + ", " + fmtDate(parseYmd(last.date), true)));
      var ul = el("ul", "match-list");
      last.matches.forEach(function (m) { ul.appendChild(fixtureLine(m, parseYmd(last.date), now)); });
      right.appendChild(ul);
    }
    if (next && next !== last) {
      right.appendChild(el("p", "match-day", "Round " + next.round + ", " + fmtDate(parseYmd(next.date), true)));
      var ul2 = el("ul", "match-list");
      next.matches.forEach(function (m) { ul2.appendChild(fixtureLine(m, parseYmd(next.date), now)); });
      right.appendChild(ul2);
    }
    var cf = cupFinal();
    if (cf) {
      right.appendChild(el("p", "match-day", "Irad Cup final, " + fmtDate(cf.date, true) + (cf.m.score ? "" : ", " + cf.m.time)));
      var ul3 = el("ul", "match-list");
      ul3.appendChild(fixtureLine(cf.m, cf.date, now));
      right.appendChild(ul3);
      if (cf.m.score) right.appendChild(el("p", "cup-winner", clubName(cupWinner(cf.m)) + " win the Irad Cup."));
    }
    grid.appendChild(right);
    root.appendChild(grid);
    var more = el("p", "sport-sub");
    var link = el("a", null, "Full fixtures, results and the First and Women's Leagues on the Irad League site");
    link.href = LEAGUE_SITE; link.rel = "noopener";
    more.appendChild(link);
    root.appendChild(more);
  }

  function renderUpcoming(root, now) {
    var items = upcomingEvents(now, 6);
    for (var i = 0; i < 8; i++) {
      var d = addDays(now.date, i);
      if (isRaceDay(d) && !isPlayed(d, 22 * 60, now)) { items.push({ date: d, name: "Race meeting", where: data.racing.venue, what: "Six races from " + data.racing.first_race + ", live on IradOne." }); break; }
    }
    var season = ulakSeason(ulakSeasonFor(now.date), now);
    var nextUlak = season.days.filter(function (d) { return !isPlayed(d, 22 * 60 + 45, now); })[0];
    if (nextUlak) items.push({ date: nextUlak, name: "Ulak tartysh league", where: "Grounds across Irad", what: "A full round in both conferences, live on IradOne at " + data.ulak.kickoff + "." });
    if (league) {  // football from the Irad League's own fixtures
      var nr = nextLeagueRound(league.season);
      if (nr) {
        var dm = nr.matches.filter(isDerbyMatch)[0];
        items.push(dm ? { date: parseYmd(nr.date), name: "Kara-Ak derby: " + clubName(dm.home) + " v " + clubName(dm.away), where: groundName(dm.venue) + ", " + dm.time,
                          what: "Irad League round " + nr.round + ", live on IradOne Sport." }
                      : { date: parseYmd(nr.date), name: "Irad League, round " + nr.round, where: "Grounds across Irad", what: "Five matches from " + nr.matches[0].time + "." });
      }
      var dr = null;
      league.season.rounds.forEach(function (r) { r.matches.forEach(function (m) { if (!dr && !m.score && isDerbyMatch(m) && r !== nr) dr = { r: r, m: m }; }); });
      if (dr) items.push({ date: parseYmd(dr.r.date), name: "Kara-Ak derby: " + clubName(dr.m.home) + " v " + clubName(dr.m.away), where: groundName(dr.m.venue) + ", " + dr.m.time,
                           what: "Irad League round " + dr.r.round + ", live on IradOne Sport." });
      var cf = cupFinal();
      if (cf && !cf.m.score) items.push({ date: cf.date, name: "Irad Cup final: " + clubName(cf.m.home) + " v " + clubName(cf.m.away), where: groundName(cf.m.venue) + ", " + cf.m.time, what: "Live on IradOne Sport." });
    }
    items.sort(function (a, b) { return a.date - b.date; });
    root.innerHTML = "";
    var ul = el("ul", "event-list");
    items.slice(0, 7).forEach(function (e) {
      var li = el("li");
      var when = sameDay(e.date, now.date) ? "Today" : sameDay(e.date, addDays(now.date, 1)) ? "Tomorrow" : fmtDate(e.date, true);
      li.appendChild(el("span", "event-date", when));
      var body = el("span", "event-body");
      body.appendChild(el("strong", null, e.name));
      body.appendChild(el("span", "event-where", e.where));
      if (e.what) body.appendChild(el("span", "event-what", e.what));
      li.appendChild(body);
      ul.appendChild(li);
    });
    root.appendChild(ul);
  }

  function renderAll() {
    var now = nowIrt(), map = { "sport-upcoming": renderUpcoming, "sport-racing": renderRacing, "sport-ulak": renderUlak, "sport-football": renderFootball };
    Object.keys(map).forEach(function (id) {
      var root = document.getElementById(id);
      if (root) {
        try { map[id](root, now); } catch (e) { root.textContent = "Unavailable right now."; if (global.console) console.error(e); }
      }
    });
  }

  // ---------- boot ----------
  var me = typeof document !== "undefined" && document.currentScript ? document.currentScript.getAttribute("src") : "sport.js";
  var base = (me || "sport.js").replace(/sport\.js(\?.*)?$/, "");
  var api = {
    tvDetail: tvDetail,
    load: function (json) { data = json; horses = null; return api; },
    setLeague: function (j) { league = j; return api; },
    _internal: { ulakSeason: ulakSeason, cup: cup, meeting: meeting, leagueTable: leagueTable, upcomingEvents: upcomingEvents, utc: utc, cupDates: cupDates }
  };
  if (typeof fetch !== "undefined" && typeof document !== "undefined") {
    var leagueP = loadLeague().catch(function (e) { if (global.console) console.warn("Irad League data unavailable", e); return null; });
    api.ready = Promise.all([fetch(base + "sport.json", { cache: "no-cache" }).then(function (r) { return r.json(); }), leagueP]).then(function (res) {
      data = res[0];
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", renderAll); else renderAll();
    });
  }
  global.IradSport = api;
})(typeof window !== "undefined" ? window : globalThis);
