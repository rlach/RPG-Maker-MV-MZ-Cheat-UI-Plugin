import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * AlchemySystem translator
 *
 * Plugin: AlchemySystem.js
 * Supported versions:
 * - v2.1.2 (MV/MZ): alchemy menu command label and alchemy scene UI labels.
 *
 * Notes:
 * - Translatable strings are defined in plugin parameters.
 * - Runtime translation is applied only to known AlchemySystem UI labels so item names
 *   and engine-wide UI text stay in their own cache domains.
 */

const CACHE_TYPE = 'plugin_alchemy_system';

const TEXT_PARAMETER_KEYS = Object.freeze([
    'MenuAlchemyText',
    'NeedMaterialText',
    'NeedPriceText',
    'TargetItemText',
    'NoteParseErrorMessage',
]);

function getSceneName() {
    const scene = window.SceneManager?._scene;
    return typeof scene?.constructor?.name === 'string' ? scene.constructor.name : '';
}

function isAlchemySceneActive() {
    return getSceneName() === 'Scene_Alchemy';
}

export class AlchemySystemTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
        this._knownSourceTexts = null;
    }

    getPluginName() {
        return 'AlchemySystem';
    }

    getPluginLabel() {
        return 'AlchemySystem';
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

    appendParameterEntries(parameters, scope, output) {
        if (!parameters || typeof parameters !== 'object' || !Array.isArray(output)) {
            return;
        }

        for (const field of TEXT_PARAMETER_KEYS) {
            const text = parameters[field];
            if (!this.isUsableText(text)) {
                continue;
            }

            output.push({
                text: String(text),
                source: {
                    scope,
                    field,
                },
            });
        }
    }

    buildRuntimeEntries() {
        const entries = [];

        const pluginEntry = this.findPluginEntry(this.getPluginName());
        if (pluginEntry?.parameters) {
            this.appendParameterEntries(pluginEntry.parameters, 'pluginEntryParameter', entries);
        }

        const runtimeParameters = this.getRuntimeParameters();
        if (runtimeParameters) {
            this.appendParameterEntries(
                runtimeParameters,
                'runtimePluginManagerParameter',
                entries
            );
        }

        return entries;
    }

    getKnownSourceTexts() {
        if (this._knownSourceTexts instanceof Set) {
            return this._knownSourceTexts;
        }

        const known = new Set();
        const entries = this._scanPrepared ? this._scanEntries : this.buildRuntimeEntries();
        for (const entry of entries) {
            const text = entry?.text;
            if (!this.isUsableText(text)) {
                continue;
            }

            known.add(String(text));
        }

        this._knownSourceTexts = known;
        return known;
    }

    shouldTranslateRuntimeText(text) {
        if (!this.isUsableText(text)) {
            return false;
        }

        return this.getKnownSourceTexts().has(String(text));
    }

    translateRuntimeText(text, runtime) {
        if (!this.shouldTranslateRuntimeText(text)) {
            return text;
        }

        return this.resolveRuntimeTranslation(text, runtime, this.getCacheType(), {
            requireRuntimeTranslationActive: true,
        });
    }

    enablePluginTranslation() {
        const canHookMenuCommands =
            !!window.Window_MenuCommand?.prototype &&
            typeof Window_MenuCommand.prototype.addOriginalCommands === 'function';
        const canHookDrawText =
            !!window.Window_Base?.prototype && typeof Window_Base.prototype.drawText === 'function';

        if (!canHookMenuCommands && !canHookDrawText) {
            return false;
        }

        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const translateRuntimeText = this.translateRuntimeText.bind(this);

        if (canHookMenuCommands) {
            const originalAddOriginalCommands = Window_MenuCommand.prototype.addOriginalCommands;

            Window_MenuCommand.prototype.addOriginalCommands = function () {
                const result = originalAddOriginalCommands.apply(this, arguments);

                try {
                    const runtime = getRuntime();
                    if (!isRuntimeTranslationActive(runtime) || !Array.isArray(this._list)) {
                        return result;
                    }

                    for (const entry of this._list) {
                        if (entry?.symbol !== 'alchemy') {
                            continue;
                        }

                        entry.name = translateRuntimeText(entry.name, runtime);
                    }
                } catch (error) {
                    console.warn(
                        '[AlchemySystemTranslator] Failed to translate alchemy menu command label',
                        error
                    );
                }

                return result;
            };
        }

        if (canHookDrawText) {
            const originalDrawText = Window_Base.prototype.drawText;

            Window_Base.prototype.drawText = function () {
                try {
                    const runtime = getRuntime();
                    if (
                        isRuntimeTranslationActive(runtime) &&
                        isAlchemySceneActive() &&
                        arguments.length > 0
                    ) {
                        arguments[0] = translateRuntimeText(arguments[0], runtime);
                    }
                } catch (error) {
                    console.warn(
                        '[AlchemySystemTranslator] Failed to translate AlchemySystem scene text',
                        error
                    );
                }

                return originalDrawText.apply(this, arguments);
            };
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
                this._knownSourceTexts = null;
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[AlchemySystemTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        return this.buildRuntimeEntries();
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = entry?.text;
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (byCacheKey.has(cacheKey)) {
                continue;
            }

            byCacheKey.set(cacheKey, {
                type: this.getCacheType(),
                id: `plugin_alchemy_system_${byCacheKey.size}`,
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