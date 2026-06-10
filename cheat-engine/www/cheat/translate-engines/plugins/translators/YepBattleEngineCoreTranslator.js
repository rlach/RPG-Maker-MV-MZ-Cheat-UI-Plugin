import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * YEP_BattleEngineCore translator
 *
 * Supported plugin versions:
 * - YEP_BattleEngineCore.js v1.46 (MV)
 * - YEP_BattleEngineCore.js v1.51 (MV)
 *
 * Translation notes:
 * - Source strings are collected from plugin parameters in the enabled plugin
 *   entry and PluginManager runtime parameters.
 * - Runtime hooks patch battle command list creation points to translate
 *   command labels without touching command symbols.
 */

const PLUGIN_NAME = 'YEP_BattleEngineCore';
const CACHE_TYPE = 'plugin_yep_battle_engine_core';

const PARTY_COMMAND_SYMBOLS = new Set(['fight', 'escape']);
const ACTOR_COMMAND_SYMBOLS = new Set(['attack', 'guard', 'item']);

const HOOK_FLAG_PARTY = '__CHEAT_YEP_BATTLE_ENGINE_CORE_PARTY_COMMAND_HOOKED__';
const HOOK_FLAG_ACTOR = '__CHEAT_YEP_BATTLE_ENGINE_CORE_ACTOR_COMMAND_HOOKED__';

const PARAM_EXCLUDE_KEYS = new Set([
    'ActionSpeed',
    'DefaultActionSpeed',
    'ReflectAnimation',
    'MotionSpeed',
]);

export class YepBattleEngineCoreTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return PLUGIN_NAME;
    }

    getPluginLabel() {
        return 'YEP Battle Engine Core';
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
                console.warn('[YepBattleEngineCoreTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const entries = [];

        const pluginEntry = this.findPluginEntry(this.getPluginName());
        this._appendParameterEntries(entries, pluginEntry?.parameters, 'pluginEntry');

        if (typeof window.PluginManager?.parameters === 'function') {
            this._appendParameterEntries(
                entries,
                window.PluginManager.parameters(this.getPluginName()),
                'runtimeParameters'
            );
        }

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

        if (!this._scanPrepared) {
            this._scanEntries = this.buildScanEntries();
            this._scanPrepared = true;
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
        const partyProto = window.Window_PartyCommand?.prototype;
        const actorProto = window.Window_ActorCommand?.prototype;

        if (
            !partyProto ||
            typeof partyProto.makeCommandList !== 'function' ||
            !actorProto ||
            typeof actorProto.makeCommandList !== 'function'
        ) {
            return false;
        }

        const applyRuntimeTranslationToCommand = this._applyRuntimeTranslationToCommand.bind(this);

        if (!partyProto[HOOK_FLAG_PARTY]) {
            const originalMakeCommandList = partyProto.makeCommandList;
            partyProto.makeCommandList = function () {
                const result = originalMakeCommandList.apply(this, arguments);
                if (Array.isArray(this._list)) {
                    for (const command of this._list) {
                        applyRuntimeTranslationToCommand(command, PARTY_COMMAND_SYMBOLS);
                    }
                }
                return result;
            };

            Object.defineProperty(partyProto, HOOK_FLAG_PARTY, {
                value: true,
                configurable: true,
                enumerable: false,
                writable: false,
            });
        }

        if (!actorProto[HOOK_FLAG_ACTOR]) {
            const originalMakeCommandList = actorProto.makeCommandList;
            actorProto.makeCommandList = function () {
                const result = originalMakeCommandList.apply(this, arguments);
                if (Array.isArray(this._list)) {
                    for (const command of this._list) {
                        applyRuntimeTranslationToCommand(command, ACTOR_COMMAND_SYMBOLS);
                    }
                }
                return result;
            };

            Object.defineProperty(actorProto, HOOK_FLAG_ACTOR, {
                value: true,
                configurable: true,
                enumerable: false,
                writable: false,
            });
        }

        return true;
    }

    _appendParameterEntries(output, parameters, scope) {
        if (!Array.isArray(output) || !parameters || typeof parameters !== 'object') {
            return;
        }

        for (const [field, rawValue] of Object.entries(parameters)) {
            if (PARAM_EXCLUDE_KEYS.has(String(field))) {
                continue;
            }

            if (!this._isTranslatableParameterText(rawValue)) {
                continue;
            }

            output.push({
                text: String(rawValue),
                source: {
                    scope,
                    field,
                },
            });
        }
    }

    _isTranslatableParameterText(value) {
        if (!this.isUsableText(value)) {
            return false;
        }

        const text = String(value);
        const trimmed = text.trim();

        if (/^(true|false)$/i.test(trimmed)) {
            return false;
        }

        if (/^[+-]?\d+(?:\.\d+)?$/.test(trimmed)) {
            return false;
        }

        if (
            /[{};]|\$game|\$data|\$gameSwitches|\$gameVariables|\bMath\b|=>|\bthis\b/.test(trimmed)
        ) {
            return false;
        }

        return true;
    }

    _applyRuntimeTranslationToCommand(command, allowedSymbols) {
        if (!command || typeof command !== 'object') {
            return;
        }

        const symbol = String(command.symbol || '');
        if (!allowedSymbols.has(symbol)) {
            return;
        }

        const sourceText = String(command.name || '');
        if (!this.isUsableText(sourceText)) {
            return;
        }

        const runtime = this.getRuntime();
        if (!runtime) {
            return;
        }

        if (!this.isRuntimeTranslationActive(runtime)) {
            const cacheKey = runtime.getCacheKey(sourceText, this.getCacheType());
            runtime.trackCacheKeyUsage(cacheKey);
            return;
        }

        command.name = this.resolveRuntimeTranslation(sourceText, runtime, this.getCacheType(), {
            requireRuntimeTranslationActive: true,
            missValue: sourceText,
        });
    }

    _buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = entry?.text;
            if (!this.isUsableText(text)) {
                continue;
            }

            const sourceText = String(text);
            const cacheKey = runtime.getCacheKey(sourceText, this.getCacheType());
            if (byCacheKey.has(cacheKey)) {
                continue;
            }

            byCacheKey.set(cacheKey, {
                type: this.getCacheType(),
                id: `plugin_yep_battle_engine_core_${byCacheKey.size}`,
                value: sourceText,
                cacheKey,
            });
        }

        return Array.from(byCacheKey.values());
    }
}
