# Reusable plugin tags found in Seed Presser v1.0.8

Source: the installed game's original `js/plugins/*.js`, enabled plugin manifest
and translation-cache source keys, inspected read-only. Game-specific fields
are deliberately excluded from automatic registration.

| Owner                              | Registered controls                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| TRP_Skit / TRP_SkitConfig          | Configured pose, expression, motion and animation controls (FA/PO/MA/ANI here), plus `\N<name>`               |
| MKR_ControlCharacterEx 1.2.1       | IM, SE, ME, $, N and P with square-bracket arguments, including comma-separated and nested variable arguments |
| DTextPicture                       | Dynamic I/ITEM/WEAPON/ARMOR/SKILL/STATE references, including `\WEAPON[\V[532]]`                              |
| FTKR_CustomSimpleActorStatus 3.5.3 | CSS*画像/CSS_IMAGE and CSS*カスタム/CSS_CUSTOM section identifiers and closing delimiters                     |
| FTKR_ExBattleCommand 2.2.2         | FTKR_ACTOR_COMMAND technical command arguments                                                                |
| EnemyPosition                      | PosX, PosY                                                                                                    |
| MNKR_EnemyIcon                     | MNKR_EnemyIcon icon IDs                                                                                       |
| TMEventItemEx                      | subCategory internal category IDs                                                                             |
| HzRandomChoice                     | random, timer choice markers                                                                                  |
| PermanentState 1.00                | Permanent, 永続ステート                                                                                       |
| SkillEffectScript                  | script block delimiters                                                                                       |
| FTKR_SkillCounter                  | InvalidSkillType / スキルタイプ無効化                                                                         |

Registration-only adapters live in `GeneralPluginTagsTranslators.js` and are
registered individually in `PluginTranslatorRegistry.js`. Existing TRP, DText
and FTKR CSS translators retain ownership of their own tags. Registration runs
in `enablePluginTranslation` through the shared base/AIEngine tag API. No
additional runtime harvesting, seen keys or mass-translation entries are added.
Technical arguments are masked; TRP speaker names remain translatable.

TRP now reads the separate configuration plugin and parses serialized runtime
control settings. Its speaker and control tags are submitted together because
`AIEngine.addPluginTags` replaces the entire group for one plugin owner.

Game-specific fields such as tatsuta\__, hensei_, soubiSiri, birthday, personality,
noteValue and actor-name gallery membership markers remain manual custom tags.
Scanner candidates such as X1BN/X1BC or English words following literal `\n`
are not registered as plugin commands without a matching source definition.
Registering a script section delimiter does not mask or translate its whole body.

Tests cover enabled-plugin detection, payload round trips in both LLM tag
formats, configured TRP controls before/after parameter parsing, speaker-tag
retention and nested DText database/icon references. These checks exercise the
real AIEngine tag registry; they are not a live NW.js playthrough.
