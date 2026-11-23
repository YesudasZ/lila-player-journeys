# The data files the app loads

`make data` (`pipeline/build_data.py`) writes these files into `web/public/data/`, and they are committed. This page is the contract between the pipeline and the app. Two sets of tests hold it: `pipeline/tests/test_build_data.py` on synthetic files and `pipeline/tests/test_committed_data.py` on the committed files.

| File | What it holds | Size |
|---|---|---|
| `manifest.json` | constants, the three maps, the five day folders, totals, one line per match | 169 kB, 17 kB gzipped |
| `maps/<Map>.json` | every journey of one map as integer arrays, one journey per line | 470, 54 and 162 kB gzipped |
| `minimaps/<Map>.webp` | the minimap, 2048 pixels wide | 177, 165 and 193 kB |
| `cleaning_report.json` | rows in, rows removed per rule, rows left. The app does not need it | 1 kB |

The pipeline also writes two fixtures for the app's tests into `web/src/lib/__fixtures__/`: `projection.json`, the reference points for the projection, and `playback.json`, journeys with the head that `pipeline/playback.py` gives at many times, which holds the app to rule 4 below.

## manifest.json

| Field | Meaning |
|---|---|
| `encoding.uv_steps` | 65,535. A stored `u` or `v` is `round(u × 65,535)`; the app divides by the same number |
| `encoding.elevation_steps_per_unit` | 10. A stored `y` is elevation in tenths of a world unit |
| `sample_step_seconds` | 5. A moving player's position is recorded this often ([DATA_NOTES.md](DATA_NOTES.md), row 6) |
| `events` | the eight event names. An event's position in this list is its code in `e` |
| `event_groups` | the event codes behind each thing the app draws: `movement`, `kill`, `death`, `storm_death`, `loot`. Every code is in exactly one group |
| `fates` | every value `fate` can take |
| `maps[]` | `id`, `name`, `scale`, `origin_x`, `origin_z` (from `pipeline/maps.py`), `minimap.file`, `minimap.width`, `minimap.height` (read back from the WebP), `minimap.artwork`, `journeys_file`, and the number of `matches` and `journeys` |
| `maps[].minimap.artwork` | `left`, `top`, `right`, `bottom` of the map artwork as fractions of the image, measured from its left and top edges. The rest of the image is black surround. The app fits this box to the window. Every recorded position lies inside it |
| `days[]` | `id` (the folder name), `date`, `partial` (true for 14 Feb), `matches`. In date order |
| `totals` | the sum of each count below over all matches, and the number of matches |
| `matches[]` | one entry per match, ordered by map, then start |

### A match entry

| Field | Meaning |
|---|---|
| `id` | the first 8 characters of the match id. Unique. Always text: 14 ids are digits only (`03359228`) and 13 read as a number with an exponent (`5e373986`) |
| `map` | the map id |
| `day` | the day folder, which is consistent with the UTC day on which the match's files were written ([DATA_NOTES.md](DATA_NOTES.md), row 13). The day filter has to use this field. A match filed under two folders would belong to the later one; after cleaning there is none |
| `start` | Unix seconds, UTC, of the first recorded row. For 5 matches that started just before midnight its date is the day before `day` |
| `span` | seconds from `start` to the last row left after cleaning: 380 at the median, 887 at most. It is what was recorded, not the length of the match |
| `humans` | journeys of humans, the anonymous ones included |
| `anonymous` | of those, the journeys without an account id |
| `bots` | journeys of bots. `humans + bots` is the number of journeys of the match: one per file, once the spare copy of the journey stored twice is gone |
| `kills` | Kill and BotKill rows of human journeys: the kill markers of humans |
| `deaths` | Killed and BotKilled rows of human journeys: deaths in combat. Storm deaths are not included |
| `storm_deaths` | KilledByStorm rows of all journeys (in this dataset only humans have them) |
| `loot` | Loot rows of all journeys (in this dataset only humans have them) |
| `bot_kills`, `bot_deaths` | the rows of `kills` and `deaths`, in bot journeys |
| `rows` | all rows of the match |

Every marker is counted once: a match shows `kills + bot_kills` kill markers, `deaths + bot_deaths` death markers, `storm_deaths` storm markers and `loot` loot markers.

## maps/&lt;Map&gt;.json

`{"map": "<id>", "journeys": [...]}`. Journeys are ordered by match id; within a match humans come first, then bots by number.

| Field | Meaning |
|---|---|
| `id` | `<match>-<player>` for an identified human, `<match>-anon` for an anonymous one, `<match>-bot<number>` for a bot. Unique in the dataset and the same on every build |
| `match` | the `id` of its match entry |
| `player` | a human's public id (the first 8 characters of the account id), a bot's number, or `null` for an anonymous human. A bot number is not an identity: other matches reuse it |
| `actor` | `"human"` or `"bot"`. Never guess it from `player`: 21 human journeys carry a public id made of digits only (10 different ids) |
| `anonymous` | true for a human journey without an account id; the same as `actor` human and `player` null |
| `fate` | `killed_by_bot`, `killed_by_player`, `killed_by_storm` or `no_death_recorded` for a human; `killed`, `killed_by_storm` or `no_death_recorded` for a bot. `killed_by_player` is the README's reading of a Killed row; none of the 3 can be verified ([DATA_NOTES.md](DATA_NOTES.md), row 10) |
| `t` | seconds since the `start` of the match, never decreasing |
| `u`, `v` | position on the map, 0 to 65,535. u grows to the right, v grows upward |
| `y` | elevation, in tenths of a world unit |
| `e` | event code |

`t`, `u`, `v`, `y` and `e` have one entry per row, in time order; rows of the same second keep the order of the file.

## What the app may rely on

1. **Position.** `u = code / 65,535`; pixel `(u × width, (1 − v) × height)` on an image of any size; world `x = u × scale + origin_x`, `z = v × scale + origin_z`.
2. **Every row is a position.** Whatever its event, a row holds where the journey's owner stood in that second. Kill markers are where the killer stood, death markers where the victim fell.
3. **Path.** A journey's path is all its rows up to and including its death row. A journey has at most one death row, and no movement row after it. The 2 rows that do come after a death, both BotKill, are markers only.
4. **Playback** (assumption A6). Between two consecutive rows of the path that are at most `sample_step_seconds` apart, the head moves in a straight line. Across a longer gap it stays at the earlier row and covers the distance in the last `sample_step_seconds`. Before its first row a journey is not on the map; after the last row of its path the head stays where it is. Humans start at `t = 0`; bots at 0 or 5.
5. **Traffic** counts movement rows only. They show movement, not time spent: no position is recorded while a player stands still.
6. **Ids are text**, and `actor` alone says human or bot.
