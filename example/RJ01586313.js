/**
 * RJ01586313 Game-Specific Translator
 *
 * Supports LM_CommonTalk_Base.js + LM_CommonTalk_* data plugins.
 *
 * Plugin behavior summary:
 * - LM_CommonTalk_* plugins append phrase arrays into window.LM_CommonTalk_Data.
 * - LM_CommonTalk_Base resolves \COMMONTALK[character,category] tags by selecting
 *   one random phrase from that data at runtime.
 *
 * This translator:
 * - Scans LM_CommonTalk_Data for Mass Translate.
 * - Hooks Window_Base.convertEscapeCharacters to resolve and translate COMMONTALK
 *   phrase payloads at runtime while preserving LM plugin behavior.
 *
 * Usage: Copy this file to www/cheat-settings/translate-cache/js/
 */

const BasePluginTranslator = globalThis.__CheatBasePluginTranslator;

const CACHE_TYPE = 'plugin_lm_commontalk';
const HOOK_FLAG = '__CHEAT_RJ01586313_LM_COMMONTALK_HOOKED__';
const COMMONTALK_PATTERN = /\\COMMONTALK(?:\[([^,\]]+),([^\]]+)\])?/gi;

function toNormalizedText(value) {
    if (value === undefined || value === null) {
        return '';
    }

    return typeof value === 'string' ? value : String(value);
}

export class RJ01586313Translator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'LM_CommonTalk_Base';
    }

    getPluginAliases() {
        return ['LM_CommonTalk_Base'];
    }

    getPluginLabel() {
        return 'LM CommonTalk (RJ01586313)';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    async precomputeCounts() {
        if (!this.ensureDetection()) {
            return;
        }

        if (this._scanPrepared) {
            return;
        }

        if (this._scanPromise) {
            return this._scanPromise;
        }

        this._scanPromise = Promise.resolve()
            .then(() => {
                this._scanEntries = this.buildScanEntries();
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[RJ01586313Translator] Failed to precompute CommonTalk entries', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const entries = [];
        const dataRoot = window.LM_CommonTalk_Data;

        if (!dataRoot || typeof dataRoot !== 'object') {
            return entries;
        }

        for (const [characterKey, categoryMap] of Object.entries(dataRoot)) {
            this._appendCharacterEntries(entries, characterKey, categoryMap);
        }

        return entries;
    }

    _appendCharacterEntries(entries, characterKey, categoryMap) {
        if (!categoryMap || typeof categoryMap !== 'object') {
            return;
        }

        for (const [categoryKey, phraseList] of Object.entries(categoryMap)) {
            this._appendCategoryEntries(entries, characterKey, categoryKey, phraseList);
        }
    }

    _appendCategoryEntries(entries, characterKey, categoryKey, phraseList) {
        if (!Array.isArray(phraseList)) {
            return;
        }

        for (let phraseIndex = 0; phraseIndex < phraseList.length; phraseIndex += 1) {
            const phrase = toNormalizedText(phraseList[phraseIndex]);
            if (!this.isUsableText(phrase)) {
                continue;
            }

            entries.push({
                text: phrase,
                source: {
                    character: characterKey,
                    category: categoryKey,
                    index: phraseIndex,
                },
            });
        }
    }

    collectUntranslated({ runtime }) {
        if (!runtime) {
            return [];
        }

        if (!this._scanPrepared) {
            this._scanEntries = this.buildScanEntries();
            this._scanPrepared = true;
        }

        const items = this._buildUniquePendingItems(runtime);
        return items.filter((item) => !runtime.hasUsableCacheValue(item.cacheKey));
    }

    getCachedCountsSync({ runtime }) {
        if (!runtime) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        if (!this._scanPrepared) {
            this._scanEntries = this.buildScanEntries();
            this._scanPrepared = true;
        }

        const items = this._buildUniquePendingItems(runtime);
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

    enablePluginTranslation() {
        if (window[HOOK_FLAG]) {
            return true;
        }

        if (typeof Window_Base?.prototype?.convertEscapeCharacters !== 'function') {
            return false;
        }

        const originalConvertEscapeCharacters = Window_Base.prototype.convertEscapeCharacters;
        const getRuntime = () => this.getRuntime();
        const isRuntimeTranslationActive = (runtime) => this.isRuntimeTranslationActive(runtime);
        const resolveCommonTalkTag = (payload) => this._resolveCommonTalkTag(payload);

        Window_Base.prototype.convertEscapeCharacters = function (text) {
            const runtime = getRuntime();
            if (!isRuntimeTranslationActive(runtime)) {
                return originalConvertEscapeCharacters.call(this, text);
            }

            const source = toNormalizedText(text);
            COMMONTALK_PATTERN.lastIndex = 0;
            if (!COMMONTALK_PATTERN.test(source)) {
                return originalConvertEscapeCharacters.call(this, source);
            }

            COMMONTALK_PATTERN.lastIndex = 0;
            const replaced = source.replace(COMMONTALK_PATTERN, (fullMatch, character, category) =>
                resolveCommonTalkTag({
                    fullMatch,
                    character,
                    category,
                    runtime,
                })
            );

            return originalConvertEscapeCharacters.call(this, replaced);
        };

        window[HOOK_FLAG] = true;
        return true;
    }

    _resolveCommonTalkTag({ fullMatch, character, category, runtime }) {
        const dataRoot = window.LM_CommonTalk_Data;
        if (!dataRoot || typeof dataRoot !== 'object') {
            return fullMatch;
        }

        const currentCharacter = toNormalizedText(window.currentCharacter).trim();
        const characterKey = toNormalizedText(character || currentCharacter).trim();
        const categoryKey = toNormalizedText(category).trim();
        if (!characterKey || !categoryKey) {
            return fullMatch;
        }

        const categoryMap = dataRoot[characterKey];
        if (!categoryMap || typeof categoryMap !== 'object') {
            return fullMatch;
        }

        const phraseList = categoryMap[categoryKey];
        if (!Array.isArray(phraseList) || phraseList.length <= 0) {
            return fullMatch;
        }

        const index = Math.floor(Math.random() * phraseList.length);
        const selectedText = toNormalizedText(phraseList[index]);
        if (!this.isUsableText(selectedText)) {
            return fullMatch;
        }

        return this.resolveRuntimeTranslation(selectedText, runtime, this.getCacheType(), {
            requireRuntimeTranslationActive: true,
            missValue: selectedText,
        });
    }

    _buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = toNormalizedText(entry?.text);
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `lm_commontalk_${byCacheKey.size}`,
                    value: text,
                    cacheKey,
                });
            }
        }

        return Array.from(byCacheKey.values());
    }
}