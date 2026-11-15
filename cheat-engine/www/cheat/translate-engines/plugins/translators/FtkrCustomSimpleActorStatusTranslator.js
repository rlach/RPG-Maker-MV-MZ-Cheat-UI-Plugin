import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';
import { TAG_TYPE, TAG_STYLE, TAG_BRACKET } from '../../ai-engine/constants.js';

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

// Parameter keys for new and old versions
const SIMPLE_PARAMETER_KEYS_NEW = [
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
];
const SIMPLE_PARAMETER_KEYS_OLD = ['Display LevelUp Message', 'Equip Right Arrow'];

// Old versions have fewer custom/gauge slots and no XPARAM/SPARAM Name fields
const CUSTOM_PARAM_COUNT_NEW = 20;
const CUSTOM_PARAM_COUNT_OLD = 10;
const GAUGE_PARAM_COUNT_NEW = 10;
const GAUGE_PARAM_COUNT_OLD = 10;

function isOldFtkrCssParams(parameters) {
    // Heuristic: old versions lack Format PDIFF Plus, XPARAM Name, SPARAM Name
    return (
        !('Format PDIFF Plus' in parameters) &&
        !('XPARAM Name' in parameters) &&
        !('SPARAM Name' in parameters)
    );
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
        const isOld = isOldFtkrCssParams(parameters);
        const keys = isOld ? SIMPLE_PARAMETER_KEYS_OLD : SIMPLE_PARAMETER_KEYS_NEW;
        for (const key of keys) {
            this.appendTextEntry(parameters[key], { scope, field: key }, output);
        }
    }

    collectCustomParameterEntries(parameters, scope, output) {
        const isOld = isOldFtkrCssParams(parameters);
        const count = isOld ? CUSTOM_PARAM_COUNT_OLD : CUSTOM_PARAM_COUNT_NEW;
        for (let index = 0; index < count; index++) {
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
        const isOld = isOldFtkrCssParams(parameters);
        const count = isOld ? GAUGE_PARAM_COUNT_OLD : GAUGE_PARAM_COUNT_NEW;
        for (let index = 0; index < count; index++) {
            this.appendTextEntry(
                parameters[`Gauge ${index} Display Name`],
                { scope, field: `Gauge ${index} Display Name`, index },
                output
            );
        }
    }

    collectStructLabelEntries(parameters, fieldName, scope, output) {
        // Only present in newer versions
        if (!(fieldName in parameters)) return;
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
        // Only scan XPARAM/SPARAM Name if present (newer versions)
        if ('XPARAM Name' in parameters) {
            this.collectStructLabelEntries(parameters, 'XPARAM Name', scope, output);
        }
        if ('SPARAM Name' in parameters) {
            this.collectStructLabelEntries(parameters, 'SPARAM Name', scope, output);
        }
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
        this.registerPluginCustomTags(
            ['CSS_画像', 'CSS_IMAGE', 'CSS_カスタム', 'CSS_CUSTOM'].flatMap((tagSymbol) => [
                {
                    tagSymbol,
                    description: 'FTKR CSS image or custom status section identifier',
                    style: TAG_STYLE.XML,
                    bracket: TAG_BRACKET.NONE,
                    type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
                    maskValue: true,
                    requiredConsistency: true,
                },
                {
                    tagSymbol: `/${tagSymbol}`,
                    description: 'FTKR CSS section closing delimiter',
                    style: TAG_STYLE.XML,
                    type: TAG_TYPE.WITHOUT_PARAMETER,
                    requiredConsistency: true,
                },
            ])
        );
        const windowBasePrototype = window.Window_Base?.prototype;
        if (!windowBasePrototype) {
            console.log(
                '[FtkrCustomSimpleActorStatusTranslator] Window_Base not found, cannot enable translation'
            );
            return false;
        }

        const requiredMethods = [
            'drawCssActorCustom',
            'drawCssActorGauge',
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
            console.log(
                '[FtkrCustomSimpleActorStatusTranslator] Not all required Window_Base methods found, cannot enable translation',
                requiredMethods.find(
                    (methodName) => typeof windowBasePrototype[methodName] !== 'function'
                )
            );
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

        for (const method of ['drawText', 'drawTextEx']) {
            const original = windowBasePrototype[method];
            windowBasePrototype[method] = function (text, ...args) {
                if (this.__ftkrCssTranslatedRender || !(Number(this.__ftkrCssTranslationDepth) > 0))
                    return original.call(this, text, ...args);
                const translated = translateCssText(text, getRuntime());
                if (translated === text) return original.call(this, text, ...args);
                this.__ftkrCssTranslatedRender = true;
                try {
                    return original.call(this, translated, ...args);
                } finally {
                    this.__ftkrCssTranslatedRender = false;
                }
            };
        }

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
            const previousRender = this.__ftkrCssTranslatedRender;
            this.__ftkrCssTranslatedRender = true;
            try {
                return originalDrawCssActorMessage.apply(this, arguments);
            } finally {
                messageSettings.levelUp = sourceTemplate;
                this.__ftkrCssTranslatedRender = previousRender;
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

        const pluginEntry = this.findPluginEntry(this.getPluginName());
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
