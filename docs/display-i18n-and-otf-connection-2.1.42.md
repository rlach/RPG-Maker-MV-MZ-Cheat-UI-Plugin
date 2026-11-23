# DisplayI18NTexts and OTF connection recovery (2.1.42)

Game: RJ01761136, DisplayI18NTexts with data/I18NTexts.json.

The native game stores references such as \I18N[57] throughout its database, commands and events. The new source resolver expands these references using the configured source-language column before runtime cache-key creation and before batch submission. Message traversal, lookahead, speaker and choice handling receive resolved source values. Direct choice/name engine calls also resolve native references before protecting control sequences. Game dictionary rows and native IDs remain unchanged.

DisplayI18nTextsTranslator harvests all unique source-language dictionary values for MT, including strings not yet encountered. It intercepts TextManager.translate at the native display boundary and uses the cheat catalog or existing typed name/command caches. Native language selection remains authoritative when cheat translation is off. Native Game_Message getters provide resolved source values while translation is active. Cyclic references are bounded; unrelated games are unaffected.

A read-only probe compares the resolver with the installed native TextManager.translate for all 3410 dictionary rows. All values agree. There are 2196 unique nonempty source values, and the probe confirms all newly generated dictionary cache keys contain values rather than I18N references. Existing user cache files were not edited; previously stored reference-key entries are not migrated by this change.

OTF failure cause: TranslationBatchManager skipped phase finalization after an LLM connection failure. CurrentEvent releases its pending-key locks in finalizePhase, so the message window could remain blocked despite the finished request. Finalization now runs on connection failure and restores the queued original dialogue/choices while releasing pending locks. Interrupted phases retain their existing resume behavior.

Regression coverage includes source-aware typed cache keys, multi-line references, dictionary MT, native display, translation-off mode, missing/cyclic references, dry-run harvesting without technical keys, actual batch inputs, connection-failure cleanup through CurrentEvent and window canStart/startInput fallback to original text. These tests are distinct from live game validation, which remains outstanding.

No game installations, saves or user cache files were modified during development. Install with the usual script and run MT for the source values.
