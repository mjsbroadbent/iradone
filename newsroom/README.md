# IradOne newsroom

Every 8 hours a GitHub Action pulls real Central Asian news from RSS feeds, has Claude recast up to three stories as IradOne reports set in Irad, and commits the new pages. GitHub Pages then republishes the site.

## How a run works

1. **Fetch** the feeds in `config.json` (Kabar, RFE/RL, The Times of Central Asia, Gazeta.uz, Kun.uz). Items older than 96 hours, already seen, or matching a `skip_keywords` word (deaths, attacks and similar) are dropped.
2. **Triage**: a cheap model picks the best few items and marks each `domestic` (moved into Irad) or `regional` (reported as neighbour news with an Irad angle).
3. **Write**: the writer model gets `prompts/house_style.md` plus the lore (`quickref.md` and `canon.md`, checked out from `mjsbroadbent/irad_persona_skill` on every run, so lore changes flow straight through).
4. **Check**: a story is dropped if it names anyone on `real_people_watchlist`, reuses a run of 9+ words from the source, or is too short.
5. **Build** (`build.py`): article pages, `news/index.html` archive, `news/index.json`, `news/feed.xml`, `sitemap.xml`, and the ticker and Top Stories on the homepage (between the `<!-- NEWS:... -->` markers in `index.html`).

## Setup

Add a repository secret named `ANTHROPIC_API_KEY` (Settings > Secrets and variables > Actions). To run immediately: Actions tab > IradOne newsroom > Run workflow.

## Everyday changes

| To change | Edit |
|---|---|
| How often it runs | `cron` line in `.github/workflows/newsroom.yml` |
| Stories per run, models, feeds, skip words | `config.json` |
| Voice and editorial rules | `prompts/house_style.md` |
| Photos used for stories | `images.json` (add your own images to the lists) |
| Page layout | `templates/page.html`, then `python newsroom/newsroom.py build` |
| Remove a story | delete its file in `news/data/`, then run `build` |
| Fix a story | edit its file in `news/data/`, then run `build` |

## Local testing

```
python newsroom/newsroom.py build                       # rebuild pages only
python newsroom/newsroom.py run --dry-run               # real run, writes nothing
python newsroom/newsroom.py run --mock --fixtures DIR   # no API key; feeds read from DIR/0.xml, 1.xml...
```

`news/seen.json` records every source item the newsroom has looked at and what it decided, which is the first place to look if a story you expected never appeared.
