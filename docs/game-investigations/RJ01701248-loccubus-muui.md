# Loccubus / RJ01701248 MUUI investigation (2.1.71)

## Runtime implementation

MUUI_Localization uses an original Chinese text/tag dictionary, locale variants, custom UI JSON and author script tables. The new translator collects immutable source files, unwraps localization markers before cache keys and uses native getText as the presentation boundary. Native locale indexes, raw UI configuration, scripts, variables, save data, resource paths and game language stay unchanged.

UI bindings such as `第$V(10)天` use COT templates: every day shares one key. MUUI rich-text controls are protected as captured template values. Source-only thought records in BY_GTMM use standard message cache entries; event messages, choices and speakers keep their standard namespaces. Alternate common-event locale rules map structurally aligned dialogue to the canonical source event. The shared native source resolver also normalizes direct choice/speaker cache lookups and is rooted in the game window, including access from the separate UI window. Translated redraws map back to their source without harvesting English output.

## Acceptance inventory

These are source/isolated-rendering findings; none is a claim of live-game validation.

| Screenshot | Finding |
|---|---|
| 1 Gallery | Category buttons and skip text are dynamic. The recollection heading and unlocked/completion labels are baked into 11Gallery/text.png_. Counts are dynamic. |
| 2 Gallery subsection | The selected subsection text is a dynamic MUUI binding; the return button is an image. |
| 3 Question and answers | Prompt and confirm/cancel captions are MUUI text over blank graphical frames. Covered by the translator. |
| 4 Save/load | Heading, slot labels, period, day and stat values are dynamic MUUI/save-list text. The decorative frame and return button are images. |
| 5 Main-menu buttons and colored notifications | Menu buttons are images. Toast content is dynamic; colors/icons remain native. |
| 6 Estate locations and date | Location plaques are images. Date is a dynamic template. |
| 7 Device tooltips | The reported extraction tooltip is baked into tip-cq.png_; the other tooltips use companion image files. |
| 8 Options | Volume headings and Language caption are baked into 9xitong/text.png_. Current language name and numeric values are dynamic; return is an image. |
| 9 Research upgrades | Research names, descriptions and costs are dynamic text. Graphical device controls and illustrations stay unchanged. |
| 10 Cinema | Category tags and film data are dynamic. The cinema heading and footer captions are baked into 3fangyin/text.png_. |
| 11 Thought bubble | Text is authored in the BY_GTMM thought table, now collected as message. The bubble itself is a graphic. |
| 12 Stats | Stamina/spirit/desire/self-esteem/fear captions are baked into 2dl/dl1/text.png_. Gauges and numbers are separate. |
| 13 Item category | Material/category captions are dynamic text supplied by item/list data and the original localization dictionary. |
| 14 Warehouse | Warehouse heading and item/quantity captions are baked into 7cangku/text.png_. Inventory entries and quantities are dynamic. |
| 15 Alchemy | Alchemy and required-material headings are baked into 5lianjin/text.png_. Actual recipe/item text is dynamic. |
| 16 Supply station | Heading is baked into 6bujizhan/text.png_. Item/list values are dynamic. |
| 17 Estate upgrade dialog | Upgrade title, description, cost and confirm/cancel captions are dynamic MUUI text. |
| 18 Locked upgrades | The repeated locked labels are explicit text components (`#未解锁#`), not part of the device images. |
| 19 Dungeon upgrade | Shame-training and locked captions are explicit dynamic text. Their backgrounds remain images. |

## Exact image paths

The following original encrypted PNGs were inspected visually or are image components explicitly referenced by the corresponding original UI layout. No images were edited and no overlays were added. A graphic designer must handle the baked text; the engine image extractor can be used for that workflow.

- `G:\!NEWORDER\GAMES\RJ01701248\Loccubus\img\menus\11Gallery\text.png_`
- `G:\!NEWORDER\GAMES\RJ01701248\Loccubus\img\menus\all\NN_FH.png_`
- `G:\!NEWORDER\GAMES\RJ01701248\Loccubus\img\menus\9xitong\text.png_`
- `G:\!NEWORDER\GAMES\RJ01701248\Loccubus\img\menus\2dl\dl1\text.png_`
- `G:\!NEWORDER\GAMES\RJ01701248\Loccubus\img\menus\3fangyin\text.png_`
- `G:\!NEWORDER\GAMES\RJ01701248\Loccubus\img\menus\5lianjin\text.png_`
- `G:\!NEWORDER\GAMES\RJ01701248\Loccubus\img\menus\6bujizhan\text.png_`
- `G:\!NEWORDER\GAMES\RJ01701248\Loccubus\img\menus\7cangku\text.png_`
- `G:\!NEWORDER\GAMES\RJ01701248\Loccubus\img\menus\1main\N_ck.png_`
- `G:\!NEWORDER\GAMES\RJ01701248\Loccubus\img\menus\1main\N_ky.png_`
- `G:\!NEWORDER\GAMES\RJ01701248\Loccubus\img\menus\1main\N_lj.png_`
- `G:\!NEWORDER\GAMES\RJ01701248\Loccubus\img\menus\1main\N_bjz.png_`
- `G:\!NEWORDER\GAMES\RJ01701248\Loccubus\img\menus\1main\N_fyt-off.png_`
- `G:\!NEWORDER\GAMES\RJ01701248\Loccubus\img\menus\1main\N_dxjl.png_`
- `G:\!NEWORDER\GAMES\RJ01701248\Loccubus\img\menus\1main\N_XTbc.png_`
- `G:\!NEWORDER\GAMES\RJ01701248\Loccubus\img\menus\1main\N_XTsz.png_`
- `G:\!NEWORDER\GAMES\RJ01701248\Loccubus\img\menus\1main\N_XTdq.png_`
- `G:\!NEWORDER\GAMES\RJ01701248\Loccubus\img\menus\1main\tip-cq.png_`
- `G:\!NEWORDER\GAMES\RJ01701248\Loccubus\img\menus\1main\tip-cc.png_`
- `G:\!NEWORDER\GAMES\RJ01701248\Loccubus\img\menus\1main\tip-cj.png_`
- `G:\!NEWORDER\GAMES\RJ01701248\Loccubus\img\menus\1main\tip-gb.png_`
- `G:\!NEWORDER\GAMES\RJ01701248\Loccubus\img\menus\1main\tip-next.png_`

Hover/selected variants and existing _ja images in the same directories may also require artwork replacement. The blank gallery button and confirmation backgrounds were inspected: their visible captions are separate text components and are not listed as baked labels.

## Validation

The full original-source probe found approximately 4,900 entries (including about 4,000 standard message entries and 44 templates), confirmed representative reported labels and executed the original native getText/_doGetText/_resolveTags functions through the translator hook. Permanent regressions cover identifiers versus values, rich controls, numeric templates, alternate locale events, thought namespaces, redraws, source-only tracking, disabled translation, resource preservation and shared-window source resolution.

No deployment, existing-cache migration, game-source edit, asset edit or save edit was performed. Each screen requires an in-game check after installation and MT; the findings above distinguish dynamic text from artwork explicitly.
