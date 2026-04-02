---
description: "Implement a new RPG Maker plugin translator end-to-end (scan, runtime hook, seen tracking, registry wiring)"
name: "Plugin Translation"
argument-hint: "Plugin name + source code/path + sample event command (optional)"
agent: "agent"
---
Implement a new plugin translator for this codebase end-to-end, following the same architecture used by existing plugin translators.

Primary goal:
- Add a translator under cheat-engine/www/cheat/translate-engines/plugins/translators.
- Register it in cheat-engine/www/cheat/translate-engines/plugins/PluginTranslatorRegistry.js.
- Extract translatable strings from source data (maps/common events/plugin data as needed).
- Apply runtime translation safely.
- Track seen timestamps when runtime observation is possible.

Hard constraints:
- Edit only files under cheat-engine/www/cheat for implementation changes.
- Never modify user game project plugin files outside this repository.
- Preserve plugin command syntax/prefixes exactly (do not translate command tokens that must remain literal).

If information is missing, ask concise clarifying questions before coding:
1. Ask for plugin source code or file path if not provided.
2. Ask where translatable text is stored if it is not obvious from the source.
3. Ask for one concrete event JSON/sample command line if parsing format is ambiguous.

Implementation workflow:
1. Analyze existing patterns in these files first:
- cheat-engine/www/cheat/translate-engines/plugins/BasePluginTranslator.js
- cheat-engine/www/cheat/translate-engines/plugins/translators/DTextPictureTranslator.js
- cheat-engine/www/cheat/translate-engines/plugins/translators/DestinationWindowTranslator.js
- cheat-engine/www/cheat/translate-engines/plugins/translators/KmsMapActiveMessageTranslator.js

2. Create a new translator class that extends BasePluginTranslator and implement:
- getPluginName()
- getPluginLabel()
- getCacheType() with a dedicated plugin_* cache type
- prepareTranslator() + buildScanEntries()
- collectUntranslated({ panel })
- countPluginAmountSync({ panel })
- runtime integration in enablePluginTranslation() when applicable

3. Scanning rules:
- If text may appear in maps, scan all map files via $dataMapInfos + MapXXX.json loading.
- Scan common events when plugin can use them.
- Parse only the text payload; preserve non-text command structure.
- Deduplicate by cacheKey.

4. Runtime hook rules:
- Hook the narrowest stable method that observes displayed text for this plugin.
- Do not break original plugin behavior.
- Only replace text payload, never required command keywords/prefixes.

5. Seen tracking rules:
- If runtime provides getCacheKey, call markCacheKeySeen(cacheKey) at the observation point.
- Do not add type-based seen restrictions.
- Do not introduce wrapper helpers for seen unless truly necessary.
- Respect existing runtime guard behavior (shouldTrackRealtimeCacheUsage is handled by markCacheKeySeen).

6. Registry wiring:
- Add import and class entry to PluginTranslatorRegistry translatorClasses.

7. Validation:
- Run error check on changed files.
- Ensure no references remain to removed/deprecated helper methods.

Output requirements in final response:
- List files changed.
- Explain parser source (where strings are collected from).
- Explain runtime hook point.
- Confirm whether seen tracking was added and where.
- Mention any assumptions or unresolved ambiguity.
