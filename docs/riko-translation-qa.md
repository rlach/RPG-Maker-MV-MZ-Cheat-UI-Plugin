# RJ352933 translation compatibility

Target: Riko v1.46 + DLC 2.02 (MZ). Game source files remain unchanged.

- The custom `example/RJ352933-Tsuka.js` translator now reads the selected raw
  variable value, remembers proven source/output pairs, and only harvests known
  original random-talk strings. Unknown gab output is left alone. Its installed
  copy under the game's translation cache was updated after making a backup.
- **Riko custom UI / status / dungeon floors** scans source display templates,
  common/map scripts, SoR PushGab `arg1` payloads, system-message format strings,
  CSV script literals (parsed statically), and state `<comment:...>` text. Runtime
  hooks translate gab payloads, completed log entries and drawing arguments.
  Technical event arguments, source state notes and assets remain unchanged.
- Dungeon title text uses a protected floor display slot rather than one source
  key per number. ExternMessage 1.3 display variables also remain symbolic until
  normal rendering; technical commands retain their original variable expansion.
- ExternMessage 1.3.12 exposes a global compiler rather than the 1.1 static
  interpreter method. Both versions are supported. Scans disable immediate-script
  execution and retain symbolic variables; compiler functions are restored in
  finally blocks. A read-only probe of the actual 1.3 parser/CSV produced 6,350
  entries before deduplication, and inspected scripts/state data yielded 1,125
  additional UI entries before overlap and full map scanning.
- Removed only the console echo from MessageCheat; overlay message history stays.
- `scripts/fix-riko-description-tags.mjs` normalized 133 cached descriptions with
  a backup. Source keys and control codes stay unchanged. Bracketed display tags
  stay on one line and use compact labels: Req. Lv, Rarity, Outfit and Rank.

QA after restart: translate **ExternMessage CSV**, **Riko custom UI / status /
dungeon floors**, and random talk. Check quest/item/level-up logs, trap gabs,
paralysis details and at least two previously unseen dungeon floors. Existing
polluted or numbered cache rows are retained; new observations use stable keys.
Inspect item tag wrapping in the narrow description panel. This work was checked
with unit tests and read-only game-data probes, not a live-game playthrough.
