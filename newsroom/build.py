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

TICKER_LEN = 15
TOP_STORIES = 6


def esc(s: str) -> str:
    return html.escape(s or "", quote=True)


def inline(s: str) -> str:
    """Escape, then allow *italics* (used for Iradi words and titles)."""
    return re.sub(r"\*([^*]+)\*", r"<em>\1</em>", esc(s))


def nice_date(iso: str) -> str:
    d = dt.datetime.fromisoformat(iso)
    return f"{d:%B} {d.day}, {d.year}"


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


def card_html(a: dict, base: str) -> str:
    url = f"{base}news/{a['slug']}.html"
    return f"""    <article>
      <a href="{url}"><img src="{base}{esc(a['image'])}" alt="{esc(a['headline'])}" loading="lazy"></a>
      <h3><a href="{url}">{esc(a['headline'])}</a></h3>
      <p>Published: {nice_date(a['published'])}</p>
      <p>{inline(a['dek'])}</p>
      <a href="{url}" class="read-more">Read More</a>
    </article>"""


def page(title: str, description: str, canonical: str, content: str, arts: list[dict],
         og_image: str, og_type: str = "website", og_title: str | None = None) -> str:
    base = "../"
    values = {
        "title": esc(title), "description": esc(description), "canonical": esc(canonical),
        "og_title": esc(og_title or title), "og_image": esc(og_image), "og_type": og_type,
        "base": base, "ticker": ticker_html(arts, base), "content": content,
        "year": str(dt.date.today().year),
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
        source_html = (f'\n      <p class="story-source">Inspired by real reporting: '
                       f'<a href="{esc(src["url"])}" rel="nofollow noopener" target="_blank">'
                       f'{esc(src["title"])}</a> ({esc(src["name"])}). This IradOne story is fiction.</p>')
    tags = "".join(f'<span class="story-tag">{esc(t)}</span>' for t in a.get("tags", []))
    content = f"""      <article class="story">
        <p class="story-kicker"><a href="index.html">News</a> &middot; {esc(a['category'])}</p>
        <h1>{esc(a['headline'])}</h1>
        <p class="story-dek">{inline(a['dek'])}</p>
        <p class="story-meta">Published: {nice_date(a['published'])} &middot; IradOne News</p>
        <img class="story-image" src="../{esc(a['image'])}" alt="">
        <div class="story-body">
          {chr(10).join('          ' + b for b in body).strip()}
        </div>
        <p class="story-tags">{tags}</p>{source_html}
        <section class="story-more">
          <h2>More from IradOne</h2>
          <ul>
{more_html}
          </ul>
        </section>
      </article>"""
    return page(f"{a['headline']} | IradOne", a["dek"], f"{SITE}/news/{a['slug']}.html", content, arts,
                f"{SITE}/{a['image']}", "article", a["headline"])


def archive_page(arts: list[dict]) -> str:
    rows = "\n".join(
        f"""        <li class="archive-item">
          <a href="{a['slug']}.html"><img src="../{esc(a['image'])}" alt="" loading="lazy"></a>
          <div>
            <p class="story-kicker">{esc(a['category'])} &middot; {nice_date(a['published'])}</p>
            <h3><a href="{a['slug']}.html">{esc(a['headline'])}</a></h3>
            <p>{inline(a['dek'])}</p>
          </div>
        </li>""" for a in arts)
    content = f"""      <section class="archive">
        <h1>IradOne News</h1>
        <p class="story-dek">The latest from Talas, Nurzhan, Iyık Janyl and the region.</p>
        <ul class="archive-list">
{rows}
        </ul>
      </section>"""
    return page("News | IradOne Television", "The latest news from IradOne Television in Talas.",
                f"{SITE}/news/index.html", content, arts, f"{SITE}/iradone.png")


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
  <description>News from IradOne Television, Talas. Fiction from the Irad worldbuilding project.</description>
  <language>en</language>
{chr(10).join(items)}
</channel>
</rss>
"""


def sitemap(arts: list[dict]) -> str:
    urls = [(f"{SITE}/", None), (f"{SITE}/news/index.html", arts[0]["published"][:10] if arts else None)]
    urls += [(f"{SITE}/news/{a['slug']}.html", a["published"][:10]) for a in arts]
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
    summary = [{k: a[k] for k in ("slug", "headline", "dek", "ticker", "category", "dateline", "image", "published")}
               for a in arts]
    write(NEWS / "index.json", json.dumps(summary, ensure_ascii=False, indent=1) + "\n")
    write(NEWS / "feed.xml", feed_xml(arts))
    write(ROOT / "sitemap.xml", sitemap(arts))

    index = (ROOT / "index.html").read_text(encoding="utf-8")
    index = replace_between(index, "TICKER", ticker_html(arts, ""))
    cards = "\n".join(card_html(a, "") for a in arts[:TOP_STORIES])
    index = replace_between(index, "TOP", "\n" + cards + "\n  ")
    write(ROOT / "index.html", index)
    print(f"Built {len(arts)} articles", flush=True)


if __name__ == "__main__":
    build()
