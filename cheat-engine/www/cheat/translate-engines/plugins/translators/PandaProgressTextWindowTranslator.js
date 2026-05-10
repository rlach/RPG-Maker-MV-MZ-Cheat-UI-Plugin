import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

const RUNTIME_HOOK_GUARD = '__CHEAT_PANDA_PROGRESS_TEXT_WINDOW_TRANSLATOR_HOOKED__';

export class PandaProgressTextWindowTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'PANDA_ProgressTextWindow';
    }

    getPluginLabel() {
        return 'PANDA ProgressTextWindow';
    }

    getCacheType() {
        return 'plugin_panda_progress_text_window';
    }

    findPluginEntry() {
        if (!Array.isArray(window.$plugins)) {
            return null;
        }

        const pluginName = String(this.getPluginName() || '')
            .trim()
            .toLowerCase();
        if (!pluginName) {
            return null;
        }

        return (
            window.$plugins.find((plugin) => {
                if (!plugin || typeof plugin.name !== 'string') {
                    return false;
                }

                return plugin.name.trim().toLowerCase() === pluginName;
            }) || null
        );
    }

    parseProgressTextParameter(rawValue) {
        if (typeof rawValue !== 'string') {
            return [];
        }

        const normalized = rawValue.trim();
        if (!normalized) {
            return [];
        }

        const parsed = parseJsonSafely(normalized.replace(/\\\\n/g, '\\n'), []);
        if (!Array.isArray(parsed)) {
            return [];
        }

        const result = [];
        for (const item of parsed) {
            if (typeof item !== 'string') {
                continue;
            }

            const decoded = parseJsonSafely(item, item);
            if (this.isUsableText(decoded)) {
                result.push(decoded);
            }
        }

        return result;
    }

    appendEntriesFromParameters(parameters, scope, output) {
        if (!parameters || typeof parameters !== 'object' || !Array.isArray(output)) {
            return;
        }

        const texts = this.parseProgressTextParameter(parameters.ProgressText);
        for (let index = 0; index < texts.length; index++) {
            output.push({
                text: texts[index],
                source: {
                    scope,
                    progressIndex: index + 1,
                },
            });
        }
    }

    isProgressWindowInstance(windowInstance) {
        if (!windowInstance || typeof windowInstance !== 'object') {
            return false;
        }

        const ctorName =
            windowInstance.constructor && typeof windowInstance.constructor.name === 'string'
                ? windowInstance.constructor.name
                : '';

        return ctorName === 'Window_Progress';
    }

    translateRuntimeText(text, runtime) {
        if (!this.isUsableText(text)) {
            return text;
        }

        if (
            !runtime
        ) {
            return text;
        }

        const cacheKey = runtime.getCacheKey(text, this.getCacheType());

        runtime.trackCacheKeyUsage(cacheKey);

        if (!runtime.hasUsableCacheValue(cacheKey)) {
            return text;
        }

        const cached = runtime.translationCache.get(cacheKey);
        return this.isUsableText(cached) ? cached : text;
    }

    enablePluginTranslation() {
        if (window[RUNTIME_HOOK_GUARD]) {
            return;
        }

        if (
            !window.Window_Help ||
            !Window_Help.prototype ||
            typeof Window_Help.prototype.setText !== 'function'
        ) {
            return;
        }

        const originalSetText = Window_Help.prototype.setText;
        const translator = this;

        Window_Help.prototype.setText = function (text) {
            try {
                if (translator.isProgressWindowInstance(this)) {
                    const runtime = translator.getRuntime();
                    const translated = translator.translateRuntimeText(text, runtime);
                    if (translated !== text) {
                        arguments[0] = translated;
                    }
                }
            } catch (error) {
                console.warn(
                    '[PandaProgressTextWindowTranslator] Failed to apply runtime progress text translation',
                    error
                );
            }

            return originalSetText.apply(this, arguments);
        };

        window[RUNTIME_HOOK_GUARD] = true;
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
                console.warn('[PandaProgressTextWindowTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const entries = [];

        const pluginEntry = this.findPluginEntry();
        if (pluginEntry && pluginEntry.parameters) {
            this.appendEntriesFromParameters(
                pluginEntry.parameters,
                'pluginEntryParameter',
                entries
            );
        }

        if (window.PluginManager && typeof PluginManager.parameters === 'function') {
            const runtimeParameters = PluginManager.parameters(this.getPluginName());
            this.appendEntriesFromParameters(
                runtimeParameters,
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
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_panda_progress_text_window_${byCacheKey.size}`,
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
