# Karla UI and YEP victory refresh compatibility

## RJ01744962: late victory refresh

The reported state (`_tick = 15`, openness 255, remaining queue `[DROPS]`) is consistent with a completed EXP animation. `BattleManager._phase = turn` is normal for YEP, which tracks victory separately using `_victoryPhase`.

YEP_VictoryAftermath v1.07 inherits a selectable-window refresh that clears all contents and draws actor portraits only. EXP data is painted separately by updateTicks, which stops repainting permanently at the last tick. A later refresh therefore produces the reported portraits-only screen. The unit regression reproduces that state at tick 15.

The translator now preserves native refresh and redraws gauges at the existing finite tick, including partial animation values. Constructor refresh (before `_tick` initialization) and translation-disabled behavior remain native. The patch never calls processVictory, gainRewards or changes actor EXP/tick/phase. The specific live trigger for the late refresh has not been observed; in-game confirmation is still required, especially for the reported intermittent pauses.

## RJ01319798: original UI sources

Root: `D:\!NEWORDER\GAMES\RJ01319798\magical_warrior_karla`.

The labels above characters/locations are graphic character sheets. The reported king label was confirmed in `img/characters/!$説明文字2.png_` (Map007 event 88). Related original sheets are:

- `img/characters/!$説明文字1.png_`
- `img/characters/!$説明文字2.png_`
- `img/characters/!$説明文字3.png_`
- `img/characters/!$説明文字4.png_`
- `img/characters/!$説明文字5.png_`

No image edits or text overlays were added.

The custom menu, map-name window, status and companion UI use the TOMOMI author suite. The dedicated source-catalog translator scans enabled original TOMOMI plugin sources and owned original display-variable assignments: menu goal variable from VariableId (2 here), status variables 69 and 75. It also collects original map captions using standard map_name keys. Other event-variable assignments and conditional branches remain untouched. The read-only source probe found 151 distinct entries and confirmed the reported goal, menu labels, status label and virgin-status value.

All translations happen at the shared drawing boundary. Variables and game conditions retain their original strings; no game-source or cache files were modified. Whole-suite static source coverage includes the custom result, travel, shop and other enabled TOMOMI display text. Final layout and live-game behavior remain to be verified after deployment.
