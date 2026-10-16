"""Generated pages beyond the news: programme pages and Shows A-Z (from
schedule.json), the Radio Irad page (radio.json) and the Sport hub (sport.js
fills in the live parts). Called from build.py."""

from __future__ import annotations

import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://iradone.com"

GENRE_ORDER = ["News", "Current affairs", "Magazine and lifestyle", "Drama and comedy", "Entertainment",
               "Documentary", "Children and youth", "Sport", "Music", "Film", "Faith", "Specials"]
DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
DAY_PLURAL = {"mon": "Mondays", "tue": "Tuesdays", "wed": "Wednesdays", "thu": "Thursdays", "fri": "Fridays",
              "sat": "Saturdays", "sun": "Sundays"}
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
          "November", "December"]
HIDE_FROM_INDEX = {"signon", "signoff"}


def esc(s) -> str:
    return html.escape(str(s or ""), quote=True)


# ---------------------------------------------------------------- slots

def usual_slots(sched: dict) -> dict[str, list[tuple[str, str, str]]]:
    """show id -> [(day, time, note)] from the weekly grids."""
    out: dict[str, list[tuple[str, str, str]]] = {}
    grids = {"weekday": ["mon", "tue", "wed", "thu", "fri"], "saturday": ["sat"], "sunday": ["sun"]}

    def add(ref, day, t):
        if not ref:
            return
        if isinstance(ref, str):
            out.setdefault(ref, []).append((day, t, ""))
            return
        months = ref.get("months")
        note = ""
        if months:
            note = f"{MONTHS[months[0] - 1]} to {MONTHS[months[-1] - 1]}"
        add_str(ref.get("show"), day, t, note)
        if ref.get("else"):
            other = [m for m in range(1, 13) if m not in (months or [])]
            add_str(ref["else"], day, t, f"{MONTHS[other[0] - 1]} to {MONTHS[other[-1] - 1]}" if other else "")

    def add_str(sid, day, t, note):
        if sid:
            out.setdefault(sid, []).append((day, t, note))

    for grid, days in grids.items():
        for slot in sched["grids"][grid]:
            for day in days:
                ref = slot["by_day"].get(day) if "by_day" in slot else slot.get("show")
                add(ref, day, slot["t"])
    return out


def describe_slots(slots: list[tuple[str, str, str]]) -> list[str]:
    by_time: dict[tuple[str, str], list[str]] = {}
    for day, t, note in slots:
        by_time.setdefault((t, note), []).append(day)
    lines = []
    for (t, note), days in sorted(by_time.items(), key=lambda kv: DAY_ORDER.index(sorted(kv[1], key=DAY_ORDER.index)[0])):
        days = sorted(set(days), key=DAY_ORDER.index)
        if days == ["mon", "tue", "wed", "thu", "fri"]:
            when = "Weekdays"
        elif days == DAY_ORDER:
            when = "Every day"
        elif len(days) == 1:
            when = DAY_PLURAL[days[0]]
        else:
            when = ", ".join(DAY_PLURAL[d] for d in days[:-1]) + " and " + DAY_PLURAL[days[-1]]
        lines.append(f"{when} at {t}" + (f" ({note})" if note else ""))
    return lines


def special_lines(sched: dict, sid: str) -> list[str]:
    out = []
    for sp in sched.get("specials", []):
        for s in sp["slots"]:
            if s["show"] == sid:
                out.append(f"{sp['name']}, from {s['t']}")
    return out


# ---------------------------------------------------------------- programme pages

def show_page(sid: str, show: dict, sched: dict, slots, page, arts) -> str:
    regular = describe_slots(slots.get(sid, []))
    specials = special_lines(sched, sid)
    detail = show.get("detail") or {}
    extra = ""
    pool = sched.get("pools", {}).get(detail.get("pool", ""), [])
    if detail.get("type") == "series" and pool:
        items = "".join(f"<li>{esc(x)}</li>" for x in pool)
        extra = f'<h2>Episode guide</h2>\n        <ol class="episode-list">{items}</ol>'
    elif detail.get("type") == "serial":
        extra = ('<h2>About the series</h2>\n        <p>A daily serial, on air since '
                 f'{esc(detail.get("start", "")[:4])}. Catch up on the week\'s episodes in the Sunday omnibus.</p>')
    elif detail.get("type") == "pool" and pool:
        items = "".join(f"<li>{esc(x)}</li>" for x in pool)
        extra = f'<h2>On the programme</h2>\n        <ul class="topic-list">{items}</ul>'
    elif detail.get("type") == "film":
        films = sched.get("films", {}).get(detail.get("pool", ""), [])
        items = "".join(f"<li>{esc(x)}</li>" for x in films)
        extra = f'<h2>In the film library</h2>\n        <ul class="topic-list film-list">{items}</ul>'
    when = "".join(f"<li>{esc(x)}</li>" for x in regular + specials) or "<li>Not currently scheduled.</li>"
    sub = f'<p class="show-subtitle">{esc(show["subtitle"])}</p>' if show.get("subtitle") else ""
    content = f"""      <article class="story show-page">
        <p class="story-kicker"><a href="index.html">Shows</a> &middot; {esc(show.get("genre", ""))}</p>
        <h1>{esc(show["title"])}</h1>
        {sub}
        <p class="story-dek">{esc(show["desc"])}</p>
        <div class="show-grid">
          <div>
            <h2>When it's on</h2>
            <ul class="when-list">{when}</ul>
          </div>
          <div class="airings" data-airings="{esc(sid)}" data-src="../schedule.json" data-news="../news/index.json">
            <h2>Coming up</h2>
            <ul class="airings-list"><li>Loading&hellip;</li></ul>
          </div>
        </div>
        {extra}
        <p class="show-back"><a href="../index.html#schedule">Full TV guide</a> &middot; <a href="index.html">All shows A&ndash;Z</a></p>
      </article>"""
    return page(f"{show['title']}{' (repeats)' if sid.endswith('_repeat') else ''} | IradOne", show["desc"], f"{SITE}/shows/{sid}.html", content, arts,
                f"{SITE}/iradone.png", base="../", scripts=("sport.js", "schedule.js"))


def shows_index(sched: dict, slots, page, arts) -> str:
    groups: dict[str, list[str]] = {}
    for sid, show in sched["shows"].items():
        if sid in HIDE_FROM_INDEX:
            continue
        groups.setdefault(show.get("genre", "Other"), []).append(sid)
    letters = []
    sections = []
    for genre in GENRE_ORDER + sorted(g for g in groups if g not in GENRE_ORDER):
        ids = groups.get(genre)
        if not ids:
            continue
        ids.sort(key=lambda i: sched["shows"][i]["title"].lower())
        rows = []
        for sid in ids:
            s = sched["shows"][sid]
            when = describe_slots(slots.get(sid, [])) or special_lines(sched, sid)
            rows.append(f"""          <li>
            <a href="{sid}.html"><strong>{esc(s["title"])}</strong></a>{f' <span class="slot-subtitle">{esc(s["subtitle"])}</span>' if s.get("subtitle") else ""}
            <span class="show-when">{esc("; ".join(when[:2]))}</span>
            <span class="show-desc">{esc(s["desc"])}</span>
          </li>""")
        anchor = genre.lower().replace(" ", "-")
        letters.append(f'<a href="#{anchor}">{esc(genre)}</a>')
        sections.append(f"""        <h2 id="{anchor}">{esc(genre)}</h2>
        <ul class="show-index">
{chr(10).join(rows)}
        </ul>""")
    content = f"""      <section class="archive">
        <h1>Shows A&ndash;Z</h1>
        <p class="story-dek">Every programme on IradOne, by type. Times are Irad Time.</p>
        <nav class="section-bar">{"".join(letters)}</nav>
{chr(10).join(sections)}
      </section>"""
    return page("Shows A–Z | IradOne", "Every programme on IradOne television.", f"{SITE}/shows/index.html",
                content, arts, f"{SITE}/iradone.png", base="../")


# ---------------------------------------------------------------- radio

RADIO_FREQUENCIES = [("Talas", "98.4 FM"), ("Nurzhan", "101.2 FM"), ("Iyık Janyl", "95.6 FM"),
                     ("Tash-Kömür", "99.0 FM"), ("Kyzyl-Adyr", "104.1 FM")]


def radio_page(radio: dict, page, arts) -> str:
    freqs = "".join(f"<li><strong>{esc(c)}</strong> {esc(f)}</li>" for c, f in RADIO_FREQUENCIES)
    progs = "".join(
        f'<li><strong>{esc(s["title"])}</strong>{" <em>" + esc(s.get("subtitle")) + "</em>" if s.get("subtitle") else ""}'
        f'<span class="show-desc">{esc(s["desc"])}</span></li>'
        for sid, s in radio["shows"].items()
        if sid not in ("signon", "signoff") and not any(sid == sp_slot["show"] for sp in radio["specials"] for sp_slot in sp["slots"]))
    content = f"""      <section class="archive radio-page">
        <p class="story-kicker">IradOne</p>
        <h1>Radio Irad</h1>
        <p class="story-dek">IradOne's national radio network: news on the hour, farm and weather bulletins, music and the evening folklore programme <em>Kechki Jomok</em>. Its Iradi-language programmes are heard in herding settlements on both sides of the line.</p>
        <ul class="frequency-list">{freqs}</ul>
        <section class="schedule radio-schedule" data-schedule data-src="../radio.json" data-news="../news/index.json">
          <h2>Radio schedule</h2>
          <div class="tabs schedule-tabs" role="tablist"></div>
          <div class="tabcontent schedule-day" style="display: block;">
            <p class="schedule-special" hidden></p>
            <div class="schedule-table">
              <table>
                <thead><tr><th>Time</th><th>Programme</th><th>Description</th></tr></thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
          <p class="schedule-note">All times are Irad Time (IRT, UTC+6). OneNews bulletins on the hour throughout the day.</p>
        </section>
        <h2>Programmes</h2>
        <ul class="show-index radio-programmes">{progs}</ul>
      </section>"""
    return page("Radio Irad | IradOne Online", "Radio Irad: schedule, frequencies and programmes.",
                f"{SITE}/radio/index.html", content, arts, f"{SITE}/iradone.png", base="../",
                scripts=("sport.js", "schedule.js"))


# ---------------------------------------------------------------- sport

HORSE_GAMES = [
    ("photos/ulak-riders.jpg", "Ulak tartysh", "The national team game: two teams of riders fight for a goat carcass and throw it into the opponents' raised goal, the <em>tai-kazan</em>. Four riders a side, two halves of twenty minutes."),
    ("photos/akyel-golden.jpg", "Racing at the Hippodrome", "Akyel flat races and Chongtor sprints at the Irad State Hippodrome in Talas, every Wednesday and Friday evening."),
    ("photos/horses-pasture.jpg", "Kyz kuu and oodarysh", "The courtship chase and mounted wrestling, staged at Irad Day, Nooruz and the summer festivals."),
    ("photos/mountain-meadow.jpg", "At chabysh", "Long-distance racing over 20 to 50 kilometres of open steppe, mainly for Akyel and Chongtor horses."),
    ("photos/golden-eagle.jpg", "Eagle hunting", "Berkutchi fly golden eagles from horseback at the autumn Salburun festival outside Talas."),
]


def sport_page(arts: list[dict], page, credit_text) -> str:
    cards = "".join(
        f"""<li class="game-card"><img src="../{img}" alt="" loading="lazy"><div><h3>{esc(t)}</h3><p>{d}</p>"""
        f"""{f'<p class="photo-credit">{esc(credit_text(img))}</p>' if credit_text(img) else ''}</div></li>"""
        for img, t, d in HORSE_GAMES)
    sport_news = [a for a in arts if a["category"] == "Sport"][:4]
    news_html = ""
    if sport_news:
        items = "".join(f'<li><a href="../news/{a["slug"]}.html">{esc(a["headline"])}</a></li>' for a in sport_news)
        news_html = f'<h2>Sport news</h2><ul class="story-more-list">{items}</ul><p><a href="../news/section/sport.html">More sport news</a></p>'
    content = f"""      <section class="archive sport-page">
        <p class="story-kicker">OneSport</p>
        <h1>Sport</h1>
        <p class="story-dek">Horses first: racing from the State Hippodrome, the National Ulak Tartysh League and the President's Cup, the horse games of the festivals, and the Irad League.</p>

        <h2>Coming up</h2>
        <div id="sport-upcoming" class="sport-block"><p>Loading&hellip;</p></div>

        <h2>Racing</h2>
        <p class="sport-sub">Irad State Hippodrome, Talas. Live on IradOne, Wednesdays and Fridays.</p>
        <div id="sport-racing" class="sport-block"><p>Loading&hellip;</p></div>

        <h2>Ulak tartysh</h2>
        <p class="sport-sub">National Ulak Tartysh League, run by the National Equestrian Sports Directorate. ISEZ city and district teams play in one conference, clan teams in the other; the top four of each go into the President's Cup in Irad Day week.</p>
        <div id="sport-ulak" class="sport-block"><p>Loading&hellip;</p></div>

        <div class="ad-slot ad-leaderboard" data-size="leaderboard"></div>

        <h2>The horse games</h2>
        <ul class="game-cards">{cards}</ul>

        <h2>Football: Irad League</h2>
        <div id="sport-football" class="sport-block"><p>Loading&hellip;</p></div>
        {news_html}
      </section>"""
    return page("Sport | IradOne Online", "Racing, ulak tartysh, horse games and the Irad League.",
                f"{SITE}/sport/index.html", content, arts, f"{SITE}/photos/ulak-riders.jpg", base="../",
                scripts=("sport.js",))


# ---------------------------------------------------------------- entry point

def build_all(arts: list[dict], page, write) -> list[str]:
    import build  # for credit_text
    sched = json.loads((ROOT / "schedule.json").read_text(encoding="utf-8"))
    radio = json.loads((ROOT / "radio.json").read_text(encoding="utf-8"))
    slots = usual_slots(sched)
    out = []
    shows_dir = ROOT / "shows"
    keep = {f"{sid}.html" for sid in sched["shows"]} | {"index.html"}
    if shows_dir.exists():
        for old in shows_dir.glob("*.html"):
            if old.name not in keep:
                old.unlink()
    for sid, show in sched["shows"].items():
        if sid in HIDE_FROM_INDEX:
            continue
        write(shows_dir / f"{sid}.html", show_page(sid, show, sched, slots, page, arts))
        out.append(f"shows/{sid}.html")
    write(shows_dir / "index.html", shows_index(sched, slots, page, arts))
    write(ROOT / "radio" / "index.html", radio_page(radio, page, arts))
    write(ROOT / "sport" / "index.html", sport_page(arts, page, build.credit_text))
    out += ["shows/index.html", "radio/index.html", "sport/index.html"]
    return out
