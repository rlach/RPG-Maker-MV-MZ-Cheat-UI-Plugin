import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../js/translation-runtime/ObjectTranslationModalMethods.js';

// Matches a string literal assignment at the end of a script line, e.g.:
//   $gameVariables.value(...)[n] = "text here";
// Captures: group 1 = prefix up to and including the opening quote,
//           group 2 = raw literal content (escape sequences kept as-is),
//           group 3 = closing quote + tail
const SCRIPT_STRING_ASSIGN_RE = /(=\s*")((?:[^"\\]|\\.)*?)("\s*;?\s*)$/;

// Minimum heuristic: at least one non-ASCII character, so purely ASCII
// identifiers / short literals are not sent for translation.
function looksTranslatable(text) {
    return Array.from(String(text || '')).some((char) => char.charCodeAt(0) > 0x7f);
}

function escapeForJsStringLiteral(translated) {
    // Keep plugin escape codes intact, but normalize physical newlines so the
    // generated script line remains a valid JS string literal.
    return String(translated)
        .replace(/\r\n/g, '\\n')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\n')
        .replace(/"/g, '\\"');
}

function toRuntimeNewlineText(text) {
    return String(text || '')
        .replace(/\\r\\n/g, '\r\n')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r');
}

function toEscapedNewlineText(text) {
    return String(text || '')
        .replace(/\r\n/g, '\\n')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\n');
}

function buildLookupSourceCandidates(sourceText) {
    const normalized = String(sourceText || '');
    const runtimeVariant = toRuntimeNewlineText(normalized);
    const escapedVariant = toEscapedNewlineText(normalized);
    const unique = new Set([normalized, runtimeVariant, escapedVariant]);
    return Array.from(unique).filter((item) => item && item.trim());
}

function resolveCachedTranslation(runtime, sourceText, cacheType) {
    const candidates = buildLookupSourceCandidates(sourceText);

    for (const candidate of candidates) {
        const cacheKey = runtime.getCacheKey(candidate, cacheType);

        runtime.trackCacheKeyUsage(cacheKey);

        if (!runtime.hasUsableCacheValue(cacheKey)) {
            continue;
        }

        const translated = runtime.translationCache.get(cacheKey);
        if (typeof translated !== 'string' || !translated.trim()) {
            continue;
        }

        return {
            translated,
            cacheKey,
            sourceCandidate: candidate,
        };
    }

    return null;
}

export class YEPCoreEngineScriptTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'YEP_CoreEngine';
    }

    getPluginLabel() {
        return 'YEP CoreEngine (Script Text)';
    }

    getCacheType() {
        return 'plugin_yep_core_script';
    }

    // -------------------------------------------------------------------------
    // Runtime hook
    // -------------------------------------------------------------------------

    enablePluginTranslation() {
        const translator = this;

        if (
            !window.Game_Interpreter ||
            !Game_Interpreter.prototype ||
            typeof Game_Interpreter.prototype.command355 !== 'function'
        ) {
            return;
        }

        const cacheType = this.getCacheType();
        const original = Game_Interpreter.prototype.command355;

        Game_Interpreter.prototype.command355 = function () {
            try {
                const runtime = translator.getRuntime();

                if (runtime) {
                    // Translate the 355 line (first line of the script block)
                    YEPCoreEngineScriptTranslator._translateCommandParam(
                        this._list,
                        this._index,
                        runtime,
                        cacheType
                    );

                    // Translate following 655 continuation lines (without advancing
                    // this._index — let the original do that)
                    let lookAhead = this._index + 1;
                    while (
                        lookAhead < this._list.length &&
                        this._list[lookAhead] &&
                        Number(this._list[lookAhead].code) === 655
                    ) {
                        YEPCoreEngineScriptTranslator._translateCommandParam(
                            this._list,
                            lookAhead,
                            runtime,
                            cacheType
                        );
                        lookAhead++;
                    }
                }
            } catch (error) {
                console.warn(
                    '[YEPCoreEngineScriptTranslator] Failed to apply script translation',
                    error
                );
            }

            return original.call(this);
        };

        const applyGameVariableRefresh = (reason) => {
            try {
                const runtime = translator.getRuntime();
                const stats = YEPCoreEngineScriptTranslator.applyCachedTranslationsToGameVariables(
                    runtime,
                    cacheType
                );

                if (stats.replaced > 0) {
                    console.log(
                        `[YEPCoreEngineScriptTranslator] Applied ${stats.replaced} cached variable translations during ${reason}`
                    );
                }
            } catch (error) {
                console.warn(
                    `[YEPCoreEngineScriptTranslator] Failed to refresh translated variable values during ${reason}`,
                    error
                );
            }
        };

        if (
            window.DataManager &&
            typeof DataManager.extractSaveContents === 'function' &&
            !DataManager._cheatYepCoreExtractSaveContents
        ) {
            DataManager._cheatYepCoreExtractSaveContents = DataManager.extractSaveContents;
            DataManager.extractSaveContents = function (contents) {
                DataManager._cheatYepCoreExtractSaveContents.call(this, contents);
                applyGameVariableRefresh('extractSaveContents');
            };
        }

        if (
            window.Scene_Map &&
            Scene_Map.prototype &&
            typeof Scene_Map.prototype.onMapLoaded === 'function' &&
            !Scene_Map.prototype._cheatYepCoreOnMapLoaded
        ) {
            Scene_Map.prototype._cheatYepCoreOnMapLoaded = Scene_Map.prototype.onMapLoaded;
            Scene_Map.prototype.onMapLoaded = function () {
                Scene_Map.prototype._cheatYepCoreOnMapLoaded.call(this);
                applyGameVariableRefresh('sceneMap.onMapLoaded');
            };
        }
    }

    /**
     * Mutates _list[idx].parameters[0] in-place by replacing the first string
     * literal assignment's value with its cached translation.
     * Also marks the cache key as seen.
     */
    static _translateCommandParam(list, idx, runtime, cacheType) {
        const cmd = list[idx];
        if (!cmd || !Array.isArray(cmd.parameters)) {
            return;
        }

        const line = String(cmd.parameters[0] || '');
        const match = SCRIPT_STRING_ASSIGN_RE.exec(line);
        if (!match) {
            return;
        }

        const rawText = match[2];
        if (!looksTranslatable(rawText)) {
            return;
        }

        const resolved = resolveCachedTranslation(runtime, rawText, cacheType);
        if (!resolved) {
            return;
        }

        // Rebuild the line with the translated value
        cmd.parameters[0] =
            line.slice(0, match.index) +
            match[1] +
            escapeForJsStringLiteral(resolved.translated) +
            match[3];
    }

    static getOrCreateOriginalMap(container) {
        if (!container || (typeof container !== 'object' && !Array.isArray(container))) {
            return null;
        }

        if (!this._originalStringMaps) {
            this._originalStringMaps = new WeakMap();
        }

        let originalMap = this._originalStringMaps.get(container);
        if (!originalMap) {
            originalMap = new Map();
            this._originalStringMaps.set(container, originalMap);
        }

        return originalMap;
    }

    static tryApplyCachedString(container, key, currentValue, runtime, cacheType) {
        if (typeof currentValue !== 'string' || !currentValue.trim()) {
            return { replaced: 0, visited: 0 };
        }

        const originalMap = this.getOrCreateOriginalMap(container);
        const hasOriginal = originalMap ? originalMap.has(key) : false;
        const sourceValue = hasOriginal ? originalMap.get(key) : currentValue;

        if (!hasOriginal && originalMap) {
            originalMap.set(key, currentValue);
        }

        if (
            typeof sourceValue !== 'string' ||
            !sourceValue.trim() ||
            !looksTranslatable(sourceValue)
        ) {
            return { replaced: 0, visited: 1 };
        }

        const resolved = resolveCachedTranslation(runtime, sourceValue, cacheType);
        if (!resolved) {
            return { replaced: 0, visited: 1 };
        }

        const translated = toRuntimeNewlineText(resolved.translated);

        if (container[key] !== translated) {
            container[key] = translated;
            return { replaced: 1, visited: 1 };
        }

        return { replaced: 0, visited: 1 };
    }

    static visitGameVariableValue(value, runtime, cacheType, visitedContainers) {
        if (Array.isArray(value)) {
            if (visitedContainers.has(value)) {
                return { replaced: 0, visited: 0 };
            }

            visitedContainers.add(value);

            let replaced = 0;
            let visited = 0;
            for (let i = 0; i < value.length; i++) {
                const entry = value[i];
                if (typeof entry === 'string') {
                    const result = this.tryApplyCachedString(value, i, entry, runtime, cacheType);
                    replaced += result.replaced;
                    visited += result.visited;
                    continue;
                }

                if (entry && typeof entry === 'object') {
                    const childResult = this.visitGameVariableValue(
                        entry,
                        runtime,
                        cacheType,
                        visitedContainers
                    );
                    replaced += childResult.replaced;
                    visited += childResult.visited;
                }
            }

            return { replaced, visited };
        }

        if (!value || typeof value !== 'object') {
            return { replaced: 0, visited: 0 };
        }

        if (visitedContainers.has(value)) {
            return { replaced: 0, visited: 0 };
        }

        visitedContainers.add(value);

        let replaced = 0;
        let visited = 0;
        for (const key of Object.keys(value)) {
            const entry = value[key];
            if (typeof entry === 'string') {
                const result = this.tryApplyCachedString(value, key, entry, runtime, cacheType);
                replaced += result.replaced;
                visited += result.visited;
                continue;
            }

            if (entry && typeof entry === 'object') {
                const childResult = this.visitGameVariableValue(
                    entry,
                    runtime,
                    cacheType,
                    visitedContainers
                );
                replaced += childResult.replaced;
                visited += childResult.visited;
            }
        }

        return { replaced, visited };
    }

    static applyCachedTranslationsToGameVariables(runtime, cacheType) {
        if (
            !runtime ||
            !window.$gameVariables ||
            !Array.isArray($gameVariables._data)
        ) {
            return { replaced: 0, visited: 0 };
        }

        const visitedContainers = new WeakSet();
        let replaced = 0;
        let visited = 0;

        for (let variableId = 0; variableId < $gameVariables._data.length; variableId++) {
            const value = $gameVariables._data[variableId];

            if (typeof value === 'string') {
                const result = this.tryApplyCachedString(
                    $gameVariables._data,
                    variableId,
                    value,
                    runtime,
                    cacheType
                );
                replaced += result.replaced;
                visited += result.visited;
                continue;
            }

            if (value && typeof value === 'object') {
                const childResult = this.visitGameVariableValue(
                    value,
                    runtime,
                    cacheType,
                    visitedContainers
                );
                replaced += childResult.replaced;
                visited += childResult.visited;
            }
        }

        return { replaced, visited };
    }

    // -------------------------------------------------------------------------
    // Scanning
    // -------------------------------------------------------------------------

    async prepareTranslator() {
        if (!this.ensureDetection()) {
            return;
        }

        if (this._scanPrepared) {
            return;
        }

        if (this._scanPromise) {
            return this._scanPromise;
        }

        this._scanPromise = this.buildScanEntries()
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[YEPCoreEngineScriptTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];

        // --- Common events ---
        if (Array.isArray(window.$dataCommonEvents)) {
            for (let commonEventId = 0; commonEventId < $dataCommonEvents.length; commonEventId++) {
                const commonEvent = $dataCommonEvents[commonEventId];
                if (!commonEvent || !Array.isArray(commonEvent.list)) {
                    continue;
                }

                this.collectScriptTextsFromList(
                    commonEvent.list,
                    { scope: 'commonEvent', commonEventId },
                    entries
                );
            }
        }

        // --- Map events ---
        const mapInfos = Array.isArray(window.$dataMapInfos) ? window.$dataMapInfos : [];

        for (const mapInfo of mapInfos) {
            const mapId = Number(mapInfo && mapInfo.id);
            if (!mapId) {
                continue;
            }

            try {
                const mapData = await loadMapDataById(mapId);
                if (!mapData || !Array.isArray(mapData.events)) {
                    continue;
                }

                for (let eventIdx = 0; eventIdx < mapData.events.length; eventIdx++) {
                    const event = mapData.events[eventIdx];
                    if (!event || !Array.isArray(event.pages)) {
                        continue;
                    }

                    for (let pageIdx = 0; pageIdx < event.pages.length; pageIdx++) {
                        const page = event.pages[pageIdx];
                        if (!page || !Array.isArray(page.list)) {
                            continue;
                        }

                        this.collectScriptTextsFromList(
                            page.list,
                            { scope: 'mapEvent', mapId, eventIdx, pageIdx },
                            entries
                        );
                    }
                }
            } catch (error) {
                console.warn(`[YEPCoreEngineScriptTranslator] Failed to scan map ${mapId}`, error);
            }
        }

        return entries;
    }

    collectScriptTextsFromList(list, baseMeta, output) {
        if (!Array.isArray(list) || !Array.isArray(output)) {
            return;
        }

        for (let cmdIdx = 0; cmdIdx < list.length; cmdIdx++) {
            const cmd = list[cmdIdx];
            if (!cmd) {
                continue;
            }

            const code = Number(cmd.code);
            if (code !== 355 && code !== 655) {
                continue;
            }

            const text = this.extractScriptLineText(cmd);
            if (!text) {
                continue;
            }

            output.push({
                text,
                source: { ...baseMeta, cmdIdx, code },
            });
        }
    }

    extractScriptLineText(cmd) {
        if (!cmd || !Array.isArray(cmd.parameters)) {
            return null;
        }

        const line = String(cmd.parameters[0] || '');
        const match = SCRIPT_STRING_ASSIGN_RE.exec(line);
        if (!match) {
            return null;
        }

        const rawText = match[2];
        if (!looksTranslatable(rawText)) {
            return null;
        }

        return rawText;
    }

    // -------------------------------------------------------------------------
    // Pending items / counts
    // -------------------------------------------------------------------------

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!text || !text.trim()) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_yep_core_script_${byCacheKey.size}`,
                    value: text,
                    cacheKey,
                });
            }
        }

        return Array.from(byCacheKey.values());
    }

    collectUntranslated({ runtime }) {
        if (!runtime) {
            return [];
        }

        const items = this.buildUniquePendingItems(runtime);
        return items.filter((item) => !runtime.hasUsableCacheValue(item.cacheKey));
    }

    countPluginAmountSync({ runtime }) {
        if (!runtime) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        const items = this.buildUniquePendingItems(runtime);
        const totalStrings = items.length;
        const leftStrings = items.filter(
            (item) => !runtime.hasUsableCacheValue(item.cacheKey)
        ).length;

        return {
            total: totalStrings,
            left: leftStrings,
            totalStrings,
            leftStrings,
        };
    }
}
