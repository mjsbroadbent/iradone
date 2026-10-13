#!/usr/bin/env python3
"""Find freely licensed photo candidates on Wikimedia Commons.

Runs in GitHub Actions (the photos workflow). For each brief in
photo_briefs.json it searches Commons, keeps landscape bitmaps at least
1600 px wide under CC0, public-domain, CC BY or CC BY-SA licences, and
downloads up to five per brief as 1600 px JPEGs into photos/candidates/<id>/.
photos/candidates/candidates.json records title, author, licence and links
for the credits. Chosen photos are then copied into photos/ by hand and
listed in photos/credits.json.
"""

import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BRIEFS = json.loads((ROOT / "newsroom" / "photo_briefs.json").read_text(encoding="utf-8"))
OUT = ROOT / "photos" / "candidates"
API = "https://commons.wikimedia.org/w/api.php"
UA = "IradOneSite/1.0 (https://iradone.com; github.com/mjsbroadbent/iradone)"
PER_BRIEF = 5
MIN_WIDTH = 1600
OK_LICENCE = re.compile(r"^(cc0|public domain|pd|cc by(-sa)? [0-9.]+)", re.I)


def api(params):
    params = dict(params, format="json", formatversion="2")
    req = urllib.request.Request(API + "?" + urllib.parse.urlencode(params), headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.load(r)


def plain(value):
    return html.unescape(re.sub(r"<[^>]+>", "", value or "")).strip()


def search(query):
    data = api({
        "action": "query", "generator": "search", "gsrsearch": f"{query} filetype:bitmap",
        "gsrnamespace": 6, "gsrlimit": 30, "prop": "imageinfo",
        "iiprop": "url|size|mime|extmetadata", "iiurlwidth": MIN_WIDTH,
    })
    pages = (data.get("query") or {}).get("pages") or []
    return sorted(pages, key=lambda p: p.get("index", 0))


def usable(page):
    info = (page.get("imageinfo") or [{}])[0]
    meta = info.get("extmetadata") or {}
    licence = plain((meta.get("LicenseShortName") or {}).get("value"))
    w, h = info.get("width", 0), info.get("height", 0)
    if info.get("mime") not in ("image/jpeg", "image/png", "image/webp"):
        return None
    if w < MIN_WIDTH or not h or w / h < 1.3:
        return None
    if not OK_LICENCE.match(licence):
        return None
    return {
        "title": page["title"],
        "page": info.get("descriptionurl"),
        "thumb": info.get("thumburl"),
        "width": w, "height": h,
        "author": plain((meta.get("Artist") or {}).get("value"))[:120],
        "licence": licence,
        "licence_url": (meta.get("LicenseUrl") or {}).get("value", ""),
        "description": plain((meta.get("ImageDescription") or {}).get("value"))[:300],
    }


def main():
    results = {}
    for brief in BRIEFS:
        found, seen = [], set()
        for q in brief["queries"]:
            try:
                pages = search(q)
            except Exception as exc:
                print(f"{brief['id']}: search '{q}' failed: {exc}", file=sys.stderr)
                continue
            for p in pages:
                c = usable(p)
                if c and c["title"] not in seen:
                    seen.add(c["title"])
                    found.append(c)
            time.sleep(1)
            if len(found) >= PER_BRIEF:
                break
        folder = OUT / brief["id"]
        folder.mkdir(parents=True, exist_ok=True)
        kept = []
        for i, c in enumerate(found[:PER_BRIEF], 1):
            try:
                req = urllib.request.Request(c["thumb"], headers={"User-Agent": UA})
                with urllib.request.urlopen(req, timeout=60) as r:
                    (folder / f"{i}.jpg").write_bytes(r.read())
                c["file"] = f"photos/candidates/{brief['id']}/{i}.jpg"
                kept.append(c)
            except Exception as exc:
                print(f"{brief['id']}: download failed for {c['title']}: {exc}", file=sys.stderr)
            time.sleep(1)
        results[brief["id"]] = {"want": brief["want"], "candidates": kept}
        print(f"{brief['id']}: {len(kept)} candidates")
    (OUT / "candidates.json").write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
