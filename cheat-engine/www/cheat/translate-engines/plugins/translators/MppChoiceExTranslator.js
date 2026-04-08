import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../panels/translate-on-the-fly/ObjectTranslationModalMethods.js';

const RUNTIME_HOOK_GUARD = '__CHEAT_MPP_CHOICE_EX_TRANSLATOR_HOOKED__';

function isUsableText(value) {
    return typeof value === 'string' && value.trim() !== '';
}

function getRuntime() {
    return typeof window.__ensureTranslationRuntime === 'function'
        ? window.__ensureTranslationRuntime()
        : window.__TranslationRuntime || null;
}

function splitChoiceConditionPrefix(choiceText) {
    const original = String(choiceText || '');
    let rest = original;
    let prefix = '';

    // MPP_ChoiceEX supports if(...) and en(...) markers in the choice text.
    const conditionPrefixRegex = /^(\s*(?:if|en)\([^)]*\)\s*)/i;

    while (true) {
        const match = conditionPrefixRegex.exec(rest);
        if (!match) {
            break;
        }

        prefix += match[1];
        rest = rest.slice(match[1].length);
    }

    return {
        prefix,
        text: rest,
    };
}

export class MppChoiceExTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'MPP_ChoiceEX';
    }

    getPluginLabel() {
        return 'MPP ChoiceEX';
    }

    getCacheType() {
        return 'plugin_mpp_choice_ex';
    }

    enablePluginTranslation() {
        if (window[RUNTIME_HOOK_GUARD]) {
            return;
        }

        if (
            !window.Game_Interpreter ||
            !Game_Interpreter.prototype ||
            typeof Game_Interpreter.prototype.checkChoiceConditions !== 'function'
        ) {
            return;
        }

        const originalCheckChoiceConditions = Game_Interpreter.prototype.checkChoiceConditions;
        const translator = this;

        Game_Interpreter.prototype.checkChoiceConditions = function (choices, data, d) {
            const existingChoiceCount =
                data && Array.isArray(data.choices) ? data.choices.length : 0;

            const result = originalCheckChoiceConditions.apply(this, arguments);

            try {
                translator.applyRuntimeChoiceTranslations(data, existingChoiceCount);
            } catch (error) {
                console.warn(
                    '[MppChoiceExTranslator] Failed to apply runtime choice translation',
                    error
                );
            }

            return result;
        };

        window[RUNTIME_HOOK_GUARD] = true;
    }

    applyRuntimeChoiceTranslations(data, startIndex) {
        if (!data || !Array.isArray(data.choices)) {
            return;
        }

        const runtime = getRuntime();
        if (
            !runtime ||
            typeof runtime.getCacheKey !== 'function' ||
            typeof runtime.hasUsableCacheValue !== 'function' ||
            !(runtime.translationCache instanceof Map)
        ) {
            return;
        }

        for (let i = Math.max(0, Number(startIndex) || 0); i < data.choices.length; i++) {
            const originalText = String(data.choices[i] || '');
            if (!isUsableText(originalText)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(originalText, this.getCacheType());
            if (typeof runtime.markCacheKeySeen === 'function') {
                runtime.markCacheKeySeen(cacheKey);
            }

            if (!runtime.hasUsableCacheValue(cacheKey)) {
                continue;
            }

            const cached = runtime.translationCache.get(cacheKey);
            if (!isUsableText(cached)) {
                continue;
            }

            data.choices[i] = cached;
        }
    }

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
                console.warn('[MppChoiceExTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];

        if (Array.isArray(window.$dataCommonEvents)) {
            for (let commonEventId = 0; commonEventId < $dataCommonEvents.length; commonEventId++) {
                const commonEvent = $dataCommonEvents[commonEventId];
                if (!commonEvent || !Array.isArray(commonEvent.list)) {
                    continue;
                }

                this.collectChoiceTextsFromList(
                    commonEvent.list,
                    {
                        scope: 'commonEvent',
                        commonEventId,
                    },
                    entries
                );
            }
        }

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

                        this.collectChoiceTextsFromList(
                            page.list,
                            {
                                scope: 'mapEvent',
                                mapId,
                                eventIdx,
                                pageIdx,
                            },
                            entries
                        );
                    }
                }
            } catch (error) {
                console.warn(`[MppChoiceExTranslator] Failed to scan map ${mapId}`, error);
            }
        }

        return entries;
    }

    collectChoiceTextsFromList(list, baseMeta, output) {
        if (!Array.isArray(list) || !Array.isArray(output)) {
            return;
        }

        for (let cmdIdx = 0; cmdIdx < list.length; cmdIdx++) {
            const cmd = list[cmdIdx];
            if (!cmd) {
                continue;
            }

            const code = Number(cmd.code);
            if (code === 102) {
                const choices =
                    Array.isArray(cmd.parameters) && Array.isArray(cmd.parameters[0])
                        ? cmd.parameters[0]
                        : [];
                for (let choiceIdx = 0; choiceIdx < choices.length; choiceIdx++) {
                    const parsed = splitChoiceConditionPrefix(choices[choiceIdx]);
                    if (!isUsableText(parsed.text)) {
                        continue;
                    }

                    output.push({
                        text: parsed.text,
                        source: {
                            ...baseMeta,
                            cmdIdx,
                            code,
                            choiceIdx,
                        },
                    });
                }
            } else if (code === 402) {
                const choiceBranchText =
                    Array.isArray(cmd.parameters) && typeof cmd.parameters[1] === 'string'
                        ? cmd.parameters[1]
                        : '';
                const parsed = splitChoiceConditionPrefix(choiceBranchText);
                if (!isUsableText(parsed.text)) {
                    continue;
                }

                output.push({
                    text: parsed.text,
                    source: {
                        ...baseMeta,
                        cmdIdx,
                        code,
                    },
                });
            }
        }
    }

    buildUniquePendingItems(panel) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!isUsableText(text)) {
                continue;
            }

            const cacheKey = panel.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_mpp_choice_ex_${byCacheKey.size}`,
                    value: text,
                    cacheKey,
                });
            }
        }

        return Array.from(byCacheKey.values());
    }

    collectUntranslated({ panel }) {
        if (!panel || typeof panel.getCacheKey !== 'function') {
            return [];
        }

        const items = this.buildUniquePendingItems(panel);
        return items.filter((item) => !panel.hasUsableCacheValue(item.cacheKey));
    }

    countPluginAmountSync({ panel }) {
        if (!panel || typeof panel.getCacheKey !== 'function') {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        const items = this.buildUniquePendingItems(panel);
        const totalStrings = items.length;
        const leftStrings = items.filter(
            (item) => !panel.hasUsableCacheValue(item.cacheKey)
        ).length;

        return {
            total: totalStrings,
            left: leftStrings,
            totalStrings,
            leftStrings,
        };
    }
}
