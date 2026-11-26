# Objective and UI changes (2.2.9)

- Overlay size defaults to the largest dimensions allowed by the existing viewport constraints when no valid saved size exists. Saved dimensions remain authoritative; viewport clamping is unchanged.
- Variables have a session-preserved value-type filter. Types come from actual raw values, distinguishing arrays, null, strings, numbers, booleans and objects without numeric-string coercion. Available options reflect the current table.
- Quick Start shows manual capacities when manual widths are active. Show/Hide detected values optionally adds smaller, muted parenthesized detected capacities beside each size. The Base column stays bold.
- RJ01467518 uses LL_MenuScreenCustomMV. Its Objective label is a regular parameter, while its content is a quoted JavaScript expression in leftBlockValue. This is dynamic text, not an image. The translator now statically parses authored literals from all four block-value expressions, without executing expressions or changing plugin parameters. The existing Window_MenuHelp drawing boundary translates the evaluated text. Both drawing routes now share the translated-output guard so nested hooks do not track translated output as a new source.

Implementation files: CheatWindowManager.js, OverlayResize.js, TableSessionState.js, VariableValueType.js, VariableSettingPanel.js, QuickTranslationPanel.js, TextLayoutProviders.js and LLMenuScreenCustomTranslator.js. Regression tests are in tests/overlay-variables-objective.test.js.

Game sources were inspected read-only under D:\!NEWORDER\GAMES\RJ01467518\リサとえっちなむらのひと\www. No game deployment, cache migration or image modification was performed. Live game verification remains pending. After updating the engine, translate the LL MenuScreenCustom category in Mass Translation.

## Translated speaker tags (2.2.10)

The enabled Lunatlazur_ActorNameWindow plugin parses names from the displayed message. Cached translations contain tags such as `\N<Clothier>`, while the preserved original message contains `\N<服屋>`. Its name-window setter previously harvested the translated tag payload as an actor_name source.

LunatlazurActorNameWindowTranslator now resolves that payload against the preserved original message's speaker tags and their cached translations before lookup and seen tracking. Resolution requires a unique matching original name. An English name actually authored in the original message remains a valid source; this is not a language filter or a global reverse lookup. Disabled translation retains native rendering. A regression exercises translated message parsing, repeated name-window redraws, original-source preservation and disabled rendering. Existing polluted cache entries are deliberately retained; no cache migration or deletion was requested.
