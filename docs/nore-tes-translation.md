# Nore TES scenario translation

The Nore_Tes MZ port used by RJ01036605 (March 2023 release) runs compiled event
command lists from `scenario/Scenario.json` through `$dataScenario`. These lists
are outside standard map and common-event scans. The `scenarioFolder` parameter
points at authoring sources, not the compiled runtime database.

The existing Saba SimpleScenario translator now detects Nore_Tes, including
subdirectory plugin names. Its Mass Translation category is **Saba SimpleScenario
/ Nore TES**. It reads the loaded scenario database first, then uses Nore's
`DataManager.loadScenarioFile` or the correct scenario URL if needed. Saba keeps
its original data-directory loader.

Shared event-command traversal collects complete multiline messages, portrait
messages, speakers, choices and scrolling text. Standard cache types are retained
so translations harvested during play remain usable. Runtime observation at
`Game_Interpreter.command101` tracks the same original message keys without
changing scenario commands; normal engine message rendering applies translations.
Mass Translation counts and collection now accept the registry's `runtime`
argument rather than the obsolete `panel` argument.

Validation includes regression tests for detection, loading paths, multiline key
parity, deduplication, cached counts and disabled runtime observation. A read-only
probe of the supplied game's compiled database found the exact reported dialogue.
No game files were changed and no live-game playthrough was performed.

QA: restart the game, run Mass Translation for **Saba SimpleScenario / Nore TES**,
and revisit previously unseen scenario dialogue and choices.
