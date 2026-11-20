# VisuStella core interface support (2.1.38)

Game: RJ01203748, きさらぎ駅～全員孕ますまで帰れません～v2.1.

Added a shared parameter-catalog adapter for the enabled CoreEngine, BattleCore, ItemsEquipsCore, MainMenuCore, SaveCore, FrontviewBattleUI, VictoryAftermath, FullFieldRecovery and NUUN_ItemCategory surfaces. It reads the original plugins.js configuration without evaluating scripts. Nested :str vocabulary, JSON-encoded message strings, arrayjson quotes and display literals in configured functions are harvested. Percent-parameter messages become protected dynamic templates.

| Report | Handling |
| --- | --- |
| Battle item status labels and values | ItemsEquipsCore StatusWindow vocabulary and recovery templates |
| Enemy name beneath the battler | Bitmap drawing reuses enemy_name cache |
| Victory and drop headings | VictoryAftermath Vocab parameters |
| Level/skill notification | JSON-encoded LevelUp quote text |
| Field return button showing 戻 | Confirmed raster character sheet img/characters/$戻るボタン.png_; left unchanged |
| Recovery explanation | FullFieldRecovery JSON-encoded message text |
| Item categories | ItemsEquipsCore category vocabulary and NUUN name fields |
| Save completion | SaveCore VocabSaveSuccess parameter |
| Main-menu playtime label | MainMenuCore Playtime vocabulary |
| Location-entry announcement | Bitmap/window presentation reuses map_name cache |

Source database names and gameplay data remain unchanged. Drawing and measurement use translated text; numeric and percentage values pass through. The bitmap hook also covers custom sprite labels that bypass Window_Base.

Validation: an installed-configuration probe finds 119 entries and 10 dynamic templates and confirms the reported vocabulary is present. Regression tests exercise scalar JSON decoding, nested vocabulary, scripted labels, dynamic recovery text, typed enemy/map cache reuse, numeric values and translation-off behavior. Full suite: 1064 tests pass. ESLint, registry (302 classes) and whitespace checks pass.

Live in-game screen validation remains outstanding. No game installation, saves or user caches were modified. Install via the normal script and run MT for new entries.
