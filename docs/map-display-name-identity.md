# Map display names and event identity

RJ01295905 / Living in a Nursery 1.03 uses `$dataMap.displayName` as a logic
identifier throughout CommonEvents.json. For example, common event 1022 checks
`$dataMap.displayName === "贄の儀式"` before running command 222 (fade in).
Common events 40 and 49 also compare map names for initialization and map-label
image selection. Translating that database field caused these branches to fail,
leaving transfers or cutscenes on a black screen.

The runtime no longer overwrites `$dataMap.displayName` when Scene_Map loads.
It still observes the original `map_name` key, and translates only the draw
argument passed to the standard Window_MapName. Neither database fields nor
Game_Map.displayName() are changed. Existing map-name cache entries remain valid.
Image-based map labels continue through the existing image translation system.

Regression tests cover consecutive map loads, original-name conditions during
map setup, translated window output, original data after rendering, cache-only
mode, disabled translation, missing cache entries and seen-key tracking. The
reported game's conditions were inspected read-only; live-game QA is pending.
Restart the game before retesting the transfer with translation enabled.
