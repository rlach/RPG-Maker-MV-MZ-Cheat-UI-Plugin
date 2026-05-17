import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * ResidentWindow plugin translator.
 *
 * Supported versions:
 * - ResidentWindow Version 1.10 (MV)
 *
 * Notes:
 * - ResidentWindow commands are control-only (Show/Hide/Update), so translatable
 *   payload is sourced from built-in labels rendered by the plugin UI.
 * - Applies runtime cache translation at Window_ResidentStatus.drawText.
 */

const RESIDENT_WINDOW_BUILTIN_TEXTS = [
    '気力',
    '射精回数',
    '月曜日',
    '火曜日',
    '水曜日',
    '木曜日',
    '金曜日',
    '土曜日',
    '日曜日',
    '時',
];

export class ResidentWindowTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'ResidentWindow';
    }

    getPluginLabel() {
        return 'ResidentWindow';
    }

    getCacheType() {
        return 'plugin_resident_window';
    }

    enablePluginTranslation() {
        if (
            !window.Window_ResidentStatus ||
            !Window_ResidentStatus.prototype ||
            typeof Window_ResidentStatus.prototype.drawText !== 'function'
        ) {
            return false;
        }

        const cacheType = this.getCacheType();
        const getRuntime = this.getRuntime.bind(this);
        const isUsableText = this.isUsableText.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const originalDrawText = Window_ResidentStatus.prototype.drawText;

        Window_ResidentStatus.prototype.drawText = function (text) {
            try {
                if (!isUsableText(text)) {
                    return originalDrawText.apply(this, arguments);
                }

                const runtime = getRuntime();
                if (!runtime) {
                    return originalDrawText.apply(this, arguments);
                }

                const cacheKey = runtime.getCacheKey(text, cacheType);
                runtime.trackCacheKeyUsage(cacheKey);

                if (!isRuntimeTranslationActive(runtime)) {
                    return originalDrawText.apply(this, arguments);
                }

                if (runtime.hasUsableCacheValue(cacheKey)) {
                    const cached = runtime.translationCache.get(cacheKey);
                    if (isUsableText(cached)) {
                        arguments[0] = cached;
                    }
                }
            } catch (error) {
                console.warn('[ResidentWindowTranslator] Failed to translate runtime text', error);
            }

            return originalDrawText.apply(this, arguments);
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

        this._scanPromise = this.buildScanEntries()
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[ResidentWindowTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        return RESIDENT_WINDOW_BUILTIN_TEXTS.map((text, textIdx) => ({
            text,
            source: {
                scope: 'builtinLiteral',
                textIdx,
            },
        }));
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_resident_window_${byCacheKey.size}`,
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