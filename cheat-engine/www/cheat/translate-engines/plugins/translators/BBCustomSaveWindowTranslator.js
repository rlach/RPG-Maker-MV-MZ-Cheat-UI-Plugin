/**
 * BBCustomSaveWindowTranslator
 *
 * Translator for BB_CustomSaveWindow.js (v1.0.0 - v1.0.2, MV)
 *
 * BB_CustomSaveWindow customizes save slot layout and exposes configurable labels
 * through plugin parameters. This translator extracts and translates:
 * - ItemNtitle labels (e.g. playtime / gold labels)
 * - ItemValueNunit suffix text appended to variable values
 *
 * Dynamic values (playtime, map names, numbers, etc.) are intentionally not
 * collected for Mass Translate.
 */

import { BasePluginTranslator } from '../BasePluginTranslator.js';

export class BBCustomSaveWindowTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'BB_CustomSaveWindow';
    }

    getPluginLabel() {
        return 'BB Custom Save Window';
    }

    getCacheType() {
        return 'plugin_bb_custom_save_window';
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
                console.warn('[BBCustomSaveWindowTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const entries = [];
        const parameters = this._resolvePluginParameters();
        if (!parameters) {
            return entries;
        }

        this._collectTitleEntries(parameters, entries);
        this._collectUnitEntries(parameters, entries);
        return entries;
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
        if (
            !window.Window_SavefileList?.prototype ||
            typeof window.Window_SavefileList.prototype.drawContents !== 'function' ||
            typeof window.Window_SavefileList.prototype.drawText !== 'function'
        ) {
            return false;
        }

        const runtimeSource = this._getRuntimeSourceTextGroups();
        if (!runtimeSource.translatableTexts.size && !runtimeSource.unitTexts.length) {
            return false;
        }

        this._hookDrawContentsContext();
        this._hookDrawText(runtimeSource);
        return true;
    }

    _hookDrawContentsContext() {
        const prototype = window.Window_SavefileList.prototype;
        if (prototype._bbCustomSaveWindowTranslatorDrawContentsHooked) {
            return;
        }

        const original = prototype.drawContents;
        prototype.drawContents = function (info, rect, valid) {
            this._bbCustomSaveWindowTranslatorDrawContext = true;
            try {
                return original.call(this, info, rect, valid);
            } finally {
                this._bbCustomSaveWindowTranslatorDrawContext = false;
            }
        };

        Object.defineProperty(prototype, '_bbCustomSaveWindowTranslatorDrawContentsHooked', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: true,
        });
    }

    _hookDrawText(runtimeSource) {
        const prototype = window.Window_SavefileList.prototype;
        if (prototype._bbCustomSaveWindowTranslatorDrawTextHooked) {
            return;
        }

        const translatableTexts = runtimeSource.translatableTexts;
        const unitTexts = runtimeSource.unitTexts;
        const cacheType = this.getCacheType();
        const original = prototype.drawText;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);
        const isUsableText = this.isUsableText.bind(this);

        prototype.drawText = function (text, x, y, maxWidth, align) {
            let rendered = text;

            try {
                if (!this._bbCustomSaveWindowTranslatorDrawContext || !isUsableText(text)) {
                    return original.call(this, rendered, x, y, maxWidth, align);
                }

                const runtime = getRuntime();
                if (!isRuntimeTranslationActive(runtime)) {
                    return original.call(this, rendered, x, y, maxWidth, align);
                }

                if (translatableTexts.has(text)) {
                    rendered = resolveRuntimeTranslation(text, runtime, cacheType, {
                        requireRuntimeTranslationActive: true,
                        missValue: text,
                    });
                    return original.call(this, rendered, x, y, maxWidth, align);
                }

                for (const unitText of unitTexts) {
                    if (!text.endsWith(unitText)) {
                        continue;
                    }

                    const translatedUnit = resolveRuntimeTranslation(unitText, runtime, cacheType, {
                        requireRuntimeTranslationActive: true,
                        missValue: unitText,
                    });
                    if (translatedUnit !== unitText) {
                        rendered = text.slice(0, -unitText.length) + translatedUnit;
                    }
                    break;
                }
            } catch (error) {
                console.warn(
                    '[BBCustomSaveWindowTranslator] drawText translation hook failed',
                    error
                );
            }

            return original.call(this, rendered, x, y, maxWidth, align);
        };

        Object.defineProperty(prototype, '_bbCustomSaveWindowTranslatorDrawTextHooked', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: true,
        });
    }

    _resolvePluginParameters() {
        const pluginEntry = this.findPluginEntry(this.getPluginName());
        if (pluginEntry?.parameters && typeof pluginEntry.parameters === 'object') {
            return pluginEntry.parameters;
        }

        if (typeof window.PluginManager?.parameters === 'function') {
            const parameters = window.PluginManager.parameters(this.getPluginName());
            if (parameters && typeof parameters === 'object') {
                return parameters;
            }
        }

        return null;
    }

    _collectTitleEntries(parameters, output) {
        for (const [paramKey, value] of Object.entries(parameters)) {
            if (!/^Item\d+title$/i.test(paramKey)) {
                continue;
            }

            const text = String(value || '').trim();
            if (!this.isUsableText(text)) {
                continue;
            }

            output.push({
                text,
                source: { scope: 'pluginParam', paramKey },
            });
        }
    }

    _collectUnitEntries(parameters, output) {
        for (const [paramKey, value] of Object.entries(parameters)) {
            if (!/^ItemValue\d+unit$/i.test(paramKey)) {
                continue;
            }

            const text = String(value || '').trim();
            if (!this.isUsableText(text)) {
                continue;
            }

            output.push({
                text,
                source: { scope: 'pluginParam', paramKey },
            });
        }
    }

    _getRuntimeSourceTextGroups() {
        if (!this._scanPrepared) {
            this._scanEntries = this.buildScanEntries();
            this._scanPrepared = true;
        }

        const translatableTexts = new Set();
        const unitTexts = [];

        for (const entry of this._scanEntries) {
            const text = String(entry?.text || '').trim();
            if (!this.isUsableText(text)) {
                continue;
            }

            translatableTexts.add(text);
            const paramKey = String(entry?.source?.paramKey || '');
            if (/^ItemValue\d+unit$/i.test(paramKey)) {
                unitTexts.push(text);
            }
        }

        unitTexts.sort((a, b) => b.length - a.length);
        return { translatableTexts, unitTexts };
    }

    _buildUniquePendingItems(runtime) {
        if (!this._scanPrepared) {
            this._scanEntries = this.buildScanEntries();
            this._scanPrepared = true;
        }

        const byCacheKey = new Map();
        for (const entry of this._scanEntries) {
            const text = String(entry?.text || '').trim();
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (byCacheKey.has(cacheKey)) {
                continue;
            }

            byCacheKey.set(cacheKey, {
                type: this.getCacheType(),
                id: `bb_custom_save_window_${byCacheKey.size}`,
                value: text,
                cacheKey,
            });
        }

        return Array.from(byCacheKey.values());
    }
}