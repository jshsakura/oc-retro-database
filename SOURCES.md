# Sources and provenance

| Source | Role | Included material |
| --- | --- | --- |
| Curator-provided Game-and-What / CookingFoil corpus | Korean/Latin naming observations, existing hashes, saved patch facts | Names, aliases and identification facts; no operating inventories |
| Kkul naming lists (꿀렁리스트) | Curator reports permission obtained from the author | Naming observations already incorporated in the curator corpus |
| Tentacle Team, romlistkr | Korean display labels and ROM filename aliases | Title/path observations from the pinned XML commit, MIT licensed |
| sana2dang ES-KoreanLanguage-List | Tentacle-derived Korean display labels (AttractMode-era full lists) | Names and filename aliases from the pinned commit; no explicit license file, Tentacle attribution preserved |
| FBNeo set table used by CookingFoil | Arcade short-name and parent namespace | Set names, descriptions, parent relation and curated display labels |
| LaunchBox cache | Metadata identity crosswalk | Existing IDs and link status; no descriptions or media payloads |
| ScreenScraper IDs recorded in source XML | Explicit source crosswalk | Recorded IDs only; no API access or credentials |
| libretro-database No-Intro/Redump metadata | Release and image lookup crosswalk | Names, serials, DAT fingerprints and candidate identity links |

Tentacle upstream: https://github.com/tentacleteam/romlistkr

Required Tentacle attribution: Tentacle Team, https://cafe.naver.com/raspigamer

The Tentacle source license is preserved in `licenses/tentacle-romlistkr-MIT.txt`.
Its display-name translation must not be interpreted as a Korean translation patch.

The sana2dang ES-KoreanLanguage-List snapshot is a Tentacle-derived list. Its labels are stored as
alternate observations with provenance; they never override the 2024 Tentacle titles, and its arcade set
names stay in their own namespace. The repository carries no explicit license file, so the Tentacle Team
attribution from its README is preserved here.

libretro upstream: https://github.com/libretro/libretro-database

`datasets/libretro-crosswalk.jsonl` is derived from the pinned upstream No-Intro/Redump metadata
and is distributed under CC BY-SA 4.0 with attribution to libretro and its upstream data
contributors. The license is preserved in `licenses/libretro-database-CC-BY-SA-4.0.txt`.
The crosswalk is separate from the code's MIT license. Image lookup keys do not establish media
availability, and no thumbnails or ROM payloads are copied.

The initial Latin lookup labels were collected from filenames and source columns; they can
include romanized Japanese. They are not automatically original titles or verified English
release titles. The model stores original-language titles separately for source-backed additions.

Future provider imports (libretro thumbnail availability, IGDB alternative names/external IDs,
GameTDB, RetroAchievements and mod project catalogs) must
record source, revision and identity level. A provider's base-game page must not silently become
proof of a mod's identity, release version, language support or achievement compatibility.
