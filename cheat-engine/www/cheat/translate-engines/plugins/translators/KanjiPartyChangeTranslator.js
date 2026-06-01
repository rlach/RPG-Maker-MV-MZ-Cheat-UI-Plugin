import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/**
 * KanjiPartyChange translator
 *
 * Plugin: KanjiPartyChange.js
 * Supported plugin versions:
 * - v1.04 (MV)
 *
 * Translation notes:
 * - Source text is primarily plugin parameters (menu command, scene command labels,
 *   empty-slot labels, reserve remove label, x/s parameter labels).
 * - Runtime translation is applied at draw-time in the party-change scene and when
 *   the menu command list is built, preserving plugin command syntax/tokens.
 */

const PLUGIN_NAME = 'KanjiPartyChange';
const CACHE_TYPE = 'plugin_kanji_party_change';
const MENU_HOOK_FLAG = '__CHEAT_KANJI_PARTY_CHANGE_MENU_PATCHED__';
const DRAW_TEXT_HOOK_FLAG = '__CHEAT_KANJI_PARTY_CHANGE_DRAW_TEXT_PATCHED__';

const TEXT_PARAMETER_KEYS = Object.freeze([
    'partyChangeCommand',
    'changeTerm',
    'removeTerm',
    'revertTerm',
    'finishTerm',
    'emptyFrameTerm',
    'removeOnReserveTerm',
]);

const ARRAY_TEXT_PARAMETER_KEYS = Object.freeze(['xParamNames', 'sParamNames']);

const TARGET_SCENE_NAME = 'Scene_KanjiPartyChange';

export class KanjiPartyChangeTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
        this._knownSourceTexts = null;
    }

    getPluginName() {
        return PLUGIN_NAME;
    }

    getPluginLabel() {
        return 'KanjiPartyChange';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    getRuntimeParameters() {
        const pluginManager = window.PluginManager;
        if (!pluginManager || typeof pluginManager.parameters !== 'function') {
            return null;
        }

        const parameters = pluginManager.parameters(this.getPluginName());
        return parameters && typeof parameters === 'object' ? parameters : null;
    }

    parseStringArray(rawValue) {
        const parsed = parseJsonSafely(rawValue, []);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .map((value) => (typeof value === 'string' ? value : ''))
            .filter((value) => this.isUsableText(value));
    }

    appendEntriesFromParameters(parameters, scope, output) {
        if (!parameters || typeof parameters !== 'object' || !Array.isArray(output)) {
            return;
        }

        for (const key of TEXT_PARAMETER_KEYS) {
            const text = typeof parameters[key] === 'string' ? parameters[key] : '';
            if (!this.isUsableText(text)) {
                continue;
            }

            output.push({
                text,
                source: {
                    scope,
                    field: key,
                },
            });
        }

        for (const key of ARRAY_TEXT_PARAMETER_KEYS) {
            const values = this.parseStringArray(parameters[key]);
            for (let index = 0; index < values.length; index++) {
                output.push({
                    text: values[index],
                    source: {
                        scope,
                        field: key,
                        index,
                    },
                });
            }
        }
    }

    buildKnownSourceTextSet() {
        const texts = new Set();

        const entries = this.buildScanEntries();
        for (const entry of entries) {
            const text = typeof entry?.text === 'string' ? entry.text : '';
            if (this.isUsableText(text)) {
                texts.add(text);
            }
        }

        return texts;
    }

    getKnownSourceTextSet() {
        if (this._knownSourceTexts instanceof Set) {
            return this._knownSourceTexts;
        }

        this._knownSourceTexts = this.buildKnownSourceTextSet();
        return this._knownSourceTexts;
    }

    isTargetSceneActive() {
        const sceneName = String(window.SceneManager?._scene?.constructor?.name || '');
        return sceneName === TARGET_SCENE_NAME;
    }

    enablePluginTranslation() {
        const menuProto = window.Window_MenuCommand?.prototype;
        const baseProto = window.Window_Base?.prototype;
        if (!menuProto || typeof menuProto.addMainCommands !== 'function') {
            return false;
        }

        if (!baseProto || typeof baseProto.drawText !== 'function') {
            return false;
        }

        const getKnownSourceTextSet = this.getKnownSourceTextSet.bind(this);
        const isUsableText = this.isUsableText.bind(this);
        const isTargetSceneActive = this.isTargetSceneActive.bind(this);
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);

        if (!menuProto[MENU_HOOK_FLAG]) {
            const originalAddMainCommands = menuProto.addMainCommands;

            menuProto.addMainCommands = function () {
                const result = originalAddMainCommands.apply(this, arguments);

                try {
                    if (!Array.isArray(this._list)) {
                        return result;
                    }

                    for (const entry of this._list) {
                        if (entry?.symbol !== 'partyChange' || !isUsableText(entry.name)) {
                            continue;
                        }

                        const runtime = getRuntime();
                        if (!runtime || !isRuntimeTranslationActive(runtime)) {
                            continue;
                        }

                        entry.name = resolveRuntimeTranslation(entry.name, runtime, CACHE_TYPE, {
                            requireRuntimeTranslationActive: true,
                            missValue: entry.name,
                        });
                    }
                } catch (error) {
                    console.warn(
                        '[KanjiPartyChangeTranslator] Failed to translate menu command text',
                        error
                    );
                }

                return result;
            };

            Object.defineProperty(menuProto, MENU_HOOK_FLAG, {
                value: true,
                configurable: true,
                enumerable: false,
                writable: false,
            });
        }

        if (!baseProto[DRAW_TEXT_HOOK_FLAG]) {
            const originalDrawText = baseProto.drawText;

            baseProto.drawText = function (text) {
                let nextText = text;

                try {
                    if (isTargetSceneActive() && isUsableText(text)) {
                        const knownTexts = getKnownSourceTextSet();
                        if (knownTexts.has(text)) {
                            const runtime = getRuntime();
                            if (runtime && isRuntimeTranslationActive(runtime)) {
                                nextText = resolveRuntimeTranslation(text, runtime, CACHE_TYPE, {
                                    requireRuntimeTranslationActive: true,
                                    missValue: text,
                                });
                            }
                        }
                    }
                } catch (error) {
                    console.warn('[KanjiPartyChangeTranslator] Failed to translate drawn text', error);
                }

                return originalDrawText.call(this, nextText, ...Array.prototype.slice.call(arguments, 1));
            };

            Object.defineProperty(baseProto, DRAW_TEXT_HOOK_FLAG, {
                value: true,
                configurable: true,
                enumerable: false,
                writable: false,
            });
        }

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
                this._knownSourceTexts = new Set(
                    this._scanEntries
                        .map((entry) => (typeof entry?.text === 'string' ? entry.text : ''))
                        .filter((text) => this.isUsableText(text))
                );
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[KanjiPartyChangeTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const entries = [];

        const pluginEntry = this.findPluginEntry(this.getPluginName());
        if (pluginEntry?.parameters) {
            this.appendEntriesFromParameters(pluginEntry.parameters, 'pluginEntryParameter', entries);
        }

        const runtimeParameters = this.getRuntimeParameters();
        if (runtimeParameters) {
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
            const text = typeof entry?.text === 'string' ? entry.text : '';
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (byCacheKey.has(cacheKey)) {
                continue;
            }

            byCacheKey.set(cacheKey, {
                type: this.getCacheType(),
                id: `plugin_kanji_party_change_${byCacheKey.size}`,
                value: text,
                cacheKey,
            });
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