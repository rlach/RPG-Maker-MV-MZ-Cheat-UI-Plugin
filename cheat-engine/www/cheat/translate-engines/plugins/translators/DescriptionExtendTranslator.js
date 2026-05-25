import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * DescriptionExtend.js translator
 *
 * Supported plugin versions:
 * - 1.1.0 (MV)
 *
 * Translation notes:
 * - Collects extension help text from database meta tags:
 *   <ExtendDesc:...> and <拡張説明:...>
 * - Respects plugin parameter notePrefix by scanning prefixed meta keys when configured.
 * - Hooks Window_Help.setItem() to translate displayed extension text at runtime while
 *   preserving plugin behavior and original help-window flow.
 */

const PLUGIN_NAME = 'DescriptionExtend';
const CACHE_TYPE = 'plugin_description_extend';
const BASE_META_KEYS = ['拡張説明', 'ExtendDesc'];
const HELP_ITEM_STASH_KEY = '__CHEAT_DESCRIPTION_EXTEND_ITEM__';

const DATABASE_SOURCES = [
    { scope: 'actors', dataKey: '$dataActors' },
    { scope: 'classes', dataKey: '$dataClasses' },
    { scope: 'skills', dataKey: '$dataSkills' },
    { scope: 'items', dataKey: '$dataItems' },
    { scope: 'weapons', dataKey: '$dataWeapons' },
    { scope: 'armors', dataKey: '$dataArmors' },
    { scope: 'enemies', dataKey: '$dataEnemies' },
    { scope: 'states', dataKey: '$dataStates' },
];

export class DescriptionExtendTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return PLUGIN_NAME;
    }

    getPluginLabel() {
        return 'DescriptionExtend';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    _getNotePrefix() {
        const pluginEntry = this.findPluginEntry(this.getPluginName());
        const notePrefix = String(pluginEntry?.parameters?.notePrefix || '').trim();
        return notePrefix;
    }

    _getMetaKeys() {
        const notePrefix = this._getNotePrefix();
        return BASE_META_KEYS.map((baseKey) => `${notePrefix}${baseKey}`);
    }

    _extractExtendDescriptionText(item) {
        const meta = item?.meta;
        if (!meta || typeof meta !== 'object') {
            return '';
        }

        for (const metaKey of this._getMetaKeys()) {
            const value = String(meta[metaKey] || '').trim();
            if (this.isUsableText(value)) {
                return value;
            }
        }

        return '';
    }

    _toDisplayedHelpText(helpWindow, text) {
        if (!this.isUsableText(text)) {
            return '';
        }

        if (typeof helpWindow?.convertEscapeCharacters === 'function') {
            return String(helpWindow.convertEscapeCharacters(text) || '');
        }

        return String(text);
    }

    _applyRuntimeDescriptionTranslation(helpWindow, item, runtime, inputText) {
        const sourceText = this._extractExtendDescriptionText(item);
        if (!this.isUsableText(sourceText)) {
            return inputText;
        }

        const cacheKey = runtime.getCacheKey(sourceText, this.getCacheType());
        runtime.trackCacheKeyUsage(cacheKey);

        if (!this.isRuntimeTranslationActive(runtime)) {
            return inputText;
        }

        const translated = this.resolveRuntimeTranslation(sourceText, runtime, this.getCacheType(), {
            requireRuntimeTranslationActive: true,
            missValue: sourceText,
            harvestMissing: false,
        });

        if (!this.isUsableText(translated) || translated === sourceText) {
            return inputText;
        }

        const displayedSource = this._toDisplayedHelpText(helpWindow, sourceText);
        const displayedTranslated = this._toDisplayedHelpText(helpWindow, translated);

        if (!this.isUsableText(displayedSource) || displayedSource === displayedTranslated) {
            return inputText;
        }

        const currentText = String(inputText ?? '');
        if (!this.isUsableText(currentText)) {
            return inputText;
        }

        if (currentText.endsWith(displayedSource)) {
            return `${currentText.slice(0, currentText.length - displayedSource.length)}${displayedTranslated}`;
        }

        if (currentText.includes(displayedSource)) {
            return currentText.replace(displayedSource, displayedTranslated);
        }

        return inputText;
    }

    enablePluginTranslation() {
        if (
            typeof Window_Help === 'undefined' ||
            !Window_Help.prototype ||
            typeof Window_Help.prototype.setItem !== 'function' ||
            typeof Window_Help.prototype.setText !== 'function'
        ) {
            return false;
        }

        const originalSetItem = Window_Help.prototype.setItem;
        const originalSetText = Window_Help.prototype.setText;
        const getRuntime = this.getRuntime.bind(this);
        const applyRuntimeDescriptionTranslation = this._applyRuntimeDescriptionTranslation.bind(this);

        Window_Help.prototype.setItem = function () {
            this[HELP_ITEM_STASH_KEY] = arguments[0] || null;
            return originalSetItem.apply(this, arguments);
        };

        Window_Help.prototype.setText = function (text) {
            let nextText = text;

            try {
                const runtime = getRuntime();
                if (!runtime) {
                    return originalSetText.call(this, nextText);
                }

                const item = this[HELP_ITEM_STASH_KEY] || null;
                if (!item) {
                    return originalSetText.call(this, nextText);
                }

                nextText = applyRuntimeDescriptionTranslation(this, item, runtime, nextText);
            } catch (error) {
                console.warn(
                    '[DescriptionExtendTranslator] Failed to apply runtime description extension translation',
                    error
                );
            }

            return originalSetText.call(this, nextText);
        };

        return true;
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

        this._scanPromise = Promise.resolve(this.buildScanEntries())
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[DescriptionExtendTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const entries = [];
        const metaKeys = this._getMetaKeys();

        for (const source of DATABASE_SOURCES) {
            const dataList = window[source.dataKey];
            if (!Array.isArray(dataList)) {
                continue;
            }

            for (let id = 1; id < dataList.length; id++) {
                const data = dataList[id];
                const meta = data?.meta;
                if (!meta || typeof meta !== 'object') {
                    continue;
                }

                for (const metaKey of metaKeys) {
                    const text = String(meta[metaKey] || '').trim();
                    if (!this.isUsableText(text)) {
                        continue;
                    }

                    entries.push({
                        text,
                        source: {
                            scope: source.scope,
                            id,
                            metaKey,
                        },
                    });
                }
            }
        }

        return entries;
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = String(entry?.text || '');
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_description_extend_${byCacheKey.size}`,
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

    getCachedCountsSync({ runtime }) {
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