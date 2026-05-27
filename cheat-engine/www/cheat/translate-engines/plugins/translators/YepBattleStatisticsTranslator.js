import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * YEP_X_BattleStatistics translator
 *
 * Plugin: YEP_X_BattleStatistics.js
 * Supported versions:
 * - v1.02 (MV): status command label and battle statistics labels/formats.
 *
 * Notes:
 * - Translatable strings are sourced from plugin parameters mirrored into
 *   Yanfly.Param.BStats* runtime fields.
 * - Runtime hooks patch YEP battle-stat draw methods and command builders.
 *   Format templates are translated before .format(...) is applied.
 */

const PLUGIN_NAME = 'YEP_X_BattleStatistics';
const CACHE_TYPE = 'plugin_yep_x_battle_statistics';

const TRANSLATABLE_PARAMETER_KEYS = Object.freeze([
    'Command Name',
    'Battle Count Text',
    'Battle Count Format',
    'Kill Count Text',
    'Kill Count Format',
    'Death Count Text',
    'Death Count Format',
    'Assist Count Text',
    'Assist Count Format',
    'Damage Dealt',
    'Damage Taken',
    'Healing Dealt',
    'Healing Taken',
]);

const RUNTIME_PARAM_KEYS = Object.freeze({
    command: ['BStatsCmdName'],
    battleCount: ['BStatsBCountText', 'BStatsBCountFmt'],
    kdaCount: ['BStatsKCountText', 'BStatsDCountText', 'BStatsACountText'],
    kdaRatios: ['BStatsKCountFmt', 'BStatsDCountFmt', 'BStatsACountFmt'],
    totals: ['BStatsDmgDealt', 'BStatsDmgTaken', 'BStatsHealDealt', 'BStatsHealTaken'],
});

export class YepBattleStatisticsTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
        this._knownTexts = null;
    }

    getPluginName() {
        return PLUGIN_NAME;
    }

    getPluginLabel() {
        return 'YEP X BattleStatistics';
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
        if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
            return null;
        }

        return parameters;
    }

    appendParameterEntries(output, parameters, scope) {
        if (!Array.isArray(output) || !parameters || typeof parameters !== 'object') {
            return;
        }

        for (const key of TRANSLATABLE_PARAMETER_KEYS) {
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

    buildScanEntries() {
        const entries = [];

        const pluginEntry = this.findPluginEntry(this.getPluginName());
        if (pluginEntry?.parameters) {
            this.appendParameterEntries(entries, pluginEntry.parameters, 'pluginEntryParameters');
        }

        const runtimeParameters = this.getRuntimeParameters();
        if (runtimeParameters) {
            this.appendParameterEntries(entries, runtimeParameters, 'runtimePluginParameters');
        }

        return entries;
    }

    async precomputeCounts() {
        if (this._scanPrepared) {
            return;
        }

        if (this._scanPromise) {
            return this._scanPromise;
        }

        this._scanPromise = Promise.resolve(this.buildScanEntries())
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this._knownTexts = null;
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[YepBattleStatisticsTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    getKnownTexts() {
        if (this._knownTexts instanceof Set) {
            return this._knownTexts;
        }

        const sourceEntries = this._scanPrepared ? this._scanEntries : this.buildScanEntries();
        const known = new Set();

        for (const entry of sourceEntries) {
            const text = entry?.text;
            if (!this.isUsableText(text)) {
                continue;
            }

            known.add(String(text));
        }

        this._knownTexts = known;
        return known;
    }

    translateKnownText(text, runtime) {
        if (!this.isUsableText(text)) {
            return text;
        }

        const sourceText = String(text);
        if (!this.getKnownTexts().has(sourceText)) {
            return sourceText;
        }

        return this.resolveRuntimeTranslation(sourceText, runtime, this.getCacheType(), {
            requireRuntimeTranslationActive: true,
        });
    }

    withTranslatedRuntimeParams(runtime, paramKeys, invoke) {
        const yanflyParams = window.Yanfly?.Param;
        if (!yanflyParams || !this.isRuntimeTranslationActive(runtime) || !Array.isArray(paramKeys)) {
            return invoke();
        }

        const restore = [];

        for (const key of paramKeys) {
            const original = yanflyParams[key];
            const translated = this.translateKnownText(original, runtime);

            if (translated === original) {
                continue;
            }

            yanflyParams[key] = translated;
            restore.push([key, original]);
        }

        if (!restore.length) {
            return invoke();
        }

        try {
            return invoke();
        } finally {
            for (const [key, original] of restore) {
                yanflyParams[key] = original;
            }
        }
    }

    installStatusCommandHooks() {
        const klass = window.Window_StatusCommand;
        if (!klass?.prototype) {
            return false;
        }

        const getRuntime = this.getRuntime.bind(this);
        let installed = false;

        if (
            typeof klass.prototype.createCommand === 'function' &&
            !klass.prototype.__CHEAT_YEP_X_BATTLE_STATISTICS_CREATE_COMMAND_HOOKED__
        ) {
            const original = klass.prototype.createCommand;
            const withTranslatedRuntimeParams = this.withTranslatedRuntimeParams.bind(this);
            klass.prototype.createCommand = function () {
                return withTranslatedRuntimeParams(getRuntime(), RUNTIME_PARAM_KEYS.command, () =>
                    original.apply(this, arguments)
                );
            };

            klass.prototype.__CHEAT_YEP_X_BATTLE_STATISTICS_CREATE_COMMAND_HOOKED__ = true;
            installed = true;
        }

        if (
            typeof klass.prototype.addCustomCommands === 'function' &&
            !klass.prototype.__CHEAT_YEP_X_BATTLE_STATISTICS_ADD_CUSTOM_COMMANDS_HOOKED__
        ) {
            const original = klass.prototype.addCustomCommands;
            const withTranslatedRuntimeParams = this.withTranslatedRuntimeParams.bind(this);
            klass.prototype.addCustomCommands = function () {
                return withTranslatedRuntimeParams(getRuntime(), RUNTIME_PARAM_KEYS.command, () =>
                    original.apply(this, arguments)
                );
            };

            klass.prototype.__CHEAT_YEP_X_BATTLE_STATISTICS_ADD_CUSTOM_COMMANDS_HOOKED__ = true;
            installed = true;
        }

        return installed;
    }

    installStatusInfoHooks() {
        const klass = window.Window_StatusInfo;
        if (!klass?.prototype) {
            return false;
        }

        const getRuntime = this.getRuntime.bind(this);
        let installed = false;

        if (
            typeof klass.prototype.drawBattleCount === 'function' &&
            !klass.prototype.__CHEAT_YEP_X_BATTLE_STATISTICS_DRAW_BATTLE_COUNT_HOOKED__
        ) {
            const original = klass.prototype.drawBattleCount;
            const withTranslatedRuntimeParams = this.withTranslatedRuntimeParams.bind(this);
            klass.prototype.drawBattleCount = function () {
                return withTranslatedRuntimeParams(getRuntime(), RUNTIME_PARAM_KEYS.battleCount, () =>
                    original.apply(this, arguments)
                );
            };

            klass.prototype.__CHEAT_YEP_X_BATTLE_STATISTICS_DRAW_BATTLE_COUNT_HOOKED__ = true;
            installed = true;
        }

        if (
            typeof klass.prototype.drawKDACount === 'function' &&
            !klass.prototype.__CHEAT_YEP_X_BATTLE_STATISTICS_DRAW_KDA_COUNT_HOOKED__
        ) {
            const original = klass.prototype.drawKDACount;
            const withTranslatedRuntimeParams = this.withTranslatedRuntimeParams.bind(this);
            klass.prototype.drawKDACount = function () {
                return withTranslatedRuntimeParams(getRuntime(), RUNTIME_PARAM_KEYS.kdaCount, () =>
                    original.apply(this, arguments)
                );
            };

            klass.prototype.__CHEAT_YEP_X_BATTLE_STATISTICS_DRAW_KDA_COUNT_HOOKED__ = true;
            installed = true;
        }

        if (
            typeof klass.prototype.drawKDARatios === 'function' &&
            !klass.prototype.__CHEAT_YEP_X_BATTLE_STATISTICS_DRAW_KDA_RATIOS_HOOKED__
        ) {
            const original = klass.prototype.drawKDARatios;
            const withTranslatedRuntimeParams = this.withTranslatedRuntimeParams.bind(this);
            klass.prototype.drawKDARatios = function () {
                return withTranslatedRuntimeParams(getRuntime(), RUNTIME_PARAM_KEYS.kdaRatios, () =>
                    original.apply(this, arguments)
                );
            };

            klass.prototype.__CHEAT_YEP_X_BATTLE_STATISTICS_DRAW_KDA_RATIOS_HOOKED__ = true;
            installed = true;
        }

        if (
            typeof klass.prototype.drawTotalDamageHealing === 'function' &&
            !klass.prototype.__CHEAT_YEP_X_BATTLE_STATISTICS_DRAW_TOTALS_HOOKED__
        ) {
            const original = klass.prototype.drawTotalDamageHealing;
            const withTranslatedRuntimeParams = this.withTranslatedRuntimeParams.bind(this);
            klass.prototype.drawTotalDamageHealing = function () {
                return withTranslatedRuntimeParams(getRuntime(), RUNTIME_PARAM_KEYS.totals, () =>
                    original.apply(this, arguments)
                );
            };

            klass.prototype.__CHEAT_YEP_X_BATTLE_STATISTICS_DRAW_TOTALS_HOOKED__ = true;
            installed = true;
        }

        return installed;
    }

    enablePluginTranslation() {
        const commandReady =
            !!window.Window_StatusCommand?.prototype &&
            (typeof window.Window_StatusCommand.prototype.createCommand === 'function' ||
                typeof window.Window_StatusCommand.prototype.addCustomCommands === 'function');
        const statusInfoReady =
            !!window.Window_StatusInfo?.prototype &&
            (typeof window.Window_StatusInfo.prototype.drawBattleCount === 'function' ||
                typeof window.Window_StatusInfo.prototype.drawKDACount === 'function' ||
                typeof window.Window_StatusInfo.prototype.drawKDARatios === 'function' ||
                typeof window.Window_StatusInfo.prototype.drawTotalDamageHealing === 'function');

        if (!commandReady && !statusInfoReady) {
            return false;
        }

        const commandInstalled = this.installStatusCommandHooks();
        const statusInfoInstalled = this.installStatusInfoHooks();

        return commandInstalled || statusInfoInstalled;
    }

    buildUniquePendingItems(runtime) {
        const entries = this._scanPrepared ? this._scanEntries : this.buildScanEntries();
        const byCacheKey = new Map();

        for (const entry of entries) {
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
                id: `plugin_yep_x_battle_statistics_${byCacheKey.size}`,
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