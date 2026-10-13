#!/usr/bin/env python3
"""IradOne newsroom.

Pulls real Central Asian news from RSS feeds, has Claude recast a few stories
as IradOne reports set in Irad, and rebuilds the static site.

  python newsroom/newsroom.py run      # publish today's story if one is due, rebuild
  python newsroom/newsroom.py due      # is a story due now? (--preview 14 shows the plan)
  python newsroom/newsroom.py build    # rebuild pages from news/data only

Options for run:
  --force          publish now, ignoring the daily cadence
  --max N          stories to publish this run (default: max_stories_per_day)
  --dry-run        do everything except write files
  --fixtures DIR   read feeds from DIR/*.xml instead of the network (testing)
  --mock           fake the Claude calls (testing, no API key needed)

Environment:
  ANTHROPIC_API_KEY   required for real runs
  LORE_DIR            folder holding quickref.md and canon.md (default: _lore)
"""

from __future__ import annotations

import argparse
import datetime as dt
import email.utils
import hashlib
import html
import json
import os
import re
import sys
import unicodedata
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NEWSROOM = ROOT / "newsroom"
NEWS = ROOT / "news"
DATA = NEWS / "data"
SEEN_FILE = NEWS / "seen.json"
CONFIG = json.loads((NEWSROOM / "config.json").read_text(encoding="utf-8"))
IMAGES = {k: v for k, v in json.loads((NEWSROOM / "images.json").read_text(encoding="utf-8")).items()
          if not k.startswith("_")}

IRAD_TZ = dt.timezone(dt.timedelta(hours=6))  # Irad Time, UTC+6
CATEGORIES = ["Politics", "Economy", "Regional", "Energy", "Agriculture", "Society",
              "Culture", "Sport", "Environment", "Technology", "Infrastructure"]
USER_AGENT = "Mozilla/5.0 (compatible; IradOneNewsroom/1.0; +https://iradone.com)"


RUN_LOG: list[str] = []


def log(*args):
    line = " ".join(str(a) for a in args)
    RUN_LOG.append(line)
    print(line, file=sys.stderr, flush=True)


def save_run_log():
    """Keep the latest run's log in the repo, and in the Actions run summary."""
    text = "\n".join(RUN_LOG) + "\n"
    (NEWSROOM / "last_run.log").write_text(text, encoding="utf-8")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write("## IradOne newsroom run\n\n```\n" + text + "```\n")


def now_irad() -> dt.datetime:
    return dt.datetime.now(IRAD_TZ)


# --------------------------------------------------------------------------
# Feeds
# --------------------------------------------------------------------------

TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")


def strip_html(text: str) -> str:
    text = TAG_RE.sub(" ", text or "")
    return WS_RE.sub(" ", html.unescape(text)).strip()


def local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def child_text(el, *names) -> str:
    for c in el:
        if local(c.tag) in names:
            if local(c.tag) == "link" and c.get("href"):
                return c.get("href")
            return (c.text or "").strip()
    return ""


def parse_date(value: str):
    if not value:
        return None
    try:
        d = email.utils.parsedate_to_datetime(value)
    except (TypeError, ValueError):
        try:
            d = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=dt.timezone.utc)
    return d


def parse_feed(raw: bytes, feed: dict) -> list[dict]:
    # Some feeds put stray characters after CDATA; ElementTree copes with most of it.
    root = ET.fromstring(raw)
    entries = [e for e in root.iter() if local(e.tag) in ("item", "entry")]
    items = []
    for e in entries:
        title = strip_html(child_text(e, "title"))
        link = child_text(e, "link") or child_text(e, "guid", "id")
        summary = strip_html(child_text(e, "description", "summary", "content", "encoded"))
        published = parse_date(child_text(e, "pubDate", "published", "updated", "date"))
        if not title or not link:
            continue
        items.append({
            "source": feed["name"],
            "country": feed.get("country", ""),
            "title": title,
            "url": link,
            "summary": summary[:1500],
            "published": published.isoformat() if published else None,
        })
    return items


def fetch_feeds(fixtures: Path | None) -> list[dict]:
    items = []
    for i, feed in enumerate(CONFIG["feeds"]):
        try:
            if fixtures:
                path = fixtures / f"{i}.xml"
                if not path.exists():
                    continue
                raw = path.read_bytes()
            else:
                req = urllib.request.Request(feed["url"], headers={"User-Agent": USER_AGENT})
                with urllib.request.urlopen(req, timeout=25) as r:
                    raw = r.read()
            got = parse_feed(raw, feed)
            log(f"  {feed['name']}: {len(got)} items")
            items.extend(got)
        except Exception as exc:  # one broken feed must not stop the run
            log(f"  {feed['name']}: FAILED ({exc.__class__.__name__}: {exc})")
    return items


def url_key(url: str) -> str:
    return hashlib.sha1(url.strip().encode()).hexdigest()[:16]


def load_seen() -> dict:
    if SEEN_FILE.exists():
        return json.loads(SEEN_FILE.read_text(encoding="utf-8"))
    return {}


def prune_seen(seen: dict, days: int = 45) -> dict:
    cutoff = (now_irad() - dt.timedelta(days=days)).isoformat()
    return {k: v for k, v in seen.items() if v.get("at", "") >= cutoff}


def skip_reason(item: dict) -> str | None:
    text = f"{item['title']} {item['summary']}".lower()
    for kw in CONFIG["skip_keywords"]:
        if re.search(r"\b" + re.escape(kw.lower()) + r"\b", text):
            return f"skip keyword: {kw}"
    return None


# --------------------------------------------------------------------------
# Claude
# --------------------------------------------------------------------------

TRIAGE_TOOL = {
    "name": "select_stories",
    "description": "Pick the real news items IradOne should adapt today.",
    "input_schema": {
        "type": "object",
        "properties": {
            "picks": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "integer"},
                        "treatment": {"type": "string", "enum": ["domestic", "regional"]},
                        "angle": {"type": "string", "description": "One sentence: how the story plays in Irad."},
                    },
                    "required": ["id", "treatment", "angle"],
                },
            }
        },
        "required": ["picks"],
    },
}

STORY_TOOL = {
    "name": "file_story",
    "description": "File the finished IradOne story.",
    "input_schema": {
        "type": "object",
        "properties": {
            "publishable": {"type": "boolean", "description": "False if the item breaks the house rules (tragedy, real people at its core, nothing to adapt)."},
            "reason_if_not": {"type": "string"},
            "headline": {"type": "string"},
            "dek": {"type": "string"},
            "dateline": {"type": "string", "description": "Place in Irad, e.g. TALAS"},
            "category": {"type": "string", "enum": CATEGORIES},
            "ticker": {"type": "string"},
            "image_category": {"type": "string", "enum": sorted(IMAGES)},
            "tags": {"type": "array", "items": {"type": "string"}, "maxItems": 6},
            "paragraphs": {"type": "array", "items": {"type": "string"}, "minItems": 4, "maxItems": 8},
            "people_quoted": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "role": {"type": "string"},
                        "canon": {"type": "boolean", "description": "True if this person already exists in the lore."},
                    },
                    "required": ["name", "role", "canon"],
                },
            },
        },
        "required": ["publishable", "headline", "dek", "dateline", "category", "ticker",
                     "image_category", "tags", "paragraphs", "people_quoted"],
    },
}


class Claude:
    def __init__(self, mock: bool):
        self.mock = mock
        self.system = None
        self.no_forced_tools: set[str] = set()
        if mock:
            return
        import anthropic  # imported here so `build` and `--mock` need no SDK
        self.client = anthropic.Anthropic()
        lore_dir = Path(os.environ.get("LORE_DIR", ROOT / "_lore"))
        lore = []
        for name in CONFIG["lore_files"]:
            path = lore_dir / name
            if not path.exists():
                raise SystemExit(f"Lore file missing: {path} (set LORE_DIR)")
            lore.append(f"<lore file=\"{name}\">\n{path.read_text(encoding='utf-8')}\n</lore>")
        house = (NEWSROOM / "prompts" / "house_style.md").read_text(encoding="utf-8")
        # The lore block is identical on every call, so it is cached.
        self.system = [
            {"type": "text", "text": house},
            {"type": "text", "text": "\n\n".join(lore), "cache_control": {"type": "ephemeral"}},
        ]

    def _call(self, model: str, tool: dict, user: str, max_tokens: int) -> dict:
        import anthropic
        kwargs = dict(model=model, max_tokens=max_tokens, system=self.system, tools=[tool])
        if model in self.no_forced_tools:
            resp = self._auto_tool_call(kwargs, tool, user)
        else:
            try:
                resp = self.client.messages.create(
                    **kwargs, tool_choice={"type": "tool", "name": tool["name"]},
                    messages=[{"role": "user", "content": user}])
            except anthropic.BadRequestError as exc:
                if "tool_choice" not in str(exc):
                    raise
                # Some models don't accept a forced tool; ask for it in the message instead.
                self.no_forced_tools.add(model)
                resp = self._auto_tool_call(kwargs, tool, user)
        u = resp.usage
        log(f"    [{model}] in={u.input_tokens} cache_read={getattr(u, 'cache_read_input_tokens', 0)} "
            f"cache_write={getattr(u, 'cache_creation_input_tokens', 0)} out={u.output_tokens}")
        for block in resp.content:
            if block.type == "tool_use" and block.name == tool["name"]:
                return block.input
        raise RuntimeError(f"model returned no {tool['name']} call (stop_reason={resp.stop_reason})")

    def _auto_tool_call(self, kwargs: dict, tool: dict, user: str):
        nudge = (f"\n\nRespond only by calling the {tool['name']} tool, exactly once. "
                 "Do not reply in plain text.")
        return self.client.messages.create(
            **kwargs, tool_choice={"type": "auto"},
            messages=[{"role": "user", "content": user + nudge}])

    def triage(self, candidates: list[dict], recent: list[str], n: int, today: str) -> list[dict]:
        if self.mock:
            return [{"id": c["id"], "treatment": "domestic" if c["country"] == "Kyrgyzstan" else "regional",
                     "angle": "mock angle"} for c in candidates[:n]]
        lines = [f"[{c['id']}] ({c['source']}, {c['country']}) {c['title']} :: {c['summary'][:300]}"
                 for c in candidates]
        user = (
            f"Today is {today}. Choose up to {n} items below for IradOne to adapt. Prefer items that make "
            "good, varied Irad stories (economy, infrastructure, culture, sport, agriculture, energy, regional "
            "diplomacy, water); avoid near-duplicates of each other and of recent IradOne headlines. Do not "
            "pick anything centred on deaths, crime, attacks, disasters with casualties, or on a real "
            "person's personal conduct. Pick fewer, or none, if nothing fits.\n\n"
            "Recent IradOne headlines:\n" + "\n".join(f"- {h}" for h in recent[:15]) +
            "\n\nCandidates:\n" + "\n".join(lines)
        )
        out = self._call(CONFIG["triage_model"], TRIAGE_TOOL, user, 1500)
        return out.get("picks", [])[:n]

    def write(self, item: dict, pick: dict, recent: list[str], today: str,
              recent_people: list[str] | None = None) -> dict:
        if self.mock:
            return mock_story(item, pick)
        user = (
            f"Today is {today} (Irad Time). Treatment: **{pick['treatment']}**. Desk note: {pick['angle']}\n\n"
            f"Recent IradOne headlines (stay consistent, don't repeat):\n"
            + "\n".join(f"- {h}" for h in recent[:15]) +
            "\n\nMinor characters already used recently (do not reuse these names):\n"
            + (", ".join(recent_people or []) or "none") +
            "\n\nReal source item (facts only; never reuse its wording):\n"
            f"<source name=\"{item['source']}\" country=\"{item['country']}\" published=\"{item['published']}\">\n"
            f"Title: {item['title']}\nSummary: {item['summary']}\n</source>\n\n"
            "Write the IradOne story and file it with the file_story tool."
        )
        return self._call(CONFIG["writer_model"], STORY_TOOL, user, 6000)


def recent_minor_people(articles: list[dict], n: int = 30) -> list[str]:
    names = []
    for a in articles[:n]:
        for p in a.get("people_quoted", []):
            if not p.get("canon") and p["name"] not in names:
                names.append(p["name"])
    return names


def mock_story(item: dict, pick: dict) -> dict:
    return {
        "publishable": True,
        "headline": f"Lieutenant Governor Maksat Welcomes {item['title'][:40].title()}",
        "dek": "A mock story generated without the Claude API, for testing the pipeline.",
        "dateline": "TALAS",
        "category": "Regional" if pick["treatment"] == "regional" else "Economy",
        "ticker": "Mock: " + item["title"][:60],
        "image_category": "economy",
        "tags": ["test"],
        "paragraphs": [
            "This is a placeholder paragraph written by the newsroom's mock mode.",
            "It lets the build, templates and validation be tested without an API key.",
            "Officials in Talas said the *mock* figures were encouraging.",
            "IradOne will continue to follow the story. " + " ".join(["Further placeholder text keeps the mock story long enough to pass the length check."] * 12),
        ],
        "people_quoted": [],
    }


# --------------------------------------------------------------------------
# Validation
# --------------------------------------------------------------------------

def words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", text.lower())


def copied_run(story_text: str, source_text: str, n: int = 9) -> str | None:
    """Return a run of n consecutive words shared with the source, if any."""
    src = words(source_text)
    grams = {" ".join(src[i:i + n]) for i in range(len(src) - n + 1)}
    out = words(story_text)
    for i in range(len(out) - n + 1):
        g = " ".join(out[i:i + n])
        if g in grams:
            return g
    return None


def validate(story: dict, item: dict) -> str | None:
    if not story.get("publishable", False):
        return "writer declined: " + story.get("reason_if_not", "")
    text = " ".join([story["headline"], story["dek"], *story["paragraphs"]])
    for name in CONFIG["real_people_watchlist"]:
        if re.search(r"\b" + re.escape(name) + r"\b", text, re.I):
            return f"names a real person: {name}"
    run = copied_run(text, f"{item['title']} {item['summary']}")
    if run:
        return f"copies source wording: '{run}'"
    n_words = len(words(" ".join(story["paragraphs"])))
    if n_words < 150:
        return f"too short ({n_words} words)"
    if story["category"] not in CATEGORIES:
        return f"bad category {story['category']}"
    return None


# --------------------------------------------------------------------------
# Storage
# --------------------------------------------------------------------------

def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return text[:70].rstrip("-")


def load_articles() -> list[dict]:
    arts = [json.loads(p.read_text(encoding="utf-8")) for p in DATA.glob("*.json")]
    arts.sort(key=lambda a: a["published"], reverse=True)
    return arts


def choose_image(category: str, articles: list[dict]) -> str:
    pool = IMAGES.get(category) or IMAGES["regional"]
    recent = [a.get("image") for a in articles[:12]]
    # unused images first, then the one used longest ago
    return min(pool, key=lambda img: (1, -recent.index(img)) if img in recent else (0, 0))


def save_story(story: dict, item: dict, pick: dict, articles: list[dict], published: dt.datetime,
               dry: bool) -> dict:
    base = f"{published:%Y-%m-%d}-{slugify(story['headline'])}"
    slug, n = base, 2
    while (DATA / f"{slug}.json").exists():
        slug, n = f"{base}-{n}", n + 1
    art = {
        "slug": slug,
        "headline": story["headline"].strip(),
        "dek": story["dek"].strip(),
        "dateline": story["dateline"].strip().upper(),
        "category": story["category"],
        "ticker": story["ticker"].strip(),
        "tags": story.get("tags", []),
        "paragraphs": [p.strip() for p in story["paragraphs"] if p.strip()],
        "people_quoted": story.get("people_quoted", []),
        "image": choose_image(story["image_category"], articles),
        "published": published.isoformat(timespec="minutes"),
        "treatment": pick["treatment"],
        "source": {"name": item["source"], "title": item["title"], "url": item["url"],
                   "published": item["published"]},
        "generated_by": CONFIG["writer_model"],
    }
    if not dry:
        DATA.mkdir(parents=True, exist_ok=True)
        (DATA / f"{slug}.json").write_text(json.dumps(art, ensure_ascii=False, indent=2) + "\n",
                                          encoding="utf-8")
    return art



# --------------------------------------------------------------------------
# Cadence: at most one story a day, with occasional quiet days
# --------------------------------------------------------------------------

def _day_random(day: dt.date, salt: str) -> float:
    h = hashlib.sha256(f"iradone|{day.isoformat()}|{salt}".encode()).hexdigest()
    return int(h[:12], 16) / 16 ** 12


def last_story_day(articles: list[dict]) -> dt.date | None:
    days = [dt.datetime.fromisoformat(a["published"]).astimezone(IRAD_TZ).date() for a in articles]
    return max(days) if days else None


def day_plan(day: dt.date, articles: list[dict]) -> dict:
    """Decide, the same way every time for a given day, whether it is a news
    day and from what time of day the story may go out."""
    cad = CONFIG["cadence"]
    last = last_story_day([a for a in articles
                           if dt.datetime.fromisoformat(a["published"]).astimezone(IRAD_TZ).date() < day])
    days_since = (day - last).days if last else 99
    chances = cad["chance_by_days_since_last_story"]
    chance = chances.get(str(days_since), chances["default"])
    start_h, end_h = cad["publish_window_hours_irt"]
    minutes = int(_day_random(day, "time") * (end_h - start_h) * 60)
    publish_at = dt.datetime.combine(day, dt.time(start_h), IRAD_TZ) + dt.timedelta(minutes=minutes)
    return {"day": day.isoformat(), "days_since_last": days_since, "chance": chance,
            "news_day": _day_random(day, "news") < chance, "publish_from": publish_at,
            "window_end": dt.datetime.combine(day, dt.time(end_h), IRAD_TZ) + dt.timedelta(hours=2)}


def is_due(now: dt.datetime, articles: list[dict]) -> tuple[bool, str]:
    today = now.date()
    published_today = sum(1 for a in articles
                          if dt.datetime.fromisoformat(a["published"]).astimezone(IRAD_TZ).date() == today)
    if published_today >= CONFIG["cadence"]["max_stories_per_day"]:
        return False, "today's story is already out"
    plan = day_plan(today, articles)
    if not plan["news_day"]:
        return False, (f"quiet day ({plan['days_since_last']} days since last story, "
                       f"{plan['chance']:.0%} chance)")
    if now < plan["publish_from"]:
        return False, f"news day; story due from {plan['publish_from']:%H:%M} IRT"
    if now > plan["window_end"]:
        return False, "news day, but today's window has closed"
    return True, f"news day; due since {plan['publish_from']:%H:%M} IRT"


def due_command(args) -> int:
    now = now_irad()
    articles = load_articles()
    due, why = is_due(now, articles)
    print(f"{now:%Y-%m-%d %H:%M} IRT: {'DUE' if due else 'not due'} ({why})")
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a") as f:
            f.write(f"due={'true' if due else 'false'}\n")
    if args.preview:
        print("\nNext days (assuming each news day publishes):")
        sim = list(articles)
        for i in range(args.preview):
            day = now.date() + dt.timedelta(days=i)
            plan = day_plan(day, sim)
            mark = f"story from {plan['publish_from']:%H:%M}" if plan["news_day"] else "quiet"
            if i == 0 and not due and "already out" in why:
                print(f"  {day:%a %d %b}: today's story is already out")
                continue
            print(f"  {day:%a %d %b}: {mark}  (chance {plan['chance']:.0%})")
            if plan["news_day"]:
                sim.insert(0, {"published": plan["publish_from"].isoformat()})
    return 0

# --------------------------------------------------------------------------
# Run
# --------------------------------------------------------------------------

def run(args) -> int:
    max_n = args.max if args.max is not None else CONFIG["cadence"]["max_stories_per_day"]
    today = now_irad()
    log(f"IradOne newsroom run, {today:%Y-%m-%d %H:%M} IRT, up to {max_n} stories")
    if not args.force:
        due, why = is_due(today, load_articles())
        log(f"Cadence: {why}")
        if not due:
            return 0

    seen = prune_seen(load_seen())
    log("Fetching feeds")
    items = fetch_feeds(Path(args.fixtures) if args.fixtures else None)

    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=CONFIG["max_age_hours"])
    candidates, by_title = [], set()
    for it in items:
        key = url_key(it["url"])
        title_key = re.sub(r"\W+", "", it["title"].lower())[:60]
        if key in seen or title_key in by_title:
            continue
        if it["published"] and dt.datetime.fromisoformat(it["published"]) < cutoff:
            continue
        by_title.add(title_key)
        reason = skip_reason(it)
        if reason:
            seen[key] = {"decision": reason, "title": it["title"], "at": today.isoformat()}
            continue
        candidates.append(it)

    candidates.sort(key=lambda c: c["published"] or "", reverse=True)
    candidates = candidates[: CONFIG["max_candidates_for_triage"]]
    for i, c in enumerate(candidates):
        c["id"] = i
    log(f"{len(candidates)} fresh candidates")

    articles = load_articles()
    recent = [a["headline"] for a in articles]
    published_new = 0
    failures = 0

    if candidates and max_n > 0:
        claude = Claude(args.mock)
        today_str = f"{today:%A %d %B %Y}"
        try:
            picks = claude.triage(candidates, recent, max_n + 1, today_str)  # one spare
        except Exception as exc:
            log(f"Triage failed: {exc.__class__.__name__}: {exc}")
            picks, failures = None, 1
        if picks is not None:
            log(f"Triage picked {len(picks)}: " + json.dumps(picks, ensure_ascii=False))
        picked_ids = set()
        for pick in picks or []:
            if published_new >= max_n:
                break
            try:
                pid = int(pick.get("id"))
            except (TypeError, ValueError):
                log(f"  ignoring pick with bad id: {pick}")
                continue
            if pid not in range(len(candidates)) or pid in picked_ids:
                log(f"  ignoring pick with unknown or repeated id: {pick}")
                continue
            picked_ids.add(pid)
            pick["id"] = pid
            pick.setdefault("treatment", "regional")
            pick.setdefault("angle", "")
            item = candidates[pid]
            log(f"Writing: {item['title']}  [{pick['treatment']}]")
            try:
                story = claude.write(item, pick, recent, today_str, recent_minor_people(articles))
            except Exception as exc:
                log(f"  write failed: {exc.__class__.__name__}: {exc}")
                failures += 1
                picked_ids.discard(pid)  # leave unseen so a later run can retry
                continue
            problem = validate(story, item)
            key = url_key(item["url"])
            if problem:
                log(f"  rejected: {problem}")
                seen[key] = {"decision": f"rejected: {problem}", "title": item["title"],
                             "at": today.isoformat()}
                continue
            stamp = today - dt.timedelta(minutes=7 * published_new)  # keep order stable within a run
            art = save_story(story, item, pick, articles, stamp, args.dry_run)
            articles.insert(0, art)
            recent.insert(0, art["headline"])
            seen[key] = {"decision": f"published {art['slug']}", "title": item["title"],
                         "at": today.isoformat()}
            published_new += 1
            log(f"  published: {art['headline']}")
        # Items triage passed over stay eligible until they age out (max_age_hours).

    if args.dry_run:
        log(f"Dry run: {published_new} stories would be published")
        return 0
    SEEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    SEEN_FILE.write_text(json.dumps(seen, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
                         encoding="utf-8")
    import build  # local module
    build.build()
    log(f"Done: {published_new} new stories, {failures} failed calls")
    if failures and not published_new:
        log("Every Claude call failed; marking the run as failed.")
        return 1
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run")
    r.add_argument("--max", type=int)
    r.add_argument("--dry-run", action="store_true")
    r.add_argument("--fixtures")
    r.add_argument("--mock", action="store_true")
    r.add_argument("--force", action="store_true", help="publish now, ignoring the daily cadence")
    d = sub.add_parser("due", help="say whether a story is due now")
    d.add_argument("--preview", type=int, default=0, metavar="DAYS", help="also show the plan for the next DAYS days")
    sub.add_parser("build")
    args = ap.parse_args()
    sys.path.insert(0, str(NEWSROOM))
    if args.cmd == "build":
        import build
        build.build()
        return 0
    if args.cmd == "due":
        return due_command(args)
    try:
        return run(args)
    except Exception as exc:
        log(f"Run crashed: {exc.__class__.__name__}: {exc}")
        raise
    finally:
        if not args.dry_run:
            save_run_log()


if __name__ == "__main__":
    sys.exit(main())
