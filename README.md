# OC Retro Database

Korean retro game names, source observations and links to metadata providers. Designed for
CookingFoil and other tools that need to identify a ROM without changing its filename.

## Data model

`datasets/identities.jsonl` contains one JSON identity per line. `schema.json` describes its shape.
Titles are separate fields: `titles.ko`, `titles.en`, `titles.ja`, `originalTitle`, `romanizations`
and `aliases`. Unknown values stay null. The English field is the source's English/Latin lookup
label, not proof that it is the original-language title. `originalTitle` requires text, language
and a source. Existing filename spellings stay in aliases, with provenance when available.

An identity, a translation/mod project, a release and a content fingerprint are different things.
The schema supports official releases, fan translations, ROM hacks, homebrew, unlicensed games
and prototypes. Imported names whose category is unproven stay `unknown`. A Korean display label
does not establish Korean language support. Saved patch facts and versions are kept on release
observations. A mod can refer to a `baseGameId`; inherited base-game metadata never identifies
the mod itself. Arcade short sets retain their namespace as well as their short name.

The initial corpus combines curator-provided naming observations with Tentacle Team's XML
title lists, the sana2dang ES-KoreanLanguage-List snapshot and the kkulleong list packs
(used with the author's direct permission). The upstream commit, attribution and source
status are recorded in `sources/`.
No ROM payloads, media, API credentials, user/session records or library inventories are included.

## Build and resolve

Requires Node.js 22.13 or later. Tentacle import additionally uses Python 3's standard library.

```sh
node tools/build.mjs --input datasets/identities.jsonl --links datasets/libretro-crosswalk.jsonl --output names.sqlite
node tools/resolve.mjs --db names.sqlite --inventory inventory.json --output report.json
node tools/export-cookingfoil.mjs --db names.sqlite --output retro-ko-names.json
npm run test:unit
npm run lint
```

The inventory is an array, or `{ "items": [...] }`, with `system`, `name`, and optionally `rel`,
known full `sha256`/`sha1`, and `providerIds`. Files are never opened by the resolver. Output files
are created exclusively; existing files are not overwritten. These tools make no network calls.

Resolution order is known full hash, explicit source/verified provider ID, exact name, exact
title alias, then bounded fuzzy candidates inside one known system. Short/ambiguous names,
close runners, missing systems, sequel-number differences, changed subtitles and conflicting
localized titles require review or remain unmatched. Unknown arcade sets never use fuzzy
matching. A raw filename observation is not independent confirmation. Scores are ranking
heuristics, not probabilities; title matches do not establish patch version or achievement
compatibility. Hash prefixes and CRCs are retained as observations but are not treated as full
hash proof by this resolver.

The libretro crosswalk adds release names, serials and DAT fingerprints. A unique identity
link with one DAT ROM can add that ROM's full SHA-1 lookup. Multi-track discs remain release
references; individual audio tracks do not become whole-game hash proof. A DAT thumbnail key
is an image lookup key, not evidence that an image exists.

`openResolver()` opens SQLite read-only and reloads after file replacement or an external commit,
including WAL commits. `snapshot()` explicitly freezes one resolver for a consistent batch.

## CookingFoil compatibility

The export command writes CookingFoil's existing `{ systems, titles, folders }` Korean-name
dictionary format. It excludes ambiguous title/hash labels, filename-only observations and
known ROM hacks/homebrew/bootlegs from base-title guesses. It never renames or patches ROMs.
Arcade short sets use the separate set namespace rather than this Korean-title export.

CookingFoil can display `Korean (English) [existing patch tags]` from the separate fields. Tags
are observations of a file/release, not part of the canonical title. Use provider links to fetch
metadata by ID; retain their status (`title-unique`, `source-linked`, `verified`, `ambiguous`)
instead of upgrading a title guess into a verified link. The server adapter is maintained in
the CookingFoil repository.

## Development

Use synthetic names and disk-backed test scratch space. Branch from `origin/main`, review once,
and gate each branch push on `npm run test:unit && npm run lint && git push ...`. Never push to
`main`. Keep private snapshots, generated databases and inventories under ignored `artifacts/`
or outside the checkout. Do not deploy or modify libraries from this repository.

Code is MIT licensed. Source datasets and provider media retain their own attribution and terms;
see `SOURCES.md` and `licenses/`.
