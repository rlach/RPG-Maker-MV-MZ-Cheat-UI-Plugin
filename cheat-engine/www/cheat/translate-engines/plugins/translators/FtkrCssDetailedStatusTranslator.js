import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { FtkrCustomSimpleActorStatusTranslator } from './FtkrCustomSimpleActorStatusTranslator.js';
import { normalizeText, parseJsonSafely } from './TranslatorHelpers.js';

/**
 * FTKR_CSS_DetailedStatus translator
 *
 * Plugin: FTKR_CSS_DetailedStatus.js
 * Supported versions:
 * - v2.1.4 (MV): detailed status layout labels from statusList entries.
 *
 * Notes:
 * - Translatable text is stored in plugin parameter `statusList` (struct array).
 * - Command tokens (for example `name`, `param(%1)`, `custom(%1)`) are never
 *   translated because they are parser/control syntax, not display payload.
 * - Runtime integration patches `Window_Status.prototype.refresh` and temporarily
 *   swaps in a translated clone of `FTKR.CSS.DS.detailedStatus` for that draw pass.
 */

const CACHE_TYPE = 'plugin_ftkr_css_detailed_status';
const SIMPLE_CACHE_TYPE = 'plugin_ftkr_custom_simple_actor_status';

const KNOWN_STATUS_CONTROL_TOKENS = new Set([
    'name',
    'nickname',
    'class',
    'level',
    'hp',
    'mp',
    'tp',
    'face',
    'face(%1)',
    'chara',
    'sv',
    'state',
    'state2(%1)',
    'profile',
    'param(%1)',
    'pbase(%1)',
    'pdiff(%1)',
    'equip(%1)',
    'eparam(%1)',
    'custom(%1)',
    'gauge(%1)',
    'agauge(%1)',
    'cgauge(%1)',
    'image',
    'image(%1)',
    'message',
    'text(%1)',
    'eval(%1)',
    'streval(%1)',
    'line',
    'aop(%1)',
    'aopbase(%1)',
    'aopdiff(%1)',
    'eaop(%1)',
    'iname',
    'iicon',
    'idesc',
    'itype',
    'ietype',
    'iscope',
    'ielement',
    'iparam(%1)',
    'iimage(%1)',
    'mapname',
]);

function isStatusControlToken(text) {
    const normalized = normalizeText(text).toLowerCase();
    if (!normalized) {
        return false;
    }

    if (KNOWN_STATUS_CONTROL_TOKENS.has(normalized)) {
        return true;
    }

    return /^[a-z_][a-z0-9_]*(\(%1\))?$/.test(normalized);
}

function shouldTranslateStatusValue(textToken) {
    return normalizeText(textToken).toLowerCase() === 'text(%1)';
}

export class FtkrCssDetailedStatusTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
        this._simpleActorStatusTranslator = new FtkrCustomSimpleActorStatusTranslator();
    }

    getPluginName() {
        return 'FTKR_CSS_DetailedStatus';
    }

    getPluginLabel() {
        return 'FTKR CSS DetailedStatus';
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

        output.push({ text, source });
    }

    parseStatusList(rawValue) {
        const parsedArray = parseJsonSafely(rawValue, []);
        if (!Array.isArray(parsedArray)) {
            return [];
        }

        return parsedArray
            .map((entry) => parseJsonSafely(entry, entry))
            .filter((entry) => entry && typeof entry === 'object');
    }

    collectStatusListEntries(rawStatusList, scope, output) {
        const statusList = this.parseStatusList(rawStatusList);

        for (let index = 0; index < statusList.length; index++) {
            const entry = statusList[index];
            const textToken = normalizeText(entry?.text);
            const valueText = normalizeText(entry?.value);

            if (this.isUsableText(textToken) && !isStatusControlToken(textToken)) {
                this.appendTextEntry(textToken, { scope, index, field: 'text' }, output);
            }

            if (this.isUsableText(valueText) && shouldTranslateStatusValue(textToken)) {
                this.appendTextEntry(valueText, { scope, index, field: 'value' }, output);
            }
        }
    }

    collectParameterEntries(parameters, scope, output) {
        if (!parameters || typeof parameters !== 'object') {
            return;
        }

        this.collectStatusListEntries(parameters.statusList, scope, output);
    }

    collectRuntimeDetailedStatusEntries(output) {
        const detailedStatus = globalThis.FTKR?.CSS?.DS?.detailedStatus;
        const statusList = Array.isArray(detailedStatus?.statusList)
            ? detailedStatus.statusList
            : null;

        if (!statusList) {
            return;
        }

        for (let index = 0; index < statusList.length; index++) {
            const entry = statusList[index];
            const textToken = normalizeText(entry?.text);
            const valueText = normalizeText(entry?.value);

            if (this.isUsableText(textToken) && !isStatusControlToken(textToken)) {
                this.appendTextEntry(textToken, { scope: 'runtimeStatusList', index, field: 'text' }, output);
            }

            if (this.isUsableText(valueText) && shouldTranslateStatusValue(textToken)) {
                this.appendTextEntry(valueText, { scope: 'runtimeStatusList', index, field: 'value' }, output);
            }
        }
    }

    translateStatusEntry(entry, runtime) {
        if (!entry || typeof entry !== 'object') {
            return entry;
        }

        const sourceTextToken = normalizeText(entry.text);
        const sourceValue = normalizeText(entry.value);

        let nextTextToken = entry.text;
        if (this.isUsableText(sourceTextToken) && !isStatusControlToken(sourceTextToken)) {
            nextTextToken = this.resolveCombinedRuntimeTranslation(sourceTextToken, runtime);
        }

        let nextValue = entry.value;
        if (this.isUsableText(sourceValue) && shouldTranslateStatusValue(sourceTextToken)) {
            nextValue = this.resolveCombinedRuntimeTranslation(sourceValue, runtime);
        }

        if (nextTextToken === entry.text && nextValue === entry.value) {
            return entry;
        }

        return {
            ...entry,
            text: nextTextToken,
            value: nextValue,
        };
    }

    resolveCombinedRuntimeTranslation(text, runtime) {
        return this.resolveRuntimeTranslation(text, runtime, [this.getCacheType(), SIMPLE_CACHE_TYPE], {
            requireRuntimeTranslationActive: true,
        });
    }

    buildTranslatedDetailedStatus(detailedStatus, runtime) {
        const statusList = Array.isArray(detailedStatus?.statusList) ? detailedStatus.statusList : null;
        if (!statusList) {
            return detailedStatus;
        }

        let changed = false;
        const nextStatusList = statusList.map((entry) => {
            const nextEntry = this.translateStatusEntry(entry, runtime);
            if (nextEntry !== entry) {
                changed = true;
            }
            return nextEntry;
        });

        if (!changed) {
            return detailedStatus;
        }

        return {
            ...detailedStatus,
            statusList: nextStatusList,
        };
    }

    enablePluginTranslation() {
        const windowStatusPrototype = window.Window_Status?.prototype;
        const windowBasePrototype = window.Window_Base?.prototype;

        if (!windowStatusPrototype?.refresh || !globalThis.FTKR?.CSS?.DS?.detailedStatus) {
            return false;
        }

        if (
            !windowBasePrototype?.drawCssActorStatusBase ||
            !windowBasePrototype?.drawText ||
            !windowBasePrototype?.drawTextEx
        ) {
            return false;
        }

        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const buildTranslatedDetailedStatus = this.buildTranslatedDetailedStatus.bind(this);
        const resolveCombinedRuntimeTranslation = this.resolveCombinedRuntimeTranslation.bind(this);

        const originalDrawCssActorStatusBase = windowBasePrototype.drawCssActorStatusBase;
        windowBasePrototype.drawCssActorStatusBase = function () {
            this.__ftkrCssDetailedTranslationDepth =
                (Number(this.__ftkrCssDetailedTranslationDepth) || 0) + 1;
            try {
                return originalDrawCssActorStatusBase.apply(this, arguments);
            } finally {
                this.__ftkrCssDetailedTranslationDepth = Math.max(
                    0,
                    (Number(this.__ftkrCssDetailedTranslationDepth) || 1) - 1
                );
            }
        };

        const originalDrawText = windowBasePrototype.drawText;
        windowBasePrototype.drawText = function () {
            try {
                const runtime = getRuntime();
                if (
                    isRuntimeTranslationActive(runtime) &&
                    (Number(this.__ftkrCssDetailedTranslationDepth) || 0) > 0 &&
                    arguments.length > 0
                ) {
                    arguments[0] = resolveCombinedRuntimeTranslation(arguments[0], runtime);
                }
            } catch (error) {
                console.warn(
                    '[FtkrCssDetailedStatusTranslator] Failed to translate drawText in FTKR CSS detailed scope',
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
                    (Number(this.__ftkrCssDetailedTranslationDepth) || 0) > 0 &&
                    arguments.length > 0
                ) {
                    arguments[0] = resolveCombinedRuntimeTranslation(arguments[0], runtime);
                }
            } catch (error) {
                console.warn(
                    '[FtkrCssDetailedStatusTranslator] Failed to translate drawTextEx in FTKR CSS detailed scope',
                    error
                );
            }

            return originalDrawTextEx.apply(this, arguments);
        };

        const originalRefresh = windowStatusPrototype.refresh;
        windowStatusPrototype.refresh = function () {
            const runtime = getRuntime();
            if (!isRuntimeTranslationActive(runtime)) {
                return originalRefresh.apply(this, arguments);
            }

            const detailedStatus = globalThis.FTKR?.CSS?.DS?.detailedStatus;
            if (!detailedStatus) {
                return originalRefresh.apply(this, arguments);
            }

            const translatedStatus = buildTranslatedDetailedStatus(detailedStatus, runtime);
            if (translatedStatus === detailedStatus) {
                return originalRefresh.apply(this, arguments);
            }

            globalThis.FTKR.CSS.DS.detailedStatus = translatedStatus;
            try {
                return originalRefresh.apply(this, arguments);
            } finally {
                globalThis.FTKR.CSS.DS.detailedStatus = detailedStatus;
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
                console.warn('[FtkrCssDetailedStatusTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];

        const pluginEntry = this.findPluginEntry();
        if (pluginEntry?.parameters) {
            this.collectParameterEntries(pluginEntry.parameters, 'pluginEntryParameter', entries);
        }

        const runtimeParameters = this.getRuntimeParameters();
        if (runtimeParameters) {
            this.collectParameterEntries(runtimeParameters, 'runtimePluginManagerParameter', entries);
        }

        this.collectRuntimeDetailedStatusEntries(entries);

        const simpleEntries = await this._simpleActorStatusTranslator.buildScanEntries();
        if (Array.isArray(simpleEntries) && simpleEntries.length > 0) {
            for (const entry of simpleEntries) {
                if (!this.isUsableText(entry?.text)) {
                    continue;
                }

                entries.push({
                    text: entry.text,
                    source: {
                        scope: 'linkedFtkrCustomSimpleActorStatus',
                        originalSource: entry.source || null,
                    },
                });
            }
        }

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
                id: `plugin_ftkr_css_detailed_status_${byCacheKey.size}`,
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