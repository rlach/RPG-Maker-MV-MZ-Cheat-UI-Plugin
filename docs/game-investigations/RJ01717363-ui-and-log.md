# RJ01717363: UI resources and displayed message snapshots

Game root: `G:\!NEWORDER\GAMES\RJ01717363\[Kimochi] RJ01717363 64bit`

## Dynamic text coverage

| Report | Implementation / source |
| --- | --- |
| Save date and weekday | Original common-event date expressions and weekday strings; date templates retain month/day slots, and saved values are localized at drawing only |
| Main-menu date, plans, ranks and relationship captions | Original SceneCustomMenu scripts, TDog scripts and display-variable assignments from common events/maps |
| Kaho relationship value in dialogue | Translate known string-variable display values before native escape expansion, without replacing stored game variables |
| Ability names in choices, choice help and notifications | Generic MPP_MessageEX Text Set scanner and display hooks; SET IDs, icons, colors, conditions and the native text table remain original |
| PINE character status | Original event script literals, including the status/update text |
| Comments below PINE conversations | TDog_LatestChatMemory recallText command fields use standard message cache entries |
| Cheat UI text log | Resolve remaining variable/name references at the initial display snapshot; retain the snapshot when choices reopen; update the same entry when translation changes the displayed text |

Both TDog and MPP hooks cover the message window's owned converter. MPP captures its base conversion callback at plugin load, so changing Window_Base alone does not reach all message rendering routes.

## Confirmed baked image text

Original encrypted PNG assets were decoded only into temporary inspection files. Visual inspection confirmed the following text is part of the image:

- `img/parallaxes/UI4_01.png_`: main menu headings コミュ and 予定, currency unit 円, and the three portrait captions.
- `img/pictures/system/UI3_03.png_`: ステータス heading and the three radar-chart captions.
- `img/pictures/system/acc_face_suzune.png_`: Suzune's portrait caption. The corresponding `acc_face_kaho.png_` and `acc_face_himeka.png_` are the other portrait assets used by the same native menu script.
- `img/pictures/pine/acc1/0.png_`: the reported Suzune PINE conversation, including header, bubbles, read markers and sticker text.
- `img/pictures/pine/acc2/0.png_`, `img/pictures/pine/acc2/fd1-1.png_`: additional inspected PINE conversation variants.
- `img/pictures/inx/z1.png_`: the reported ramen post, likes, caption and comments.

Other conversation/post variants are stored below `img/pictures/pine/` and `img/pictures/inx/`. No image edits or replacement overlays are included.

## Validation

### Remaining display routes (2.1.65)

- Default PINE commentary is authored in nested `TDog_LatestChatMemory.defaultRecallText` parameters, not only `setLatest` commands. These paragraphs now enter the standard `message` cache and use the existing pre-expansion variable renderer, including Seen tracking of the original paragraph.
- Quest-update notifications are `MNKR_TMLogWindowMZ.addLog` commands. Loaded saves lack the session origin map; exact authored command matching now recovers their source after native ESC conversion. Unmatched saved output is left untouched and never harvested.
- The reading/gift extension in `ChangeSelectItemWindowMZ.js` builds its help separately from item descriptions. A dedicated source-catalog translator covers its labels, empty-selection notices and embedded progress templates. Reading counts remain substitutions in one canonical key.
- A temporary original-game probe verified the default Suzune commentary is collected as `message` and executed the native book-help builder: its generated output resolved both the ability label and the three-reading counter. Permanent regressions cover repeated rendering, disabled translation, stable counter keys and loaded colored notifications. This is isolated rendering validation, not a live game launch.

- Original-source scanner probe: 709 TDog display entries; found date templates, weekday strings, status text, relation captions, ability labels and plans.
- Original MPP_MessageEX and MKR_ControlCharacterEx conversion functions: the SET ability caption resolves from cache while preserving the native table; 7 translatable Text Set resources found.
- Unit regressions: 31 dates reuse one template; display-only variable translation reaches captured message conversion; repeated rendering does not harvest translations; disabling translation restores native values; log variable snapshots survive later variable changes and choice opening.
- Source and isolated rendering probes are distinct from live-game validation. Each reported screen still needs an in-game check after installing the patch and translating the newly collected entries.
- Existing game source, saves, plugin parameters, calendar/relationship state and cache files were not modified.
