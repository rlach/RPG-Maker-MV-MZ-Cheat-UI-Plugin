# Reward, equipment and party labels (2.1.30)

| Game | Reported element | Source and support |
| --- | --- | --- |
| RJ01228927 | EXP gained label | NUUN_Result nested ParamName, drawn directly by private Sprite_ResultExpValue through Bitmap.drawText. Added exact catalog-label translation at that boundary. Numeric XP values remain untouched. |
| RJ01742763 | Empty equipment entry | NoEquipmentText text parameter, rendered by Window_EquipItem.drawItem. Added parameter harvesting and draw-time translation. |
| RJ01742763 | Battle-system option values | BattleSystemSelectable textTpbActive, textTpbWait and textTurnBased parameters. Added harvesting and Window_Options.statusText presentation translation. |
| RJ01742763 | Difficulty values | MNKR_Vitsuno_DifficultyMZ uses the same difficulty status-text route as Vitsuno_Difficulty. Added the MZ alias to the existing adapter. |
| RJ01742763 | Party management headings | NUUN_SceneFormation BattleMemberName and MemberName parameters. Added harvesting and draw-time translation for both headings. |
| RJ01742763 | Ohima card preview | Common event 37 uses Show Picture commands for card_23 and card_23_1. Read-only decoded inspection confirms the title, subtitle, effect description and rarity label are baked into both raster assets. No image translation was added. |

Parameter-label adapters use exact catalog entries and existing translation caches. Native option values, plugin parameter objects and gameplay state remain unchanged. The new labels are available to Mass Translate.

Validation: 1045 tests pass, ESLint passes, and all 299 translator classes are registered exactly once. Regression tests cover each text route, translation-off behavior, catalog harvesting and numeric values. A separate probe executes the installed NUUN_Result redraw function with its real plugin parameters and verifies EXP Gained plus the unchanged +46 numeric value. This is not live in-game screen validation. Game installations and user caches were not modified.
