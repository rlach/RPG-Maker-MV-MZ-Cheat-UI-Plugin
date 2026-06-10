import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * NRP_AutoHeal translator.
 *
 * Supported plugin versions:
 * - NRP_AutoHeal.js v1.001 (MV/MZ)
 *
 * Translation notes:
 * - Translatable strings come from plugin parameters (`AutoHealName` and
 *   message templates for success/failure/unnecessary cases).
 * - Runtime translation hooks menu-command display and `Game_Message.add`
 *   for plugin-owned fixed messages only.
 */

const PLUGIN_NAME = 'NRP_AutoHeal';
const CACHE_TYPE = 'plugin_nrp_auto_heal';

const MENU_HOOK_FLAG = '__CHEAT_NRP_AUTO_HEAL_MENU_HOOKED__';
const MESSAGE_HOOK_FLAG = '__CHEAT_NRP_AUTO_HEAL_MESSAGE_HOOKED__';

const TEXT_PARAMETER_KEYS = [
    'AutoHealName',
    'MessageSuccess',
    'MessageUnnecessary',
    'MessageFailure',
];

export class NRP_AutoHealTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return PLUGIN_NAME;
    }

    getPluginAliases() {
        return [PLUGIN_NAME, 'NRP_Autoheal'];
    }

    getPluginLabel() {
        return 'NRP AutoHeal';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    _appendParameterEntries(parameters, scope, output) {
        if (!parameters || typeof parameters !== 'object' || !Array.isArray(output)) {
            return;
        }

        for (const key of TEXT_PARAMETER_KEYS) {
            const text = parameters[key];
            if (!this.isUsableText(text)) {
                continue;
            }

            output.push({
                text: String(text),
                source: {
                    scope,
                    field: key,
                },
            });
        }
    }

    _resolveRuntimeParameters() {
        if (!window.PluginManager?.parameters) {
            return null;
        }

        return window.PluginManager.parameters(this.getPluginName()) || null;
    }

    _resolveMenuSymbol() {
        const runtimeParameters = this._resolveRuntimeParameters();
        const pluginEntry = this.findPluginEntry(this.getPluginName());
        const manifestParameters = pluginEntry?.parameters || null;

        const source = runtimeParameters || manifestParameters;
        const symbol = String(source?.AutoHealSymbol || '').trim();
        return symbol || 'autoheal';
    }

    _buildKnownSourceTextSet() {
        const sourceEntries = this._scanPrepared ? this._scanEntries : this.buildScanEntries();
        const known = new Set();

        for (const entry of sourceEntries) {
            const text = typeof entry?.text === 'string' ? entry.text : '';
            if (this.isUsableText(text)) {
                known.add(text);
            }
        }

        return known;
    }

    buildScanEntries() {
        const entries = [];

        const pluginEntry = this.findPluginEntry(this.getPluginName());
        if (pluginEntry?.parameters) {
            this._appendParameterEntries(pluginEntry.parameters, 'pluginEntry', entries);
        }

        const runtimeParameters = this._resolveRuntimeParameters();
        this._appendParameterEntries(runtimeParameters, 'runtimeParameters', entries);

        return entries;
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
                console.warn('[NRP_AutoHealTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    _buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry?.text === 'string' ? entry.text : '';
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_nrp_auto_heal_${byCacheKey.size}`,
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
        const menuProto = window.Window_MenuCommand?.prototype;
        const gameMessageProto = window.Game_Message?.prototype;

        if (
            !menuProto ||
            typeof menuProto.addMainCommands !== 'function' ||
            !gameMessageProto ||
            typeof gameMessageProto.add !== 'function'
        ) {
            return false;
        }

        const getRuntime = this.getRuntime.bind(this);
        const isUsableText = this.isUsableText.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);
        const cacheType = this.getCacheType();
        const resolveMenuSymbol = this._resolveMenuSymbol.bind(this);
        const buildKnownSourceTextSet = this._buildKnownSourceTextSet.bind(this);

        if (!menuProto[MENU_HOOK_FLAG]) {
            const originalAddMainCommands = menuProto.addMainCommands;
            menuProto.addMainCommands = function () {
                const result = originalAddMainCommands.apply(this, arguments);

                try {
                    const runtime = getRuntime();
                    if (!runtime || !Array.isArray(this._list)) {
                        return result;
                    }

                    const menuSymbol = resolveMenuSymbol();
                    const command = this._list.find((entry) => entry?.symbol === menuSymbol);
                    const sourceText = String(command?.name || '');
                    if (!isUsableText(sourceText)) {
                        return result;
                    }

                    const cacheKey = runtime.getCacheKey(sourceText, cacheType);
                    runtime.trackCacheKeyUsage(cacheKey);

                    if (!isRuntimeTranslationActive(runtime)) {
                        return result;
                    }

                    command.name = resolveRuntimeTranslation(sourceText, runtime, cacheType, {
                        requireRuntimeTranslationActive: true,
                        missValue: sourceText,
                        harvestMissing: false,
                    });
                } catch (error) {
                    console.warn(
                        '[NRP_AutoHealTranslator] Failed to translate menu command',
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

        if (!gameMessageProto[MESSAGE_HOOK_FLAG]) {
            const originalAdd = gameMessageProto.add;
            gameMessageProto.add = function (text) {
                let nextText = text;

                try {
                    const runtime = getRuntime();
                    const sourceText = String(text || '');
                    if (!runtime || !isUsableText(sourceText)) {
                        return originalAdd.call(this, nextText);
                    }

                    const knownSourceTexts = buildKnownSourceTextSet();
                    if (!knownSourceTexts.has(sourceText)) {
                        return originalAdd.call(this, nextText);
                    }

                    const cacheKey = runtime.getCacheKey(sourceText, cacheType);
                    runtime.trackCacheKeyUsage(cacheKey);

                    if (!isRuntimeTranslationActive(runtime)) {
                        return originalAdd.call(this, nextText);
                    }

                    nextText = resolveRuntimeTranslation(sourceText, runtime, cacheType, {
                        requireRuntimeTranslationActive: true,
                        missValue: sourceText,
                        harvestMissing: false,
                    });
                } catch (error) {
                    console.warn(
                        '[NRP_AutoHealTranslator] Failed to translate message text',
                        error
                    );
                }

                return originalAdd.call(this, nextText);
            };

            Object.defineProperty(gameMessageProto, MESSAGE_HOOK_FLAG, {
                value: true,
                configurable: true,
                enumerable: false,
                writable: false,
            });
        }

        return true;
    }
}
