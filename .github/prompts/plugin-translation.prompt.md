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
- precomputeCounts() + buildScanEntries()
- collectUntranslated({ runtime })
- getCachedCountsSync({ runtime })
- runtime integration in enablePluginTranslation() when applicable - be sure to return false when required objects/methods are not yet available to trigger retry logic, and return true at the end of the method when hooks are successfully applied. This ensures robust integration that waits for the right conditions and surfaces issues in logs instead of failing silently. Also, do not eat errors that can't be recovered from - either throw or return false to trigger retry, to ensure visibility of issues in logs.
- at the top of the file, add a comment block with a brief description of the plugin and any important notes about its translation (e.g. if it has special parsing requirements, where text is stored, etc.). Also include plugin version, whenever it was target for MV or MZ (if no MZ/target is mentioned it means MV). When updating existing translator to support new plugin version or another engine (For example adding MZ support to an existing MV translator), add a version note in the comment block with the new version and any important differences in translation approach for that version. We want all supported versions listed.

2.1 Lifecycle and invocation model (CRITICAL)

- `PluginTranslatorRegistry.runDetection()` only instantiates translators and runs `ensureDetection()`.
- `ensureDetection()` is where runtime hook mounting is triggered (with built-in retry via `enablePluginTranslation()`).
- Count precompute is lazy: registry calls `translator.precomputeCounts({ runtime })` only through `ensureCountsPrecomputed()`.
- `ensureCountsPrecomputed()` is invoked from:
    - object modal plugin details (`buildObjectTranslationPluginDetails`), and
    - plugin translation phase entry creation (`Plugins.createEntries`).
- `precomputeCounts()` must be idempotent and safe to call multiple times; dedupe in-flight work with a promise when scanning is expensive.
- `getCachedCountsSync()` must be synchronous and must not trigger async scans.
- Do not use or introduce `prepareTranslator()` in new translators; the canonical precompute hook is `precomputeCounts()`.

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

5. Runtime hook rules:

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

6. Seen/cache-usage tracking rules:

- ALWAYS prefer use of BasePluginTranslator resolveRuntimeTranslation. DO NOT REIMPLEMENT EXISTING FUNCTIONS WITH SLIGHT CHANGES.
- If runtime provides getCacheKey, call trackCacheKeyUsage(cacheKey) at the observation point.
- Do not add type-based tracking restrictions.
- Do not introduce wrapper helpers for tracking unless truly necessary.
- Respect existing runtime guard behavior (shouldTrackRealtimeCacheUsage is handled by trackCacheKeyUsage).

7. Registry wiring:

- Add import and class entry to PluginTranslatorRegistry translatorClasses.

8. Validation:

- Run error check on changed files.
- Ensure no references remain to removed/deprecated helper methods.
- Ensure new RPG Maker symbols introduced by the translator are declared in `types/rpgmaker-globals.d.ts`.

Output requirements in final response:

- List files changed.
- Explain parser source (where strings are collected from).
- Explain runtime hook point.
- Confirm whether seen tracking was added and where.
- Mention any assumptions or unresolved ambiguity.

9. Image handling

If user complains some of the text is not translated and code analysis shows the text is part of an image/texture do not make random solutions like overlaying text over the image. Inform user about the situation and ask for clarification on how they want to proceed. Remind user there's image extractor tools available in cheat engine that can be used to extract the text from the image, which can then be translated and re-inserted as a new image. Do not automate this process beyond existing tools.
