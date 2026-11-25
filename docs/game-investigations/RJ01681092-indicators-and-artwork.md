# RJ01681092 event indicators, clock HUD and special status (2.1.72)

## Dynamic event captions

The enabled Sakura_EventIndicator v2.0.0 plugin obtains captions from event notes such as `「コンビニ」`, from setIndicator note arguments and from transfer destination map names. Its createTextOnEvent method draws directly to a canvas; ordinary RPG Maker window text hooks cannot reach it.

A dedicated generic translator scans original MapInfos, maps and common-event commands. It mirrors the native priority of Japanese quotation marks (triangle) over full/half-width parentheses (bubble), preserves authored spaces, and translates only the parsed text argument before canvas measurement and rendering. Notes, indicator syntax, map IDs, modes and character state remain original. Existing translated output is not harvested through subsequent redraws. Translation disabled leaves native behavior unchanged.

## Clock HUD: confirmed graphic

The day and period are both baked into each clock image; they are not dynamic text over a blank device. The screenshot matches the original 一日目朝.png. These files require the graphic translation workflow:

- `G:\!NEWORDER\GAMES\RJ01681092\[Kimochi] RJ01681092 64bit\img\pictures\時計\一日目夕方.png`
- `G:\!NEWORDER\GAMES\RJ01681092\[Kimochi] RJ01681092 64bit\img\pictures\時計\一日目昼.png`
- `G:\!NEWORDER\GAMES\RJ01681092\[Kimochi] RJ01681092 64bit\img\pictures\時計\一日目朝.png`
- `G:\!NEWORDER\GAMES\RJ01681092\[Kimochi] RJ01681092 64bit\img\pictures\時計\一日目深夜.png`
- `G:\!NEWORDER\GAMES\RJ01681092\[Kimochi] RJ01681092 64bit\img\pictures\時計\三日目夕方.png`
- `G:\!NEWORDER\GAMES\RJ01681092\[Kimochi] RJ01681092 64bit\img\pictures\時計\三日目昼.png`
- `G:\!NEWORDER\GAMES\RJ01681092\[Kimochi] RJ01681092 64bit\img\pictures\時計\三日目朝.png`
- `G:\!NEWORDER\GAMES\RJ01681092\[Kimochi] RJ01681092 64bit\img\pictures\時計\三日目深夜.png`
- `G:\!NEWORDER\GAMES\RJ01681092\[Kimochi] RJ01681092 64bit\img\pictures\時計\二日目夕方.png`
- `G:\!NEWORDER\GAMES\RJ01681092\[Kimochi] RJ01681092 64bit\img\pictures\時計\二日目昼.png`
- `G:\!NEWORDER\GAMES\RJ01681092\[Kimochi] RJ01681092 64bit\img\pictures\時計\二日目朝.png`
- `G:\!NEWORDER\GAMES\RJ01681092\[Kimochi] RJ01681092 64bit\img\pictures\時計\二日目深夜.png`

## Special status: confirmed graphics

The thought shown in the screenshot is an entire transparent text image. The status background also includes the fixed profile data and stat labels (including the label below the bubble). Dynamic values drawn separately do not make those labels translatable text. Exact assets:

- `G:\!NEWORDER\GAMES\RJ01681092\[Kimochi] RJ01681092 64bit\img\pictures\エロステ\…….png`
- `G:\!NEWORDER\GAMES\RJ01681092\[Kimochi] RJ01681092 64bit\img\pictures\エロステ\……あいつなら…… わたしの事、分かってくれるかな.png`
- `G:\!NEWORDER\GAMES\RJ01681092\[Kimochi] RJ01681092 64bit\img\pictures\エロステ\……ぐすっ.png`
- `G:\!NEWORDER\GAMES\RJ01681092\[Kimochi] RJ01681092 64bit\img\pictures\エロステ\ひどいよ…… アイツのこと、 信じていいのかなぁ.png`
- `G:\!NEWORDER\GAMES\RJ01681092\[Kimochi] RJ01681092 64bit\img\pictures\エロステ\やっぱり信用していいのかな.png`
- `G:\!NEWORDER\GAMES\RJ01681092\[Kimochi] RJ01681092 64bit\img\pictures\エロステ\エロステ_土台.png`
- `G:\!NEWORDER\GAMES\RJ01681092\[Kimochi] RJ01681092 64bit\img\pictures\エロステ\子宮.png`
- `G:\!NEWORDER\GAMES\RJ01681092\[Kimochi] RJ01681092 64bit\img\pictures\エロステ\子宮_精液.png`
- `G:\!NEWORDER\GAMES\RJ01681092\[Kimochi] RJ01681092 64bit\img\pictures\エロステ\家に来たのはいいけど…….png`
- `G:\!NEWORDER\GAMES\RJ01681092\[Kimochi] RJ01681092 64bit\img\pictures\エロステ\戻るボタン2.png`

Visual inspection directly confirmed 一日目朝.png, 家に来たのはいいけど…….png and エロステ_土台.png. Remaining directory entries are the variants used by the same screen. No asset replacements or text overlays were created. The engine image extractor is available for the graphic translation workflow.

## Validation

Regressions cover original-note scanning, plugin command payloads, transfer destinations, spaces, translation before native drawing, repeated output, source-only Seen keys, unchanged indicator type and disabled behavior. Original game source inspection confirmed the rendering hook and source-note syntax. This does not constitute a live game launch. No deployment, existing-cache migration, save modification or game-source edit was performed.
