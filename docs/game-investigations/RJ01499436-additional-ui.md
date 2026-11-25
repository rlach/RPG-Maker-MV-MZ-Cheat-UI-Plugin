# RJ01499436: additional translation surfaces

Game root: `G:\!NEWORDER\GAMES\RJ01499436\RJ01499436\淫呪の迷宮 ～ミラと遊蕩の主～`

## Source and rendering coverage

| Reported surface | Source / treatment |
| --- | --- |
| Guild receptionist name | `TextScriptBase.TextList`, `chara_guild`; standard speaker cache, resolved only at display |
| Dungeon tile notifications | Original common-event/map comments, `<eventNotice:...>` |
| Remaining combat log | Original Usk plugin literals and event script concatenations; stable COT templates retain names and MP values as arguments |
| Chest descriptions and outcomes | Original common-event/map display-variable expressions; standard message cache |
| Loot notification | Original event display templates, with item and count references preserved |
| Battle command explanation | Image; excluded from text translation |
| Side statistics captions | Image; excluded from text translation |
| Tips | All configured UskCsvLoader CSV records; whole UTX references are translated in the window before native expansion |
| Status biography and full name | Original `TEXT_PROFILE` literals; fixed erroneous FILE matching in PROFILE |
| Local equipment names and upgrades | Original database name cache; local instance names are translated at drawing, retaining enhancement suffixes and metadata |
| Equipment properties and evaluation labels | Original `SceneCustomMenuEx` literals, label arrays and display templates |
| Item category prefix | `TextScriptBase.TextList`, including `type_adv` |
| Item details | Original item/weapon/armor descriptions and author UI source; whole-description drawing boundary |
| Town destinations | Literal return values in `TextScriptBase.TextList` scripts; scripts are parsed, never executed by the scanner |
| Gallery collection heading | `SceneCustomMenuEx` constants |
| Colored small-box name | Original common-event script fragments, with native colors and variable values retained |

## Confirmed graphics

The following encrypted PNG files were decoded to temporary inspection files, without changing game assets. Visual inspection confirmed that the Japanese captions are baked into the images:

- `img/pictures/battle_commandRed_1.png_`: the MAGIC command and its insufficient-MP explanation.
- `img/pictures/mainframe_sexual.png_`: the side statistics captions, including experience and quantity labels.

These require replacement graphics. No text overlays or image edits were added.

## Validation and limits

- An isolated scanner probe read original enabled plugin scripts, original database files, common events and maps: 2,585 catalog entries and 36 CSV resources. This is catalog coverage, not a count of distinct untranslated cache keys.
- Unit regressions cover typed speaker/message/database keys, profile-vs-filename detection, whole multiline tips, repeated redraws, local equipment suffixes and 100 varying MP values without harvesting expanded text.
- Global PluginManagerEx conversion, original resources, identifiers, item instances and native Bitmap.drawText remain unchanged.
- No deployment, game source edits or cache migration is included.
- Live in-game acceptance remains pending for every reported screen. Source probes and isolated rendering tests do not establish that every custom window is correct in live play.
