import { BasePluginTranslator } from '../BasePluginTranslator.js';

const RUNTIME_HOOK_GUARD = '__CHEAT_CBR_ERO_STATUS_MV_TRANSLATOR_HOOKED__';
const PAGE_PLUGIN_NAME_RE = /^CBR_eroStatus_(\d+)$/i;

function toSafeArray(value) {
    return Array.isArray(value) ? value : [];
}

function isTextLabelParameterKey(rawKey) {
    if (typeof rawKey !== 'string') {
        return false;
    }

    const normalized = rawKey
        .replace(/[#＃_＿]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!normalized) {
        return false;
    }

    return /(テキスト|text)\s*\d+/i.test(normalized);
}

export class CbrEroStatusMvTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
        this._lastScanKey = '';
        this._originalSubjectMap = new WeakMap();
    }

    getPluginName() {
        return 'CBR_eroStatus_main';
    }

    getPluginLabel() {
        return 'CBR eroStatus (MV)';
    }

    getCacheType() {
        return 'plugin_cbr_erostatus_mv';
    }

    findPagePluginEntries() {
        const plugins = toSafeArray(window.$plugins);
        const result = [];

        for (const plugin of plugins) {
            if (!plugin || typeof plugin.name !== 'string') {
                continue;
            }

            const match = PAGE_PLUGIN_NAME_RE.exec(plugin.name.trim());
            if (!match) {
                continue;
            }

            result.push({
                pageNo: Number(match[1]) || 0,
                name: plugin.name,
                parameters:
                    plugin.parameters && typeof plugin.parameters === 'object'
                        ? plugin.parameters
                        : {},
            });
        }

        result.sort((a, b) => a.pageNo - b.pageNo);
        return result;
    }

    appendScanEntriesFromParameters(parameters, pageNo, output, scope) {
        if (!parameters || typeof parameters !== 'object' || !Array.isArray(output)) {
            return;
        }

        const pushEntry = (text, rowNo, sourceKey) => {
            if (!this.isUsableText(text)) {
                return;
            }

            output.push({
                text,
                source: {
                    scope,
                    pageNo,
                    rowNo,
                    sourceKey,
                },
            });
        };

        for (let index = 1; index < 100; index++) {
            const key = `txtSubject_${index}`;
            const text = typeof parameters[key] === 'string' ? parameters[key] : '';
            pushEntry(text, index, key);
        }

        const keys = Object.keys(parameters);
        for (const key of keys) {
            if (!isTextLabelParameterKey(key)) {
                continue;
            }

            const value = typeof parameters[key] === 'string' ? parameters[key] : '';
            if (!this.isUsableText(value)) {
                continue;
            }

            const match = key.match(/(\d+)/);
            const rowNo = match ? Number(match[1]) || 0 : 0;
            pushEntry(value, rowNo, key);
        }
    }

    appendScanEntriesFromRuntimeState(output) {
        if (!Array.isArray(output)) {
            return;
        }

        const pages = toSafeArray(window.CBR_eroStatus);
        for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
            const page = pages[pageIdx];
            if (!page || !Array.isArray(page.t)) {
                continue;
            }

            for (let rowIdx = 0; rowIdx < page.t.length; rowIdx++) {
                const row = page.t[rowIdx];
                const text = row && typeof row.subject === 'string' ? row.subject : '';
                if (!this.isUsableText(text)) {
                    continue;
                }

                output.push({
                    text,
                    source: {
                        scope: 'runtimeCBR_eroStatus',
                        pageIdx,
                        rowNo: rowIdx + 1,
                    },
                });
            }
        }
    }

    computeScanKey(entries) {
        const normalized = Array.isArray(entries)
            ? entries
                  .map((entry) => (typeof entry?.text === 'string' ? entry.text.trim() : ''))
                  .filter((text) => text !== '')
                  .sort()
            : [];

        return normalized.join('\n');
    }

    refreshScanEntries(force = false) {
        const entries = this.buildScanEntries();
        const nextScanKey = this.computeScanKey(entries);

        if (force || nextScanKey !== this._lastScanKey) {
            this._scanEntries = Array.isArray(entries) ? entries : [];
            this._lastScanKey = nextScanKey;
        }

        this._scanPrepared = true;
    }

    ensureRuntimeHook() {
        if (window[RUNTIME_HOOK_GUARD]) {
            return;
        }

        if (
            !window.Window_EroStatus ||
            !Window_EroStatus.prototype ||
            typeof Window_EroStatus.prototype.update !== 'function'
        ) {
            return;
        }

        this.enablePluginTranslation();
    }

    buildUniquePendingItems(panel) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = panel.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_cbr_erostatus_mv_${byCacheKey.size}`,
                    value: text,
                    cacheKey,
                });
            }
        }

        return Array.from(byCacheKey.values());
    }

    translateSubjectValue(subject, runtime) {
        if (!this.isUsableText(subject)) {
            return subject;
        }

        if (!runtime) {
            return subject;
        }

        const cacheKey = runtime.getCacheKey(subject, this.getCacheType());
        runtime.trackCacheKeyUsage(cacheKey);

        if (!runtime.hasUsableCacheValue(cacheKey)) {
            return subject;
        }

        const cached = runtime.translationCache.get(cacheKey);
        return this.isUsableText(cached) ? cached : subject;
    }

    applyRuntimeSubjectTranslations() {
        const pages = toSafeArray(window.CBR_eroStatus);
        const runtime = this.getRuntime();
        if (!runtime) {
            return;
        }

        for (const page of pages) {
            if (!page || !Array.isArray(page.t)) {
                continue;
            }

            for (const item of page.t) {
                if (!item || typeof item !== 'object') {
                    continue;
                }

                const currentSubject = typeof item.subject === 'string' ? item.subject : '';
                if (!this.isUsableText(currentSubject)) {
                    continue;
                }

                if (!this._originalSubjectMap.has(item)) {
                    this._originalSubjectMap.set(item, currentSubject);
                }

                const sourceText = this._originalSubjectMap.get(item);
                const translated = this.translateSubjectValue(sourceText, runtime);
                if (translated !== item.subject) {
                    item.subject = translated;
                }
            }
        }
    }

    enablePluginTranslation() {
        if (window[RUNTIME_HOOK_GUARD]) {
            return;
        }

        if (
            !window.Window_EroStatus ||
            !Window_EroStatus.prototype ||
            typeof Window_EroStatus.prototype.update !== 'function'
        ) {
            return;
        }

        const original = Window_EroStatus.prototype.update;
        const translator = this;

        Window_EroStatus.prototype.update = function () {
            try {
                translator.applyRuntimeSubjectTranslations();
            } catch (error) {
                console.warn(
                    '[CbrEroStatusMvTranslator] Failed to apply runtime CBR_eroStatus subject translation',
                    error
                );
            }

            return original.apply(this, arguments);
        };

        window[RUNTIME_HOOK_GUARD] = true;
    }

    async prepareTranslator() {
        if (!this.ensureDetection()) {
            return;
        }

        this.ensureRuntimeHook();

        if (this._scanPrepared) {
            this.refreshScanEntries(false);
            return;
        }

        if (this._scanPromise) {
            return this._scanPromise;
        }

        this._scanPromise = Promise.resolve()
            .then(() => {
                this.refreshScanEntries(true);
            })
            .catch((error) => {
                console.warn('[CbrEroStatusMvTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const entries = [];

        const pageEntries = this.findPagePluginEntries();
        for (const pageEntry of pageEntries) {
            this.appendScanEntriesFromParameters(
                pageEntry.parameters,
                pageEntry.pageNo,
                entries,
                'pluginEntryParameter'
            );

            if (window.PluginManager && typeof PluginManager.parameters === 'function') {
                const runtimeParameters = PluginManager.parameters(pageEntry.name);
                this.appendScanEntriesFromParameters(
                    runtimeParameters,
                    pageEntry.pageNo,
                    entries,
                    'runtimePluginManagerParameter'
                );
            }
        }

        this.appendScanEntriesFromRuntimeState(entries);

        return entries;
    }

    collectUntranslated({ panel }) {
        if (!panel) {
            return [];
        }

        this.ensureRuntimeHook();
        this.refreshScanEntries(false);

        const items = this.buildUniquePendingItems(panel);
        return items.filter((item) => !panel.hasUsableCacheValue(item.cacheKey));
    }

    countPluginAmountSync({ panel }) {
        if (!panel) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        this.ensureRuntimeHook();
        this.refreshScanEntries(false);

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
