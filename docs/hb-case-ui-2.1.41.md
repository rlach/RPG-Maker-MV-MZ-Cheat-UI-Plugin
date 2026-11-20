# HB case interfaces (2.1.41)

Game: RJ01403056 / NTR_CASE03 (MV).

Added HbCaseUiTranslator for HB_SNS, HB_SceneMenu, HB_HStatus, HB_HparamWindows, HB_HresultWindow, HB_MapPlayerStatusWindow, HB_WindowRelationshipGauge, HB_Variables, HB_Notifier and HB_ChoiceUI.

Reported surfaces:

- Main-menu information: source literals, variable-assigned display strings, weekdays, objective and location text are harvested and resolved at rendering/escape expansion.
- Status screens: fixed labels and dynamic result templates are collected from HB sources.
- SNS: group/topic/poster display names and complete post text are harvested from event assignments and Show Text blocks. Native SNS recording repurposes Show Text into posts. Complete posts are translated on display-only topic/post copies before native rendering. Routing names, stored posts and gameplay identifiers remain original. Bubble height follows the translated line count using the native line-height formula.
- Character overlays: source parameter labels and expanded temporary display variables are resolved without writing translated values into game variables.
- Stat-change and activity results: labels and dynamic templates are collected from the same plugin family.

Main-menu command buttons are raster assets Menu_Cmd_*. Read-only inspection of Menu_Cmd_Item confirms the Japanese label is baked into the image. Those buttons were left unchanged. Other loaded background and character images were not edited.

The adapter reuses existing message cache values to avoid retranslating ordinary dialogue already covered by the standard pipeline. Source tables and event scripts are parsed, never evaluated or rewritten.

Validation: 1069 tests pass, ESLint and registry (303 classes) pass. Targeted tests cover group/topic assignments, complete SNS post discovery, weekdays, temporary-value expansion, stat labels, numeric preservation, display-copy rendering, unchanged routing/state and translation-off behavior. A read-only source/event probe confirms the reported SNS and stat strings are harvested; no event-script parse failures occurred. Live screen validation remains outstanding.

No game installations, saves or user caches were modified. Install with the normal script and run MT to populate newly harvested UI/SNS keys.
