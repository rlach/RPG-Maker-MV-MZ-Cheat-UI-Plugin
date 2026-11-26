# RJ01722799 custom UI translation

## Source investigation

Inspected the original enabled plugins and data in `G:\!NEWORDER\GAMES\RJ01722799\[Kimochi] RJ01722799 64bit` read-only. The reported text is dynamically rendered, rather than baked into graphics.

`MyGameSuiteTranslator` covers the author suite: My_Core, My_Puzzle, My_QTE, My_ScenarioEngine, My_QuestEngine, My_StealthChase, My_MapStageComposite, My_ShopOnce, My_ForestLife and My_MapConversation. A separate reusable `WindowsetMenuTranslator` covers WindowsetMenu and WindowsetBuilder.

| Reported surface          | Source and presentation boundary                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Help menu                 | Original JavaScript labels, speeches and descriptions; ForestGuidePanel.wrap translates complete paragraphs before native wrapping.      |
| HUD and overhead labels   | Original JavaScript templates and ForestLabel event notes; Bitmap drawing. Existing label sprites are invalidated after source scanning. |
| Development and shop menu | Original suite source and visible rules fields, including names, supplies and descriptions.                                              |
| Daily summary             | Original concatenated text templates with protected dynamic values.                                                                      |
| Minigames                 | Entire enabled suite source scan, including Puzzle, QTE and StealthChase; Bitmap and direct canvas fillText/measureText hooks.           |
| Harvest notifications     | Original say/message expressions; standard message cache with protected item and quantity substitutions.                                 |

Original manifest parameters and owned MZ plugin commands are scanned without evaluating game JavaScript. Windowset's callScene command only carries a scene symbol and needs no text extraction. Display fields are collected without changing identifiers, assets, rewards, rules or save data. Names use actor_name storage and speaker pending entries; dialogue and choices use their standard cache types. Presentation uses the shared runtime resolver and its seen tracking. Translated output is never re-collected as a source.

## Validation and limits

Regression coverage checks immutable source collection, dynamic harvest substitutions, standard cache namespaces, repeated translated redraws, disabled translation, private guide wrapping and direct canvas rendering. An additional read-only probe scanned the actual game sources. Full tests, formatting, lint and translator registry checks were run. The duplicate checker has pre-existing findings; this change must not increase that baseline.

No game files were modified, no caches were migrated or deleted, and no deployment was performed. Live game interaction remains unverified. After updating the engine, run Mass Translation for the detected My suite and Windowset categories, together with standard messages, choices and names.

## Appended development guidance (2.2.11)

The remaining Japanese sentences are dynamic guide text. ForestLife appends the availability instruction and exploration advice to other descriptions at runtime. The original catalog and the game's existing cache already contain both sentences, but a combined description may not match one complete source entry. Native character wrapping then destroys the original line identity.

MyGameSuiteTranslator now resolves original newline-separated blocks before native guide wrapping, including original lines left inside a whole-description template's dynamic capture. It uses only lines present in the original input for that fallback; translated results are not harvested as new sources. Regression coverage includes concatenated guidance, a partially resolved description template, repeated translated output and translation-disabled behavior. No new translation of the already-cached reported sentences is necessary.
