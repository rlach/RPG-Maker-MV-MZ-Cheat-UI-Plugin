import { BasePluginTranslator } from '../BasePluginTranslator.js';

// Default time zone names as hardcoded in the standard Chronus.js plugin source.
// These live inside the plugin's closure and are not accessible via PluginManager.parameters.
const CHRONUS_DEFAULT_TIMEZONE_NAMES = ['深夜', '早朝', '朝', '昼', '夕方', '夜'];

// AM/PM strings produced by Chronus.js convertDateFormatText for Japanese locale.
const CHRONUS_AM_PM_STRINGS = ['午前', '午後'];

function pushSplitParamEntries(entries, rawValue, paramKey) {
    const raw = String(rawValue || '').trim();
    if (!raw) {
        return;
    }
    for (const part of raw.split(',')) {
        const text = part.trim();
        if (text) {
            entries.push({ text, source: { paramKey } });
        }
    }
}

export class ChronusTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
    }

    getPluginName() {
        return 'Chronus';
    }

    getPluginLabel() {
        return 'Chronus (Date/Time Calendar)';
    }

    getCacheType() {
        return 'plugin_chronus';
    }

    precomputeCounts() {
        if (!this.ensureDetection()) {
            return Promise.resolve();
        }

        if (this._scanPrepared) {
            return Promise.resolve();
        }

        this._scanEntries = this._buildScanEntries();
        this._scanPrepared = true;
        return Promise.resolve();
    }

    _buildScanEntries() {
        const entries = [];
        const params = window.PluginManager ? PluginManager.parameters('Chronus') : null;
        if (!params) {
            return entries;
        }

        // Format template strings — contain Japanese literal text mixed with format tokens.
        // e.g. "MM月 DD日 DY" or "AMHH時 MI分"
        for (const key of ['日時フォーマット1', '日時フォーマット2']) {
            const text = String(params[key] || '').trim();
            if (text) {
                entries.push({ text, source: { paramKey: key } });
            }
        }

        // Individual week day names and month names from comma-separated params.
        pushSplitParamEntries(entries, params['曜日配列'], '曜日配列');
        pushSplitParamEntries(entries, params['月名配列'], '月名配列');

        // Hardcoded time zone names from the plugin's internal settings object.
        for (const name of CHRONUS_DEFAULT_TIMEZONE_NAMES) {
            entries.push({ text: name, source: { paramKey: 'timeZone' } });
        }

        // Hardcoded AM/PM strings produced by convertDateFormatText for Japanese locale.
        for (const text of CHRONUS_AM_PM_STRINGS) {
            entries.push({ text, source: { paramKey: 'ampm' } });
        }

        return entries;
    }

    _buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = entry.text?.trim() ? entry.text : '';
            if (!text) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_chronus_${byCacheKey.size}`,
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

        const items = this._buildUniquePendingItems(runtime);
        return items.filter((item) => !runtime.hasUsableCacheValue(item.cacheKey));
    }

    getCachedCountsSync({ runtime }) {
        if (!runtime) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        const items = this._buildUniquePendingItems(runtime);
        const totalStrings = items.length;
        const leftStrings = items.filter((item) => !runtime.hasUsableCacheValue(item.cacheKey)).length;

        return {
            total: totalStrings,
            left: leftStrings,
            totalStrings,
            leftStrings,
        };
    }

    enablePluginTranslation() {
        if (!window.Game_Chronus || !Game_Chronus.prototype) {
            return false;
        }

        this._hookGetDateFormat();
        this._hookGetWeekName();
        this._hookGetTimeZoneName();
        return true;
    }

    _hookGetDateFormat() {
        if (typeof Game_Chronus.prototype.getDateFormat !== 'function') {
            return;
        }

        const original = Game_Chronus.prototype.getDateFormat;
        const tryTranslateFormat = (chronus, index, runtime) => {
            const params = window.PluginManager ? PluginManager.parameters('Chronus') : null;
            const rawFormat = params
                ? String(params['日時フォーマット' + String(index)] || '').trim()
                : '';
            if (!rawFormat) {
                return null;
            }
            const formatKey = runtime.getCacheKey(rawFormat, 'plugin_chronus');
            runtime.trackCacheKeyUsage(formatKey);
            if (!runtime.hasUsableCacheValue(formatKey)) {
                return null;
            }
            const translatedFormat = runtime.translationCache.get(formatKey);
            if (typeof translatedFormat !== 'string' || !translatedFormat.trim()) {
                return null;
            }
            return this._applyAmPmTranslation(chronus.convertDateFormatText(translatedFormat), runtime);
        };

        Game_Chronus.prototype.getDateFormat = function (index) {
            try {
                const runtime = this._chronusTranslatorRuntime?.();
                if (runtime && this._chronusTranslatorActive?.(runtime)) {
                    const translated = tryTranslateFormat(this, index, runtime);
                    const result = translated ?? original.call(this, index);
                    return this._chronusTranslatorApplyAmPm?.(result, runtime) ?? result;
                }
            } catch (error) {
                console.warn('[ChronusTranslator] getDateFormat hook failed', error);
            }
            return original.call(this, index);
        };

        // Attach translator callbacks via non-enumerable properties on the prototype
        // to avoid the `const translator = this` anti-pattern.
        Object.defineProperty(Game_Chronus.prototype, '_chronusTranslatorRuntime', {
            value: () => this.getRuntime(),
            configurable: true,
            enumerable: false,
            writable: true,
        });
        Object.defineProperty(Game_Chronus.prototype, '_chronusTranslatorActive', {
            value: (runtime) => this.isRuntimeTranslationActive(runtime),
            configurable: true,
            enumerable: false,
            writable: true,
        });
        Object.defineProperty(Game_Chronus.prototype, '_chronusTranslatorApplyAmPm', {
            value: (text, runtime) => this._applyAmPmTranslation(text, runtime),
            configurable: true,
            enumerable: false,
            writable: true,
        });
        Object.defineProperty(Game_Chronus.prototype, '_chronusTranslatorName', {
            value: (name) => this._tryTranslateCachedName(name),
            configurable: true,
            enumerable: false,
            writable: true,
        });
    }

    _tryTranslateCachedName(name) {
        const runtime = this.getRuntime();
        if (!runtime || !this.isRuntimeTranslationActive(runtime)) {
            return name;
        }
        const cacheKey = runtime.getCacheKey(name, 'plugin_chronus');
        runtime.trackCacheKeyUsage(cacheKey);
        if (!runtime.hasUsableCacheValue(cacheKey)) {
            return name;
        }
        const cached = runtime.translationCache.get(cacheKey);
        return typeof cached === 'string' && cached.trim() ? cached : name;
    }

    _hookGetWeekName() {
        if (typeof Game_Chronus.prototype.getWeekName !== 'function') {
            return;
        }

        const original = Game_Chronus.prototype.getWeekName;
        Game_Chronus.prototype.getWeekName = function () {
            const name = original.call(this);
            try {
                if (typeof name === 'string' && name.trim()) {
                    return this._chronusTranslatorName?.(name) ?? name;
                }
            } catch (error) {
                console.warn('[ChronusTranslator] getWeekName hook failed', error);
            }
            return name;
        };
    }

    _hookGetTimeZoneName() {
        if (typeof Game_Chronus.prototype.getTimeZoneName !== 'function') {
            return;
        }

        const original = Game_Chronus.prototype.getTimeZoneName;
        Game_Chronus.prototype.getTimeZoneName = function () {
            const name = original.call(this);
            try {
                if (typeof name === 'string' && name.trim()) {
                    return this._chronusTranslatorName?.(name) ?? name;
                }
            } catch (error) {
                console.warn('[ChronusTranslator] getTimeZoneName hook failed', error);
            }
            return name;
        };
    }

    /**
     * Post-processes a formatted date string to replace hardcoded Japanese AM/PM
     * strings produced by the AM token in convertDateFormatText.
     * @param {string} text
     * @param {object} runtime
     * @returns {string}
     */
    _applyAmPmTranslation(text, runtime) {
        if (typeof text !== 'string' || !text.trim()) {
            return text;
        }
        let result = text;
        for (const ampm of CHRONUS_AM_PM_STRINGS) {
            if (!result.includes(ampm)) {
                continue;
            }
            const cacheKey = runtime.getCacheKey(ampm, 'plugin_chronus');
            runtime.trackCacheKeyUsage(cacheKey);
            if (runtime.hasUsableCacheValue(cacheKey)) {
                const cached = runtime.translationCache.get(cacheKey);
                if (typeof cached === 'string' && cached.trim()) {
                    result = result.replaceAll(ampm, cached);
                }
            }
        }
        return result;
    }
}
