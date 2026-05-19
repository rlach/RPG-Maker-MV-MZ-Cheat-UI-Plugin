/**
 * RecollectionForMZTranslator
 *
 * Translator for RecollectionForMZ.js (version not specified in source)
 * Target engine: MZ
 *
 * RecollectionForMZ exposes three player-facing command labels via plugin
 * parameters and renders them through Window_TitleCommand.addCommand:
 * - CG/Recollection entry command shown on title command window
 * - Recollection scene command
 * - CG scene command
 *
 * This translator scans those parameter values and hooks addCommand so labels
 * are translated at render time without altering command symbols.
 */

import { BasePluginTranslator } from '../BasePluginTranslator.js';

const CACHE_TYPE = 'plugin_recollection_for_mz';
const PARAM_TITLE_ENTRY = 'ＣＧ/回想シーンコマンド名';
const PARAM_RECOLLECTION = '回想コマンド名';
const PARAM_CG = 'ＣＧコマンド名';

export class RecollectionForMZTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'RecollectionForMZ';
    }

    getPluginLabel() {
        return 'RecollectionForMZ';
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

        this._scanPromise = Promise.resolve(this.buildScanEntries())
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[RecollectionForMZTranslator] Scan failed', error);
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

        this._pushParameterEntry(parameters, PARAM_TITLE_ENTRY, 'titleCommand', entries);
        this._pushParameterEntry(parameters, PARAM_RECOLLECTION, 'recollectionCommand', entries);
        this._pushParameterEntry(parameters, PARAM_CG, 'cgCommand', entries);

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
        const titleCommandCtor = window.Window_TitleCommand;
        if (
            !titleCommandCtor?.prototype ||
            typeof titleCommandCtor.prototype.addCommand !== 'function'
        ) {
            return false;
        }

        const prototype = titleCommandCtor.prototype;
        if (prototype.__CHEAT_RECOLLECTION_FOR_MZ_ADD_COMMAND_PATCHED__) {
            return true;
        }

        const originalAddCommand = prototype.addCommand;
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const getRuntime = this.getRuntime.bind(this);
        const cacheType = this.getCacheType();

        prototype.addCommand = function (name, symbol, enabled, ext) {
            let translatedName = name;

            try {
                const runtime = getRuntime();
                if (
                    isRuntimeTranslationActive(runtime) &&
                    (symbol === 'recollection' || symbol === 'CG')
                ) {
                    translatedName = resolveRuntimeTranslation(name, runtime, 'command', {
                        requireRuntimeTranslationActive: true,
                        missValue: name,
                    });
                }
            } catch (error) {
                console.warn(
                    '[RecollectionForMZTranslator] Failed to translate recollection command label',
                    error
                );
            }

            return originalAddCommand.call(this, translatedName, symbol, enabled, ext);
        };

        Object.defineProperty(prototype, '__CHEAT_RECOLLECTION_FOR_MZ_ADD_COMMAND_PATCHED__', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });

        return true;
    }

    _resolvePluginParameters() {
        const pluginEntry = this.findPluginEntry();
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

    _pushParameterEntry(parameters, key, field, output) {
        const text = typeof parameters?.[key] === 'string' ? parameters[key] : '';
        if (!this.isUsableText(text)) {
            return;
        }

        output.push({
            text,
            source: {
                scope: 'pluginParameter',
                key,
                field,
            },
        });
    }

    _buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry?.text === 'string' ? entry.text : '';
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, 'command');
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: 'command',
                    id: `plugin_recollection_for_mz_${byCacheKey.size}`,
                    value: text,
                    cacheKey,
                });
            }
        }

        return Array.from(byCacheKey.values());
    }
}
