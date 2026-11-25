# RJ01248810 translation investigation (2.1.66)

## Dynamic HUD

The sidebar level captions come from the enabled ExtraWindow plugin's WindowList.Text parameter. Its cached English template still contains the authored actor names. ExtraWindowTranslator now resolves those remaining literal captions using canonical actor_name entries before native escape expansion. The whole template retains its existing plugin_extra_window identity, variable levels remain live, and the temporary display template is restored in finally. No game data or cache repair is included.

## Battle enemy names

The original Game_Enemy.originalName returns this.enemy().name. The engine applies enemy_name translations to that database field. The installed cache explicitly contains `ゴブリン: ゴブリン`, as well as unchanged values for several other enemies. This is a cached translation result, not a missing battle-log route. Re-translate the enemy_name entries with overwrite; ordinary missing-entry MT will skip these populated keys. The actor_name cache contains the correctly translated party names and is a different namespace.

## Confirmed image text

The original encrypted PNGs were decoded to temporary repository files for visual inspection only. The reported text is baked into these assets and must be handled by the graphic translation workflow, without runtime overlays:

- `D:\!NEWORDER\GAMES\RJ01248810\宿屋の店主と亜人奴隷～安宿の収入では暮らせないのでダンジョンでも稼ぐことにした～\img\pictures\1_Menu.png_`
- `D:\!NEWORDER\GAMES\RJ01248810\宿屋の店主と亜人奴隷～安宿の収入では暮らせないのでダンジョンでも稼ぐことにした～\img\pictures\1_Save.png_`
- `D:\!NEWORDER\GAMES\RJ01248810\宿屋の店主と亜人奴隷～安宿の収入では暮らせないのでダンジョンでも稼ぐことにした～\img\pictures\1_Load.png_`
- `D:\!NEWORDER\GAMES\RJ01248810\宿屋の店主と亜人奴隷～安宿の収入では暮らせないのでダンジョンでも稼ぐことにした～\img\pictures\1_Option.png_`
- `D:\!NEWORDER\GAMES\RJ01248810\宿屋の店主と亜人奴隷～安宿の収入では暮らせないのでダンジョンでも稼ぐことにした～\img\pictures\day_9_popw.png_`
- `D:\!NEWORDER\GAMES\RJ01248810\宿屋の店主と亜人奴隷～安宿の収入では暮らせないのでダンジョンでも稼ぐことにした～\img\pictures\Map_Glassland.png_`
- `D:\!NEWORDER\GAMES\RJ01248810\宿屋の店主と亜人奴隷～安宿の収入では暮らせないのでダンジョンでも稼ぐことにした～\img\pictures\Map_Glassland2.png_`

The first four files are the sidebar buttons; day_9_popw contains にちめ; both Map_Glassland variants contain グラスランド. The number next to the day label is separate dynamic text.

## Validation

Regression coverage verifies partially translated templates reuse actor_name, repeated draws track only original keys, source fields remain unchanged, and disabling translation restores native output. Full automated checks are separate from live-game validation. No deployment, game-source edit, or existing-cache edit was performed.
