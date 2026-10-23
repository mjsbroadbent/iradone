"""Render the IradOne news pages from news/data/*.json.

Writes news/<slug>.html, news/index.html, news/index.json, news/feed.xml,
sitemap.xml, and refreshes the ticker and Top Stories on index.html
(between the <!-- NEWS:... --> markers).
"""

from __future__ import annotations

import datetime as dt
import html
import json
import re
import unicodedata
from pathlib import Path
from xml.sax.saxutils import escape as xml_escape

ROOT = Path(__file__).resolve().parent.parent
NEWSROOM = ROOT / "newsroom"
NEWS = ROOT / "news"
DATA = NEWS / "data"
CONFIG = json.loads((NEWSROOM / "config.json").read_text(encoding="utf-8"))
SITE = CONFIG["site_url"].rstrip("/")
TEMPLATE = (NEWSROOM / "templates" / "page.html").read_text(encoding="utf-8")
LEGACY_TICKER = json.loads((NEWSROOM / "legacy_ticker.json").read_text(encoding="utf-8"))
CREDITS_FILE = ROOT / "photos" / "credits.json"
CREDITS = json.loads(CREDITS_FILE.read_text(encoding="utf-8")) if CREDITS_FILE.exists() else {}

TICKER_LEN = 15
TOP_STORIES = 6
LEAD_STORIES = 3


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower() or "x"


def esc(s: str) -> str:
    return html.escape(s or "", quote=True)


def inline(s: str) -> str:
    """Escape, then allow *italics* (used for Iradi words and titles)."""
    return re.sub(r"\*([^*]+)\*", r"<em>\1</em>", esc(s))


def nice_date(iso: str) -> str:
    d = dt.datetime.fromisoformat(iso)
    return f"{d:%B} {d.day}, {d.year}"


def credit_text(image: str) -> str | None:
    c = CREDITS.get(image)
    if not c:
        return None
    if c.get("kind") == "irad-commons":
        return "Photo: Irad Wiki Commons"
    return f"Photo: {c['author']} / Wikimedia Commons, {c['licence']}"


def credit_html(image: str, base: str, cls: str = "photo-credit") -> str:
    c = CREDITS.get(image)
    if not c:
        return ""
    if c.get("kind") == "irad-commons":
        return f'<p class="{cls}">Photo: <a href="{esc(c["source"])}" rel="noopener" target="_blank">Irad Wiki Commons</a></p>'
    lic = (f'<a href="{esc(c["licence_url"])}" rel="license noopener" target="_blank">{esc(c["licence"])}</a>'
           if c.get("licence_url") else esc(c["licence"]))
    return (f'<p class="{cls}">Photo: <a href="{esc(c["source"])}" rel="noopener" target="_blank">'
            f'{esc(c["author"])}</a> / Wikimedia Commons, {lic}</p>')


def alt_for(image: str) -> str:
    return esc((CREDITS.get(image) or {}).get("alt", ""))


def load() -> list[dict]:
    arts = [json.loads(p.read_text(encoding="utf-8")) for p in DATA.glob("*.json")]
    arts.sort(key=lambda a: a["published"], reverse=True)
    return arts


def ticker_html(arts: list[dict], base: str) -> str:
    entries = [(a["ticker"] or a["headline"], f"{base}news/{a['slug']}.html") for a in arts[:TICKER_LEN]]
    for legacy in LEGACY_TICKER:  # pad with the station's older headlines while the feed is young
        if len(entries) >= TICKER_LEN:
            break
        entries.append((html.unescape(legacy), None))
    spans = [f'<span><a href="{esc(u)}">{esc(t)}</a></span>' if u else f"<span>{esc(t)}</span>"
             for t, u in entries]
    # duplicated for the seamless scroll
    return "\n    " + "\n    ".join(spans) + "\n    <!-- Duplicate the content for seamless scrolling -->\n    " \
        + "\n    ".join(spans) + "\n  "


def lead_html(arts: list[dict]) -> str:
    slides = []
    for i, a in enumerate(arts[:LEAD_STORIES]):
        url = f"news/{a['slug']}.html"
        slides.append(f"""      <a class="lead-slide{' active' if i == 0 else ''}" href="{url}">
        <img src="{esc(a['image'])}" alt="" {'fetchpriority="high"' if i == 0 else 'loading="lazy"'}>
        <div class="lead-caption">
          <span class="lead-kicker">{esc(a['category'])} &middot; {nice_date(a['published'])}</span>
          <h3>{esc(a['headline'])}</h3>
          <p>{inline(a['dek'])}</p>
        </div>{('<span class="lead-credit">' + esc(credit_text(a['image'])) + '</span>') if credit_text(a['image']) else ''}
      </a>""")
    return "\n" + "\n".join(slides) + "\n"


def card_html(a: dict, base: str) -> str:
    url = f"{base}news/{a['slug']}.html"
    return f"""    <article>
      <a href="{url}"><img src="{base}{esc(a['image'])}" alt="{esc(a['headline'])}" loading="lazy"></a>
      <h3><a href="{url}">{esc(a['headline'])}</a></h3>
      <p>Published: {nice_date(a['published'])}</p>
      <p>{inline(a['dek'])}</p>
      <a href="{url}" class="read-more">Read More</a>
    </article>"""


TULPAR_NAMES = {"iradone": "IradOne", "iradonesport": "IradOne Sport"}   # channels on Tulpar (footer and header links)


def page(title: str, description: str, canonical: str, content: str, arts: list[dict],
         og_image: str, og_type: str = "website", og_title: str | None = None,
         base: str = "../", scripts: tuple[str, ...] = (), tulpar: str = "iradone") -> str:
    """Wrap content in the site template. `base` is the path from the page up to
    the site root ("" for root pages, "../" one folder down, "../../" two)."""
    extra = "".join(f'\n  <script src="{base}{s}"></script>' for s in scripts)
    values = {
        "title": esc(title), "description": esc(description), "canonical": esc(canonical),
        "og_title": esc(og_title or title), "og_image": esc(og_image), "og_type": og_type,
        "base": base, "ticker": ticker_html(arts, base), "content": content,
        "year": str(dt.date.today().year), "scripts": extra,
        "tulpar": tulpar, "tulpar_name": TULPAR_NAMES.get(tulpar, "IradOne"),
    }
    return re.sub(r"\{\{(\w+)\}\}", lambda m: values[m.group(1)], TEMPLATE)


def article_page(a: dict, arts: list[dict]) -> str:
    paras = a["paragraphs"]
    body = [f"<p><strong>{esc(a['dateline'])} &mdash;</strong> {inline(paras[0])}</p>"]
    body += [f"<p>{inline(p)}</p>" for p in paras[1:]]
    more = [o for o in arts if o["slug"] != a["slug"]][:4]
    more_html = "\n".join(
        f'          <li><a href="{o["slug"]}.html">{esc(o["headline"])}</a> '
        f'<span class="story-more-date">{nice_date(o["published"])}</span></li>' for o in more)
    src = a.get("source")
    source_html = ""
    if src and src.get("url"):
        source_html = (f'\n      <p class="story-source">Based on reporting by: '
                       f'<a href="{esc(src["url"])}" rel="nofollow noopener" target="_blank">'
                       f'{esc(src["title"])}</a> ({esc(src["name"])}).</p>')
    tags = "".join(f'<a class="story-tag" href="tag/{slugify(t)}.html">{esc(t)}</a>' for t in a.get("tags", []))
    content = f"""      <article class="story">
        <p class="story-kicker"><a href="index.html">News</a> &middot; <a href="section/{slugify(a['category'])}.html">{esc(a['category'])}</a></p>
        <h1>{esc(a['headline'])}</h1>
        <p class="story-dek">{inline(a['dek'])}</p>
        <p class="story-meta">Published: {nice_date(a['published'])} &middot; OneNews</p>
        <img class="story-image" src="../{esc(a['image'])}" alt="{alt_for(a['image'])}">
        {credit_html(a['image'], '../')}
        <div class="story-body">
          {chr(10).join('          ' + b for b in body).strip()}
        </div>
        <p class="story-tags">{tags}</p>{source_html}
        <div class="ad-slot ad-box" data-size="box"></div>
        <section class="story-more">
          <h2>More from IradOne</h2>
          <ul>
{more_html}
          </ul>
        </section>
      </article>"""
    return page(f"{a['headline']} | IradOne Online", a["dek"], f"{SITE}/news/{a['slug']}.html", content, arts,
                f"{SITE}/{a['image']}", "article", a["headline"])


def archive_rows(items: list[dict], news: str, root: str) -> str:
    """`news` is the path to the news folder, `root` the path to the site root."""
    return "\n".join(
        f"""        <li class="archive-item">
          <a href="{news}{a['slug']}.html"><img src="{root}{esc(a['image'])}" alt="" loading="lazy"></a>
          <div>
            <p class="story-kicker"><a href="{news}section/{slugify(a['category'])}.html">{esc(a['category'])}</a> &middot; {nice_date(a['published'])}</p>
            <h3><a href="{news}{a['slug']}.html">{esc(a['headline'])}</a></h3>
            <p>{inline(a['dek'])}</p>
          </div>
        </li>""" for a in items)


def section_bar(arts: list[dict], news: str, current: str | None = None) -> str:
    counts: dict[str, int] = {}
    for a in arts:
        counts[a["category"]] = counts.get(a["category"], 0) + 1
    links = [f'<a href="{news}index.html"{" class=\"active\"" if current is None else ""}>All</a>']
    for cat in sorted(counts):
        cls = ' class="active"' if cat == current else ""
        links.append(f'<a href="{news}section/{slugify(cat)}.html"{cls}>{esc(cat)} <span>{counts[cat]}</span></a>')
    return '        <nav class="section-bar" aria-label="News sections">' + "".join(links) + "</nav>"


def archive_page(arts: list[dict]) -> str:
    content = f"""      <section class="archive">
        <h1>IradOne News</h1>
        <p class="story-dek">The latest from Talas, Nurzhan, Iyık Janyl and the region.</p>
{section_bar(arts, "")}
        <ul class="archive-list">
{archive_rows(arts, "", "../")}
        </ul>
      </section>"""
    return page("News | IradOne Online", "The latest news from IradOne Online in Talas.",
                f"{SITE}/news/index.html", content, arts, f"{SITE}/iradone.png")


def section_page(cat: str, arts: list[dict]) -> str:
    items = [a for a in arts if a["category"] == cat]
    content = f"""      <section class="archive">
        <p class="story-kicker"><a href="../index.html">News</a></p>
        <h1>{esc(cat)}</h1>
{section_bar(arts, "../", cat)}
        <ul class="archive-list">
{archive_rows(items, "../", "../../")}
        </ul>
      </section>"""
    return page(f"{cat} | IradOne News", f"{cat} news from IradOne Online.",
                f"{SITE}/news/section/{slugify(cat)}.html", content, arts, f"{SITE}/iradone.png", base="../../")


def tag_page(tag: str, items: list[dict], arts: list[dict]) -> str:
    content = f"""      <section class="archive">
        <p class="story-kicker"><a href="../index.html">News</a> &middot; Topic</p>
        <h1>{esc(tag)}</h1>
        <p class="story-dek">{len(items)} {"story" if len(items) == 1 else "stories"} tagged {esc(tag)}.</p>
        <ul class="archive-list">
{archive_rows(items, "../", "../../")}
        </ul>
      </section>"""
    return page(f"Tag: {tag} | IradOne News", f"IradOne stories about {tag}.",
                f"{SITE}/news/tag/{slugify(tag)}.html", content, arts, f"{SITE}/iradone.png", base="../../")


def tag_index(arts: list[dict]) -> dict[str, list[dict]]:
    tags: dict[str, list[dict]] = {}
    names: dict[str, str] = {}
    for a in arts:
        for t in a.get("tags", []):
            key = slugify(t)
            names.setdefault(key, t)
            tags.setdefault(key, []).append(a)
    return {names[k]: v for k, v in tags.items()}


def credits_page(arts: list[dict]) -> str:
    rows = "\n".join(
        f"""        <li class="credit-item">
          <img src="{esc(path)}" alt="{esc(c.get('alt', ''))}" loading="lazy">
          <div>
            <p><strong>{esc(c.get('alt', ''))}</strong></p>
            {credit_html(path, '../', 'credit-line')}
          </div>
        </li>""" for path, c in sorted(CREDITS.items()))
    content = f"""      <section class="archive">
        <h1>Photo credits</h1>
        <p class="story-dek">Photographs used on this site under free licences from Wikimedia Commons, with thanks to their authors, and images generated for the Irad Wiki.</p>
        <ul class="credit-list">
{rows}
        </ul>
      </section>"""
    return page("Photo credits | IradOne Online", "Credits for photographs used on IradOne.",
                f"{SITE}/credits.html", content, arts, f"{SITE}/iradone.png", base="")


def feed_xml(arts: list[dict]) -> str:
    items = []
    for a in arts[:30]:
        d = dt.datetime.fromisoformat(a["published"])
        items.append(f"""  <item>
    <title>{xml_escape(a['headline'])}</title>
    <link>{SITE}/news/{a['slug']}.html</link>
    <guid>{SITE}/news/{a['slug']}.html</guid>
    <pubDate>{d.strftime('%a, %d %b %Y %H:%M:%S %z')}</pubDate>
    <category>{xml_escape(a['category'])}</category>
    <description>{xml_escape(a['dek'])}</description>
  </item>""")
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>IradOne News</title>
  <link>{SITE}/news/index.html</link>
  <description>News from IradOne Online, Talas.</description>
  <language>en</language>
{chr(10).join(items)}
</channel>
</rss>
"""


def sitemap(arts: list[dict], extra: list[str]) -> str:
    urls = [(f"{SITE}/", None), (f"{SITE}/news/index.html", arts[0]["published"][:10] if arts else None)]
    urls += [(f"{SITE}/news/{a['slug']}.html", a["published"][:10]) for a in arts]
    urls += [(f"{SITE}/{p}", None) for p in extra]
    body = "\n".join(f"  <url><loc>{u}</loc>{f'<lastmod>{m}</lastmod>' if m else ''}</url>" for u, m in urls)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{body}\n</urlset>\n'


def replace_between(text: str, name: str, new: str) -> str:
    pat = re.compile(rf"(<!-- NEWS:{name}:START -->)(.*?)(<!-- NEWS:{name}:END -->)", re.S)
    if not pat.search(text):
        raise SystemExit(f"index.html is missing the NEWS:{name} markers")
    return pat.sub(lambda m: m.group(1) + new + m.group(3), text, count=1)


def write(path: Path, text: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists() or path.read_text(encoding="utf-8") != text:
        path.write_text(text, encoding="utf-8")


def build():
    arts = load()
    keep = {f"{a['slug']}.html" for a in arts} | {"index.html"}
    for old in NEWS.glob("*.html"):  # drop pages whose data was deleted
        if old.name not in keep:
            old.unlink()
    for a in arts:
        write(NEWS / f"{a['slug']}.html", article_page(a, arts))
    write(NEWS / "index.html", archive_page(arts))
    write(ROOT / "credits.html", credits_page(arts))
    extra = []

    sections = sorted({a["category"] for a in arts})
    keep_sections = {f"{slugify(c)}.html" for c in sections}
    for old in (NEWS / "section").glob("*.html"):
        if old.name not in keep_sections:
            old.unlink()
    for cat in sections:
        write(NEWS / "section" / f"{slugify(cat)}.html", section_page(cat, arts))
        extra.append(f"news/section/{slugify(cat)}.html")

    tags = tag_index(arts)
    keep_tags = {f"{slugify(t)}.html" for t in tags}
    for old in (NEWS / "tag").glob("*.html"):
        if old.name not in keep_tags:
            old.unlink()
    for t, items in tags.items():
        write(NEWS / "tag" / f"{slugify(t)}.html", tag_page(t, items, arts))

    import pages  # programme pages, radio and sport (newsroom/pages.py)
    extra += pages.build_all(arts, page, write)
    summary = [{k: a[k] for k in ("slug", "headline", "dek", "ticker", "category", "dateline", "image", "published")}
               for a in arts]
    for s, a in zip(summary, arts):  # lets the Talas Herald see which real reports IradOne adapted
        if (a.get("source") or {}).get("url"):
            s["source_url"] = a["source"]["url"]
    write(NEWS / "index.json", json.dumps(summary, ensure_ascii=False, indent=1) + "\n")
    write(NEWS / "feed.xml", feed_xml(arts))
    write(ROOT / "sitemap.xml", sitemap(arts, extra))

    index = (ROOT / "index.html").read_text(encoding="utf-8")
    index = replace_between(index, "TICKER", ticker_html(arts, ""))
    # the lead slideshow already shows the newest few, so the cards carry on from there
    cards = "\n".join(card_html(a, "") for a in arts[LEAD_STORIES:LEAD_STORIES + TOP_STORIES])
    index = replace_between(index, "TOP", "\n" + cards + "\n  ")
    index = replace_between(index, "LEAD", lead_html(arts))
    write(ROOT / "index.html", index)
    print(f"Built {len(arts)} articles", flush=True)


if __name__ == "__main__":
    build()
