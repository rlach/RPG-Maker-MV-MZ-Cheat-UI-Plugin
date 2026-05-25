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
- cheat-engine/www/cheat/translate-engines/plugins/translators/TranslatorHelpers.js

IT IS VERY IMPORTANT TO NOTE EVERY FUNCTION IN BASEPLUGINTRANSLATOR AND NEVER EVER REIMPLEMENT ANY FUNCTIONALITY THAT IS ALREADY PROVIDED BY BASEPLUGINTRANSLATOR IN THE NEW TRANSLATOR. This includes but is not limited to:
findPluginEntry()
resolveRuntimeTranslation()
isRuntimeTranslationActive()
DO NOT JUST RENAME THOSE FUNCTIONS AND REIMPLEMENT THEM LOCALLY IN THE NEW TRANSLATOR. THIS CREATES FRAGMENTED CODE AND VIOLATES DRY PRINCIPLE. ALWAYS USE THE BASE CLASS IMPLEMENTATIONS FOR THESE FUNCTIONS TO ENSURE CONSISTENCY AND RELIABILITY ACROSS ALL PLUGIN TRANSLATORS.

If you compare against existing translators and find yourself needing a helper function that seems to be used across multiple translators, check TranslatorHelpers.js first and add it there if it's not already present. If you want to reuse local helpers from existing translators move it to TranslatorHelpers.js and update existing translators to use the shared helper instead of their local version. This ensures we keep translator code focused on plugin-specific logic and avoid duplication of common functionality.

Keep the implementation lean, focused and DRY. If you don't need to reimpement base class because it already provides the necessary functionality, then don't.

2. Create a new translator class that extends BasePluginTranslator and implement:

- getPluginName() (if the plugin has multiple versions/aliases, implement getPluginAliases() IN ADDITION to this to return an array of names)
- getPluginLabel()
- getCacheType() with a dedicated plugin\_\* cache type
- precomputeCounts() + buildScanEntries()
- collectUntranslated({ runtime })
- getCachedCountsSync({ runtime })
- runtime integration in enablePluginTranslation() when applicable - be sure to return false when required objects/methods are not yet available to trigger retry logic, and return true at the end of the method when hooks are successfully applied. This ensures robust integration that waits for the right conditions and surfaces issues in logs instead of failing silently. Also, do not eat errors that can't be recovered from - either throw or return false to trigger retry, to ensure visibility of issues in logs.
- at the top of the file, add a comment block with a brief description of the plugin and any important notes about its translation (e.g. if it has special parsing requirements, where text is stored, etc.). Also include plugin version, whenever it was target for MV or MZ (if no MZ/target is mentioned it means MV). When updating existing translator to support new plugin version or another engine (For example adding MZ support to an existing MV translator), add a version note in the comment block with the new version and any important differences in translation approach for that version. We want all supported versions listed.

SINCE YOU ARE OVERRIDING EXISTING CLASS DO NOT IMPLEMENT FUNCTIONS THAT YOU DON'T NEED TO CHANGE. For example if the translator doesn't have to collect any untranslated strings for mass translation do not implement async precomputeCounts() AT ALL. This applies to many other functions. DRY!

    2.1 Lifecycle and invocation model (CRITICAL)

Plugins are managed by orchestrator.

- `detectPlugin()` is called first, which in most cases doesn't need to be changed. The plugin is detected based on config files and whenever it's enabled.
- `ensureRuntimeContract()` will validate if plugin implements all methods required by the base clasee (they don't have to be overriden unnecessarily!). If any required method is missing, an error will be thrown and the translator won't be registered. This is a safety check to ensure that all translators conform to the expected interface and have the necessary methods implemented. This means you do not have to check for your own methods like `getPluginName()` or `getCacheType()` because it's already guaranteed by the base class contract. - `ensureDetection()` shouldn't be changed in most cases and SHOULD NOT be called in subsequent lifecycle methods. If plugin is not detected it's functions WILL NOT be called by the orchestrator. This means that you should not call `ensureDetection()` from `enablePluginTranslation()` or any other method, because if the plugin is not detected, those methods won't be called at all. The orchestrator guarantees that if `enablePluginTranslation()` is called, then `ensureDetection()` has already returned true at some point, so there's no need to call it again. `ensureDecection` will also run `enablePluginTranslation()` automatically when it detects the plugin and handle necessary retries.
- `enablePluginTranslation()` is where runtime hooks are applied. It's called very early at startup, and then it's retried every 100ms for many times. This means that any dependency on game objects or plugin objects must be guarded with checks and return false if not present, to trigger retry logic. Once all hooks are successfully applied, return true to prevent further retries. This means you should make all checks at the beginning of the method, then proceed to applying the hooks to avoid being in a partially applied state if an error is thrown or if some objects are missing. This also ensures that we don't apply hooks multiple times unnecessarily, which could cause performance issues or unintended side effects. The checks should be for runtime plugin related objects/methods that are required for the hooks to work, not just general game objects. For example, if the plugin adds a new window class and you need to hook a method on that class, you should check for the existence of that class and the method before applying the hook. It is very important not to return `true` from this function unless hooks were applied. If you support multiple versions of the same plugin, you can have version-specific checks and hooks within the same `enablePluginTranslation()` method, but the same rule applies: only return true if the necessary hooks for the detected version were applied successfully.
- `precomputeCounts()` is called once when user first opens Mass Translate window. This has UI loader, and the modal will wait for the data. You should compute and cache counts needed for Mass Translation so it doesn't have to be re-computed until application reload. This is where you should do any expensive scanning of plugin data to extract translatable strings and compute counts for the UI. The counts are used to show total and leftover items in the modal. Count precompute is lazy: registry calls `translator.precomputeCounts({ runtime })` only through `ensureCountsPrecomputed()`. `precomputeCounts()` must be idempotent and safe to call multiple times; dedupe in-flight work with a promise when scanning is expensive.
- `getCachedCountsSync()` must be synchronous and must not trigger async scans. It's called by the UI, that doesn't work with promises, and any expensive work here would cause UI slowdown.

- `registerPluginCustomTags()` is called when the plugin is detected, and it's used to register any custom tags for this plugin that can be used in translations. This is optional and only needed if the plugin has specific \command tags that are not covered by the default set. When plugin has tags ALWAYS register them, ALWAYS import TAG_TYPE from ai-engine/constants.js. By default set requiredConsistency to true. Mask only values which could break scripts when changed.

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
- **ABSOLUTELY NEVER** wrap functions in local helpers that simply call base class methods, especially with your own names. If you believe additional checks are needed add them in the original function in the base class, but in 99% it's already there and you're only druplicating code, which violates DRY and creates maintenance issues. If you find yourself writing a helper that just calls a base class method, stop and check if you can use the base class method directly instead.

**Required pattern:**

- Always use `this.getRuntime()` from base class. Guaranteed to be normalized and contract-complete.
- Always use `this.isUsableText(value)` for text validation. Canonical implementation in BasePluginTranslator.
- Always use `this.isRuntimeTranslationActive(runtime)` for translation state checks. Never implement locally.
- If you need a helper function, keep it focused on plugin-domain logic, NOT duplicating base infrastructure.
- Keep existing style consistent with existing translators for readability and maintainability, for example use ?. optional chaining instead of manual checks when accessing nested properties that may not exist.
- When editing existing translators and you notice local helper functions that duplicate functionality across translators, move those helpers to TranslatorHelpers.js and update all translators to use the shared helper instead of their local version. This ensures we keep translator code focused on plugin-specific logic and avoid duplication of common functionality.
- When editing files if they contain warning or style errors not related to our changes, fix those as well to keep the codebase clean.

5. Runtime hook rules:

- Hook the narrowest stable method that observes displayed text for this plugin.
- Do not break original plugin behavior.
- Only replace text payload, never required command keywords/prefixes.
- Use base APIs directly (`this.getRuntime()`, `this.isRuntimeTranslationActive(runtime)`, `this.isUsableText(value)`) and keep translator code focused on plugin-specific behavior.
- Runtime translation is allowed only when `this.isRuntimeTranslationActive(runtime)` is true; otherwise hooks must return original text/behavior unchanged.
- All real-time hooks are gated by runtime translation settings: hooks only execute when **either**:
    - `runtime.isTranslationEnabled()` returns true (user enabled "Enable Real-time Translation"), **OR**
    - `runtime.translateCacheWhenDisabled` is true (user enabled "Translate cached keys even when Real-time translation is disabled")
      You don't have to worry about this, because BasePluginTranslator provides the helper method `isRuntimeTranslationActive(runtime)` that checks these conditions for you. Just use that helper at the beginning of your hooks to determine whether to apply translation logic or return original text.
- If both flags are false/disabled, plugin-specific runtime patches must early-return without applying any hook logic (preserve original behavior).
- To check at hook time, call `this.isRuntimeTranslationActive(runtime)` (preferred canonical helper from `BasePluginTranslator`).

6. Seen/cache-usage tracking rules:

- ALWAYS prefer use of BasePluginTranslator resolveRuntimeTranslation. DO NOT REIMPLEMENT EXISTING FUNCTIONS WITH SLIGHT CHANGES.
- If runtime provides getCacheKey, call trackCacheKeyUsage(cacheKey) at the observation point.
- Do not add type-based tracking restrictions.
- Do not introduce wrapper helpers for tracking unless truly necessary.
- Respect existing runtime guard behavior (shouldTrackRealtimeCacheUsage is handled by trackCacheKeyUsage).

The goal of trackCacheKeyUsage is to show ORIGINAL KEYS in seen list, and to HARVEST NEW ORIGINAL KEYS that have not been found by Mass Translation. NEVER EVER track already translated strings, as this will duplicate entries in seen list and cause confusion. The only keys that should be tracked are ORIGINAL KEYS that are observed at runtime, which may not have been collected during scanning or may have been added by the user manually. This ensures the seen list remains clean and focused on untranslated content.

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
