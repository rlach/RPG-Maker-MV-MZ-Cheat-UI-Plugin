# Multi-game UI corrections — 2.1.25

All reported surfaces were traced to text rendering or text-bearing plugin/event
data. No raster replacements or game-installation changes are included.

| Game | Source and change | Translation action after deployment |
| --- | --- | --- |
| RJ364824 | TinyGetInfoWnd uses `<info:...>` metadata instead of the item description when present. Catalog alternate descriptions and titles; otherwise reuse the full item-description cache before native first-line display. | MT: TinyGetInfoWnd |
| RJ01369925 | MenuSubCommand already harvests `演出表示ON／OFF`. Its actual saved translation is `演出表示ON/OFF`, still Japanese. This is a translation-content issue, not a missing hook. | Edit/retranslate this cache entry; suggested English: `Effects ON/OFF`. Game cache was left intact. |
| RJ328940 | CategorySynthesis renders raw material category tokens inside parentheses. Translate the interior through command/category cache keys without modifying matching tokens. Catalog custom build labels `調理` and `基準売価`. Existing category keys for poultry and spice set are empty. | MT: CategorySynthesis and pending command/category entries |
| RJ01754981 | NotifyMessage receives variable 21, whose strings are assigned by scripts or Control Variables. Follow display-variable dependencies for MT; normalize ESC color controls to protected backslash tags and resolve expanded notification templates. | MT: Torigoya NotifyMessage |
| RJ01274594 | EnemyAnalysisSkill has custom stat labels; single-character Luck is translated only at its numeric-stat boundary. NUUN_BattleStyleEX has nested `ParamName:服耐久`. Level-up choices use string variables assigned by event 59. | MT: EnemyAnalysisSkill, ExtraGauge, Event UI text |
| RJ415215 | NUUN_SaveScreen_3's `nuun_DrawSaveContentsLcation` renders `info.mapname`. Resolve through existing map_name cache using a display copy. | Existing map translations are reused |
| RJ01064956 | ItemSort renders its sort hint on a sprite Bitmap. Catalog sort-label parameters and translate at drawing. Sorting keys and logic stay original. | MT: ItemSort |
| RJ01181572 | The reported source is `LL_InfoPopupWIndowMV showWindow 淫乱度+\V[2] 80 0 60 0`. Existing MV command support preserves the variable and coordinates; prime catalog collection for this path as well as MZ. Actual source scan finds the exact template. | MT: LL Info Popup Window |
| RJ01618268 | Troop events use BattleLogOutput OUTPUT_LOG messages. Extend the battle-log adapter to harvest these and translate before native actor-name/control expansion. | MT: MPP_SmoothBattleLog (also detected through BattleLogOutput) |

An isolated scan of actual game sources confirmed the alternate item metadata,
sort hints, analysis labels, clothing gauge label, level-up text, script-defined
notifications, LL popup template, and Hina battle-log message. Regression tests
cover display-only copies, unchanged command arguments, variable templates,
protected color controls, parenthesized category matching, and single-character
stat boundaries. Tests and source probes are not live-game rendering checks.
