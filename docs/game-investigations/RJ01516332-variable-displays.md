# RJ01516332 menu and status variable displays (2.2.13)

## Diagnosis

Inspected the enabled plugins and original source in `D:\!NEWORDER\GAMES\RJ01516332\花の女神ウルル` read-only. The reported fields are dynamic text. The existing variable translation settings already list the user's chosen IDs; no configuration changes are necessary.

- Main menu: TMMenuLabel reads variables with labelValue, then draws their raw values directly. This bypasses standard escape conversion.
- Special status: CBR_EroStatus (MZ, 2023-12-08 revision) has its own variable/script parser inside refresh. It bypasses Window_Base escape conversion and measures its text before drawing. That same refresh also expands variables into image filenames, so wrapping the entire refresh in a variable-display context would be unsafe.
- Save/load already uses the working localized variable presentation path and is unchanged.

## Change

TMMenuLabelTranslator resolves positive variable IDs in the shared display context immediately before drawing their values. Negative IDs used for numeric counters retain native behavior. Its initial constructor rendering is refreshed through the existing first-open hook.

CbrEroStatusTranslator temporarily copies only the active page's text records and protects display-variable references with private tokens. The existing variable getter resolves values under the normal safe-ID/cache/enabled rules. Tokens are restored only after plugin text translation, at measurement and drawing. Image records and script expressions remain original, and the original text-record array and nested token state are restored in finally. Translated variable output is not passed back into the script parser or collected as new source text. No source values, save data or cache entries are changed.

Implementation: TMMenuLabelTranslator.js, CbrEroStatusTranslator.js and CbrVariableText.js. Regression tests in tests/menu-status-variable-display.test.js cover first-open menu rendering, unsafe variables, numeric counters, repeated redraws, measurement, script/image safety, escaped references, failure cleanup and disabled translation.

No game edits or deployment were performed. Live game interaction remains unverified. Existing variable_value cache entries should work after updating and restarting the game; another variable translation run is not required for already-cached values.
