import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

function normalizeWindowListEntry(rawEntry) {
    if (!rawEntry) {
        return null;
    }

    if (typeof rawEntry === 'object') {
        return rawEntry;
    }

    if (typeof rawEntry !== 'string') {
        return null;
    }

    return parseJsonSafely(rawEntry, null);
}

function parseWindowList(rawValue) {
    if (Array.isArray(rawValue)) {
        return rawValue.map(normalizeWindowListEntry).filter(Boolean);
    }

    if (typeof rawValue !== 'string') {
        return [];
    }

    const normalized = rawValue.trim();
    if (!normalized) {
        return [];
    }

    const parsed = parseJsonSafely(normalized, []);
    if (!Array.isArray(parsed)) {
        return [];
    }

    return parsed.map(normalizeWindowListEntry).filter(Boolean);
}

export class ExtraWindowTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'ExtraWindow';
    }

    getPluginLabel() {
        return 'ExtraWindow';
    }

    getCacheType() {
        return 'plugin_extra_window';
    }

    findPluginEntries() {
        if (!Array.isArray(window.$plugins)) {
            return [];
        }

        const pluginName = this.getPluginName().toLowerCase();
        return window.$plugins.filter((plugin) => {
            if (!plugin || typeof plugin.name !== 'string') {
                return false;
            }

            return plugin.name.trim().toLowerCase() === pluginName;
        });
    }

    appendEntriesFromWindowList(rawWindowList, scope, output) {
        const windowEntries = parseWindowList(rawWindowList);
        for (let index = 0; index < windowEntries.length; index++) {
            const entry = windowEntries[index];
            const text = typeof entry.Text === 'string' ? entry.Text : '';
            if (!text?.trim()) {
                continue;
            }

            output.push({
                text,
                source: {
                    scope,
                    windowIndex: index,
                },
            });
        }
    }

    enablePluginTranslation() {
        if (
            !window.Window_SceneExtra?.prototype ||
            typeof Window_SceneExtra.prototype.drawAllText !== 'function'
        ) {
            return false;
        }

        const cacheType = this.getCacheType();
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const original = Window_SceneExtra.prototype.drawAllText;

        Window_SceneExtra.prototype.drawAllText = function () {
            const runtime = getRuntime();
            if (!isRuntimeTranslationActive(runtime)) {
                return original.apply(this, arguments);
            }

            try {
                const sourceText = typeof this._data?.Text === 'string' ? this._data.Text : '';
                if (!sourceText?.trim()) {
                    return original.apply(this, arguments);
                }

                const cacheKey = runtime.getCacheKey(sourceText, cacheType);
                runtime.trackCacheKeyUsage(cacheKey);

                if (!runtime.hasUsableCacheValue(cacheKey)) {
                    return original.apply(this, arguments);
                }

                const cached = runtime.translationCache.get(cacheKey);
                if (typeof cached !== 'string' || !cached.trim()) {
                    return original.apply(this, arguments);
                }

                const previousText = this._data.Text;
                this._data.Text = cached;

                try {
                    return original.apply(this, arguments);
                } finally {
                    this._data.Text = previousText;
                }
            } catch (error) {
                console.warn(
                    '[ExtraWindowTranslator] Failed to apply cached translation for Window_SceneExtra',
                    error
                );
                return original.apply(this, arguments);
            }
        };
        return true;
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

        this._scanPromise = Promise.resolve(this.buildScanEntries())
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[ExtraWindowTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const entries = [];

        const pluginEntries = this.findPluginEntries();
        for (let index = 0; index < pluginEntries.length; index++) {
            const pluginEntry = pluginEntries[index];
            this.appendEntriesFromWindowList(
                pluginEntry?.parameters?.WindowList,
                `pluginEntry:${index}`,
                entries
            );
        }

        if (window.PluginManager && typeof PluginManager.parameters === 'function') {
            const runtimeParameters = PluginManager.parameters(this.getPluginName());
            this.appendEntriesFromWindowList(
                runtimeParameters ? runtimeParameters.WindowList : null,
                'runtimePluginManagerParameter',
                entries
            );
        }

        return entries;
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!text?.trim()) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_extra_window_${byCacheKey.size}`,
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
