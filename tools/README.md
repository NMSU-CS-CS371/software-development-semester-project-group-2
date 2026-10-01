# NMSUMapScraper — where our building data comes from

`NMSUMapScraper.java` copies NMSU's own information about a place into our two data files:

- `data/buildings.geojson` — the facts: code, address, year built, floors, position
- `data/descriptions.json` — the about text, the links under it, and the photos

Run every command **from the repo root**, not from inside `tools/`.

## Add one place

Copy the name exactly as it appears on <https://map.nmsu.edu>, and put it in quotes:

```bash
java -cp tools/gson-2.11.0.jar tools/NMSUMapScraper.java "Milton Hall"
```

If the name isn't on NMSU's map it says so and suggests the closest ones, so a typo is obvious:

```
"Jet Hall" is not on NMSU's campus map.
Did you mean:
   Jett Hall
   Kent Hall
```

Every building carries four bookkeeping fields, written above `type`:

```json
"dateAdded": "2026-09-30",
"dateUpdated": "2026-09-30",
"lastInputSource": "scraper",
"scraperStamp": "3d2407d5",
```

`lastInputSource` is what decides whether the scraper may touch that building, and **you never
set it by hand**:

- **`"scraper"` and NMSU is unchanged** — it says `already up to date` and writes nothing.
- **`"scraper"` and NMSU changed** — it rewrites the building, bumps `dateUpdated`, and says
  which fields changed, e.g. `updated: built, description`.
- **You edit any line** of a building or its description — the building stops matching its
  `scraperStamp` fingerprint, so the next run flips `lastInputSource` to `"human"`, sets
  `dateUpdated` to today, and never overwrites it again. Nothing to remember: just edit.
- **`"human"`** — left alone, every run, until someone asks for NMSU's version with `-force`.

`scraperStamp` is a short fingerprint of exactly what the scraper wrote. That's the whole trick:
when the file no longer matches the fingerprint, a person has been in there.

To take NMSU's version back (this also re-downloads a description NMSU may have rewritten, which
is otherwise only fetched once):

```bash
java -cp tools/gson-2.11.0.jar tools/NMSUMapScraper.java "Jett Hall" -force
```

`git diff data/` always shows exactly what a run changed before you commit it.

## Add every place of a kind

```bash
java -cp tools/gson-2.11.0.jar tools/NMSUMapScraper.java -all buildings
```

`-all buildings` is 288 places, `-all lots` is 129, `-all parks` is 10. There is a 4–9 second
pause between requests, so `-all buildings` takes about half an hour. It saves after **every**
place, so Ctrl-C is safe and running it again carries on where it stopped.

## See NMSU's categories

```bash
java -cp tools/gson-2.11.0.jar tools/NMSUMapScraper.java -kinds
```

Prints every category NMSU's map uses and how many places are in each. To add a kind of your own
(dining, athletics, housing), add one line to `KINDS` at the top of the file — a category's
children are included automatically.

## What you need

A JDK 17 or newer (`java -version` to check). Nothing else: no Maven, no Gradle, no compiling.
`gson-2.11.0.jar` is the only dependency and it is already in this folder.

## Being fair to NMSU's server

This matters, and it is not optional:

- One request at a time, with a random 4–9 second pause. That's the pace of a person clicking.
- An honest User-Agent naming this project.
- Every record downloaded is saved in `data/source/nmsu-map-locations.json` and **never asked for
  again**. That folder is not committed (it is in `.gitignore`); each person builds their own on
  their first run, which costs one slow startup. Nothing in the website ever reads it — the real
  data lives in `data/buildings.geojson` and `data/descriptions.json`.
- `api.concept3d.com/robots.txt` asks automated clients to stay off. We fetch each page once, at
  human pace, for a class project, and we name NMSU as the source on every building page in the
  app. If NMSU asks us to stop, we stop.

## When it breaks

**Everything returns 403** — NMSU changed the map key. Open map.nmsu.edu, press F12, go to the
Network tab, refresh, click any request to `api.concept3d.com`, and read the `key=` out of the
address. Put it in `KEY` at the top of the file.

**"Could not find data/..."** — you ran it from inside `tools/`. Go up to the repo root.

**A building has empty facts** — NMSU's Space Planning records have no entry matching that name
and position, which is normal for parks, lots and a few odd buildings. The fields are left empty
on purpose rather than guessed.
