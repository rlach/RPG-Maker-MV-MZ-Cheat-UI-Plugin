import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/**
 * FTKR_CustomSimpleActorStatus translator
 *
 * Plugin: FTKR_CustomSimpleActorStatus.js
 * Supported versions:
 * - v3.5.3 (MV): plugin parameter labels/formats and CSS custom gauge names.
 *
 * Notes:
 * - Most translatable text is stored in plugin parameters and exposed via
 *   FTKR.CSS.cssStatus runtime structures.
 * - Additional display labels can be loaded from actor/class note tags into
 *   cssGauges; this translator scans those parsed runtime objects when present.
 * - Runtime hooks patch narrow FTKR draw methods only and preserve plugin code
 *   tokens/command syntax.
 */

const CACHE_TYPE = 'plugin_ftkr_custom_simple_actor_status';

const SIMPLE_PARAMETER_KEYS = Object.freeze([
    'Display LevelUp Message',
    'Equip Right Arrow',
    'Format PDIFF Plus',
    'Format PDIFF Minus',
    'Format EDIFF Plus',
    'Format EDIFF Minus',
    'Format AOPDIFF Plus',
    'Format AOPDIFF Minus',
    'Format EDIFFAOP Plus',
    'Format EDIFFAOP Minus',
]);

function normalizeText(value) {
    return String(value || '').trim();
}

export class FtkrCustomSimpleActorStatusTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'FTKR_CustomSimpleActorStatus';
    }

    getPluginLabel() {
        return 'FTKR CustomSimpleActorStatus';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    findPluginEntry() {
        if (!Array.isArray(window.$plugins)) {
            return null;
        }

        const pluginName = normalizeText(this.getPluginName()).toLowerCase();
        return (
            window.$plugins.find((plugin) => {
                const name = normalizeText(plugin?.name).toLowerCase();
                return !!name && name === pluginName;
            }) || null
        );
    }

    getRuntimeParameters() {
        const pluginManager = window.PluginManager;
        if (!pluginManager || typeof pluginManager.parameters !== 'function') {
            return null;
        }

        const parameters = pluginManager.parameters(this.getPluginName());
        return parameters && typeof parameters === 'object' ? parameters : null;
    }

    appendTextEntry(text, source, output) {
        if (!this.isUsableText(text)) {
            return;
        }

        output.push({
            text,
            source,
        });
    }

    collectSimpleParameterEntries(parameters, scope, output) {
        for (const key of SIMPLE_PARAMETER_KEYS) {
            this.appendTextEntry(parameters[key], { scope, field: key }, output);
        }
    }

    collectCustomParameterEntries(parameters, scope, output) {
        for (let index = 0; index < 20; index++) {
            this.appendTextEntry(
                parameters[`Custom ${index} Display Name`],
                { scope, field: `Custom ${index} Display Name`, index },
                output
            );
            this.appendTextEntry(
                parameters[`Custom ${index} Unit`],
                { scope, field: `Custom ${index} Unit`, index },
                output
            );
        }
    }

    collectGaugeParameterEntries(parameters, scope, output) {
        for (let index = 0; index < 10; index++) {
            this.appendTextEntry(
                parameters[`Gauge ${index} Display Name`],
                { scope, field: `Gauge ${index} Display Name`, index },
                output
            );
        }
    }

    collectStructLabelEntries(parameters, fieldName, scope, output) {
        const parsed = parseJsonSafely(parameters[fieldName], null);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return;
        }

        for (const [key, value] of Object.entries(parsed)) {
            this.appendTextEntry(value, { scope, field: fieldName, key }, output);
        }
    }

    collectParameterEntries(parameters, scope, output) {
        if (!parameters || typeof parameters !== 'object') {
            return;
        }

        this.collectSimpleParameterEntries(parameters, scope, output);
        this.collectCustomParameterEntries(parameters, scope, output);
        this.collectGaugeParameterEntries(parameters, scope, output);
        this.collectStructLabelEntries(parameters, 'XPARAM Name', scope, output);
        this.collectStructLabelEntries(parameters, 'SPARAM Name', scope, output);
    }

    collectCssGaugeNameEntries(databaseObjects, scope, output) {
        const group = Array.isArray(databaseObjects) ? databaseObjects : [];
        for (let dataId = 1; dataId < group.length; dataId++) {
            const obj = group[dataId];
            const cssGauges = Array.isArray(obj?.cssGauges) ? obj.cssGauges : [];
            for (let gaugeIndex = 0; gaugeIndex < cssGauges.length; gaugeIndex++) {
                const gauge = cssGauges[gaugeIndex];
                this.appendTextEntry(gauge?.name, { scope, dataId, gaugeIndex }, output);
            }
        }
    }

    collectWindowBaseListEntries(output) {
        const itemTypes = Array.isArray(window.Window_Base?.ITEM_TYPES)
            ? window.Window_Base.ITEM_TYPES
            : [];
        for (let index = 0; index < itemTypes.length; index++) {
            this.appendTextEntry(itemTypes[index], { scope: 'windowBaseItemTypes', index }, output);
        }

        const itemScope = Array.isArray(window.Window_Base?.ITEM_SCOPE)
            ? window.Window_Base.ITEM_SCOPE
            : [];
        for (let index = 0; index < itemScope.length; index++) {
            this.appendTextEntry(itemScope[index], { scope: 'windowBaseItemScope', index }, output);
        }
    }

    translateCssText(text, runtime) {
        return this.resolveRuntimeTranslation(text, runtime, this.getCacheType(), {
            requireRuntimeTranslationActive: true,
            harvestMissing: false,
        });
    }

    enablePluginTranslation() {
        const windowBasePrototype = window.Window_Base?.prototype;
        if (!windowBasePrototype) {
            return false;
        }

        const requiredMethods = [
            'drawCssActorCustom',
            'drawCssActorGauge',
            'drawCssActorXParam',
            'drawCssActorSParam',
            'drawCssActorMessage',
            'drawCssActorStatusBase',
            'drawText',
            'drawTextEx',
        ];
        if (
            requiredMethods.some(
                (methodName) => typeof windowBasePrototype[methodName] !== 'function'
            )
        ) {
            return false;
        }

        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const translateCssText = this.translateCssText.bind(this);

        const originalDrawCssActorStatusBase = windowBasePrototype.drawCssActorStatusBase;
        windowBasePrototype.drawCssActorStatusBase = function () {
            this.__ftkrCssTranslationDepth = (Number(this.__ftkrCssTranslationDepth) || 0) + 1;
            try {
                return originalDrawCssActorStatusBase.apply(this, arguments);
            } finally {
                this.__ftkrCssTranslationDepth = Math.max(
                    0,
                    (Number(this.__ftkrCssTranslationDepth) || 1) - 1
                );
            }
        };

        const originalDrawText = windowBasePrototype.drawText;
        windowBasePrototype.drawText = function () {
            try {
                const runtime = getRuntime();
                if (
                    isRuntimeTranslationActive(runtime) &&
                    (Number(this.__ftkrCssTranslationDepth) || 0) > 0 &&
                    arguments.length > 0
                ) {
                    arguments[0] = translateCssText(arguments[0], runtime);
                }
            } catch (error) {
                console.warn(
                    '[FtkrCustomSimpleActorStatusTranslator] Failed to translate drawText in FTKR CSS scope',
                    error
                );
            }

            return originalDrawText.apply(this, arguments);
        };

        const originalDrawTextEx = windowBasePrototype.drawTextEx;
        windowBasePrototype.drawTextEx = function () {
            try {
                const runtime = getRuntime();
                if (
                    isRuntimeTranslationActive(runtime) &&
                    (Number(this.__ftkrCssTranslationDepth) || 0) > 0 &&
                    arguments.length > 0
                ) {
                    arguments[0] = translateCssText(arguments[0], runtime);
                }
            } catch (error) {
                console.warn(
                    '[FtkrCustomSimpleActorStatusTranslator] Failed to translate drawTextEx in FTKR CSS scope',
                    error
                );
            }

            return originalDrawTextEx.apply(this, arguments);
        };

        const originalDrawCssActorCustom = windowBasePrototype.drawCssActorCustom;
        windowBasePrototype.drawCssActorCustom = function () {
            try {
                const runtime = getRuntime();
                const custom = arguments[4];
                if (isRuntimeTranslationActive(runtime) && custom) {
                    const nextName = translateCssText(custom.name, runtime);
                    const nextUnit = translateCssText(custom.unit, runtime);
                    if (nextName !== custom.name || nextUnit !== custom.unit) {
                        arguments[4] = {
                            ...custom,
                            name: nextName,
                            unit: nextUnit,
                        };
                    }
                }
            } catch (error) {
                console.warn(
                    '[FtkrCustomSimpleActorStatusTranslator] Failed to translate custom parameter label',
                    error
                );
            }

            return originalDrawCssActorCustom.apply(this, arguments);
        };

        const originalDrawCssActorGauge = windowBasePrototype.drawCssActorGauge;
        windowBasePrototype.drawCssActorGauge = function () {
            try {
                const runtime = getRuntime();
                const gauge = arguments[4];
                if (isRuntimeTranslationActive(runtime) && gauge) {
                    const nextName = translateCssText(gauge.name, runtime);
                    if (nextName !== gauge.name) {
                        arguments[4] = {
                            ...gauge,
                            name: nextName,
                        };
                    }
                }
            } catch (error) {
                console.warn(
                    '[FtkrCustomSimpleActorStatusTranslator] Failed to translate gauge label',
                    error
                );
            }

            return originalDrawCssActorGauge.apply(this, arguments);
        };

        const originalDrawCssActorXParam = windowBasePrototype.drawCssActorXParam;
        windowBasePrototype.drawCssActorXParam = function () {
            const cssStatus = globalThis.FTKR?.CSS?.cssStatus;
            const paramLabels = Array.isArray(cssStatus?.xparam) ? cssStatus.xparam : null;

            if (!paramLabels) {
                return originalDrawCssActorXParam.apply(this, arguments);
            }

            const paramId = Number(arguments[4]);
            if (!Number.isFinite(paramId) || paramId < 0 || paramId >= paramLabels.length) {
                return originalDrawCssActorXParam.apply(this, arguments);
            }

            const sourceLabel = paramLabels[paramId];
            let translatedLabel = sourceLabel;

            try {
                const runtime = getRuntime();
                if (isRuntimeTranslationActive(runtime)) {
                    translatedLabel = translateCssText(sourceLabel, runtime);
                }
            } catch (error) {
                console.warn(
                    '[FtkrCustomSimpleActorStatusTranslator] Failed to translate xparam label',
                    error
                );
            }

            if (translatedLabel === sourceLabel) {
                return originalDrawCssActorXParam.apply(this, arguments);
            }

            paramLabels[paramId] = translatedLabel;
            try {
                return originalDrawCssActorXParam.apply(this, arguments);
            } finally {
                paramLabels[paramId] = sourceLabel;
            }
        };

        const originalDrawCssActorSParam = windowBasePrototype.drawCssActorSParam;
        windowBasePrototype.drawCssActorSParam = function () {
            const cssStatus = globalThis.FTKR?.CSS?.cssStatus;
            const paramLabels = Array.isArray(cssStatus?.sparam) ? cssStatus.sparam : null;

            if (!paramLabels) {
                return originalDrawCssActorSParam.apply(this, arguments);
            }

            const paramId = Number(arguments[4]);
            if (!Number.isFinite(paramId) || paramId < 0 || paramId >= paramLabels.length) {
                return originalDrawCssActorSParam.apply(this, arguments);
            }

            const sourceLabel = paramLabels[paramId];
            let translatedLabel = sourceLabel;

            try {
                const runtime = getRuntime();
                if (isRuntimeTranslationActive(runtime)) {
                    translatedLabel = translateCssText(sourceLabel, runtime);
                }
            } catch (error) {
                console.warn(
                    '[FtkrCustomSimpleActorStatusTranslator] Failed to translate sparam label',
                    error
                );
            }

            if (translatedLabel === sourceLabel) {
                return originalDrawCssActorSParam.apply(this, arguments);
            }

            paramLabels[paramId] = translatedLabel;
            try {
                return originalDrawCssActorSParam.apply(this, arguments);
            } finally {
                paramLabels[paramId] = sourceLabel;
            }
        };

        const originalDrawCssActorMessage = windowBasePrototype.drawCssActorMessage;
        windowBasePrototype.drawCssActorMessage = function () {
            const cssStatus = globalThis.FTKR?.CSS?.cssStatus;
            const messageSettings = cssStatus?.message;
            const sourceTemplate = messageSettings?.levelUp;

            if (!messageSettings || !sourceTemplate) {
                return originalDrawCssActorMessage.apply(this, arguments);
            }

            let translatedTemplate = sourceTemplate;
            try {
                const runtime = getRuntime();
                if (isRuntimeTranslationActive(runtime)) {
                    translatedTemplate = translateCssText(sourceTemplate, runtime);
                }
            } catch (error) {
                console.warn(
                    '[FtkrCustomSimpleActorStatusTranslator] Failed to translate level up template',
                    error
                );
            }

            if (translatedTemplate === sourceTemplate) {
                return originalDrawCssActorMessage.apply(this, arguments);
            }

            messageSettings.levelUp = translatedTemplate;
            try {
                return originalDrawCssActorMessage.apply(this, arguments);
            } finally {
                messageSettings.levelUp = sourceTemplate;
            }
        };

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

        this._scanPromise = this.buildScanEntries()
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[FtkrCustomSimpleActorStatusTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];
        const globals = /** @type {any} */ (globalThis);

        const pluginEntry = this.findPluginEntry();
        if (pluginEntry?.parameters) {
            this.collectParameterEntries(pluginEntry.parameters, 'pluginEntryParameter', entries);
        }

        const runtimeParameters = this.getRuntimeParameters();
        if (runtimeParameters) {
            this.collectParameterEntries(
                runtimeParameters,
                'runtimePluginManagerParameter',
                entries
            );
        }

        this.collectCssGaugeNameEntries(globals.$dataActors, 'actorCssGaugeMeta', entries);
        this.collectCssGaugeNameEntries(globals.$dataClasses, 'classCssGaugeMeta', entries);
        this.collectWindowBaseListEntries(entries);

        return entries;
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
                id: `plugin_ftkr_custom_simple_actor_status_${byCacheKey.size}`,
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
