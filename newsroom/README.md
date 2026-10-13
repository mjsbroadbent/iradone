# IradOne newsroom

A GitHub Action publishes at most one IradOne story a day. It pulls real Central Asian news from RSS feeds, has Claude recast one story as an IradOne report set in Irad, and commits the new page; GitHub Pages then republishes the site.

## When stories go out

The workflow wakes hourly from 08:41 to 21:41 Irad Time and runs `newsroom.py due`, which costs nothing. Each day is decided once, the same way on every run: whether it is a news day, and from what time the story may go out (somewhere between 08:00 and 19:00). With the settings in `config.json` > `cadence`, stories come out most days, sometimes two days apart and occasionally three, never longer. If a news day's run finds nothing usable it tries again the next hour. Run `python newsroom/newsroom.py due --preview 14` to see the plan for the next two weeks. A manual run from the Actions tab publishes immediately.

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
| How often stories appear | `cadence` in `config.json` |
| Models, feeds, skip words | `config.json` |
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

## TV schedule

The Program Schedule on the homepage is built in the browser by `schedule.js` from `schedule.json`. Every visitor sees the same schedule for a date, because films, episodes and topics are picked by a random generator seeded with the date. Times are Irad Time; the broadcast day runs 05:00 to 05:00. The guide shows today and the next six days and marks the programme on now.

What's in `schedule.json`:

- **shows**: every programme's title, optional Iradi `subtitle`, description and optional `detail`, the line shown in blue:
  - `pool`: a daily pick from a list in `pools` (guests, topics, dishes)
  - `series`: episodes from a list, advancing each time it airs (`start` date, weekdays in `every`)
  - `serial`: numbered episodes of a daily drama, with a one-line synopsis
  - `film`: a film from `films`, seven different ones each week
  - `headline` / `headline_or_pool`: ties into the latest IradOne news story
- **grids**: the weekday, Saturday and Sunday line-ups. A slot is `{"t": "19:30", "show": "kuda"}`, or `by_day` for a different show each weekday, or `{"show": "pitch_talk", "months": [3, ...], "else": "hippodrome_weekly"}` for seasonal ones (the Irad League runs March to November).
- **specials**: dated overrides (`"date": "08-24"` yearly, `"2027-11-02"` once), Easter-relative (`"easter": -3`), the nth weekday of a month, or the first weekday after a date. Each replaces the normal programmes in its time range.

To add a show: add it under `shows`, then put its id into a grid or a special.
