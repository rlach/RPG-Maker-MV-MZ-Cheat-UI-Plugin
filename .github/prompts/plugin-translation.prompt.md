---
description: 'Implement a new RPG Maker plugin translator end-to-end (scan, runtime hook, seen tracking, registry wiring)'
name: 'Plugin Translation'
argument-hint: 'Plugin name + source code/path + sample event command (optional)'
agent: 'agent'
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
- Plugin translators must stay clean: no local runtime typeguards/helpers for internal runtime contracts.
- Runtime/type safety for plugin translators is guaranteed by BasePluginTranslator + registry startup normalization.
- If new RPG Maker globals/classes are used, update `types/rpgmaker-globals.d.ts` in the same task.

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
- getCacheType() with a dedicated plugin\_\* cache type
- prepareTranslator() + buildScanEntries()
- collectUntranslated({ panel })
- countPluginAmountSync({ panel })
- runtime integration in enablePluginTranslation() when applicable

3. Scanning rules:

- If text may appear in maps, scan all map files via $dataMapInfos + MapXXX.json loading.
- Scan common events when plugin can use them.
- Parse only the text payload; preserve non-text command structure.
- Deduplicate by cacheKey.
- Before creating any new helper function, check `cheat-engine/www/cheat/translate-engines/plugins/translators/TranslatorHelpers.js` and reuse helpers from there.
- For JSON parsing in translators, always import and use `parseJsonSafely` from `TranslatorHelpers.js`.
- Do not re-implement local `parseJsonSafely`/`safeParseJSON` variants in translator files.

4. Base class method inheritance (CRITICAL - NO EXCEPTIONS):

**ABSOLUTE PROHIBITION:**
- **NEVER override `getRuntime()` from BasePluginTranslator.** The base implementation is canonical, handles all edge cases, and ensures runtime contracts are normalized. Overriding it breaks this guarantee and causes inconsistencies across the plugin ecosystem.
- **NEVER implement helper functions that duplicate base class methods** (`isUsableText()`, `getRuntime()`, or any other method from BasePluginTranslator). This violates DRY principle and creates fragmented code.
- **NEVER add local runtime typeguards or wrapper helpers** (`resolveRuntime`, `isRuntimeTranslationActive`, `typeof runtime.method === 'function'` checks). BasePluginTranslator provides all required contract enforcement.

**Required pattern:**
- Always use `this.getRuntime()` from base class. Guaranteed to be normalized and contract-complete.
- Always use `this.isUsableText(value)` for text validation. Canonical implementation in BasePluginTranslator.
- Always use `this.isRuntimeTranslationActive(runtime)` for translation state checks. Never implement locally.
- If you need a helper function, keep it focused on plugin-domain logic, NOT duplicating base infrastructure.

4. Runtime hook rules:

- Hook the narrowest stable method that observes displayed text for this plugin.
- Do not break original plugin behavior.
- Only replace text payload, never required command keywords/prefixes.
- Use base APIs directly (`this.getRuntime()`, `this.isRuntimeTranslationActive(runtime)`, `this.isUsableText(value)`) and keep translator code focused on plugin-specific behavior.
- Runtime translation is allowed only when `this.isRuntimeTranslationActive(runtime)` is true; otherwise hooks must return original text/behavior unchanged.
- All real-time hooks are gated by runtime translation settings: hooks only execute when **either**:
    - `runtime.isTranslationEnabled()` returns true (user enabled "Enable Real-time Translation"), **OR**
    - `runtime.translateCacheWhenDisabled` is true (user enabled "Translate cached keys even when Real-time translation is disabled")
- If both flags are false/disabled, plugin-specific runtime patches must early-return without applying any hook logic (preserve original behavior).
- To check at hook time, call `this.isRuntimeTranslationActive(runtime)` (preferred canonical helper from `BasePluginTranslator`).

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
- Ensure new RPG Maker symbols introduced by the translator are declared in `types/rpgmaker-globals.d.ts`.

Output requirements in final response:

- List files changed.
- Explain parser source (where strings are collected from).
- Explain runtime hook point.
- Confirm whether seen tracking was added and where.
- Mention any assumptions or unresolved ambiguity.
