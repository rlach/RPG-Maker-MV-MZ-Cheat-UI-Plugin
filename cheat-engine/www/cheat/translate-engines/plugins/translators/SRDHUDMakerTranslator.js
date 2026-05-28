import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * SRD_HUDMaker translator.
 *
 * Supported plugin versions:
 * - SRD_HUDMaker.js v1.43 (MV)
 *
 * Translation notes:
 * - Mass translation scans HUD piece configuration payloads from `$dataMapHUD`
 *   and `$dataBattleHUD`.
 * - Runtime hook point is HUDManager data refresh/setup methods; only likely
 *   visible text fields are translated.
 * - Script/condition/code-like fields are intentionally excluded from
 *   translation to preserve plugin behavior.
 */

const PLUGIN_NAME = 'SRD_HUDMaker';
const CACHE_TYPE = 'plugin_srd_hud_maker';

const HUD_MANAGER_HOOK_FLAG = '__CHEAT_SRD_HUD_MAKER_TRANSLATOR_HOOKED__';
const HUD_MANAGER_SETUP_HOOK_FLAG = '__CHEAT_SRD_HUD_MAKER_SETUP_HOOKED__';
const HUD_MANAGER_REFRESH_HOOK_FLAG = '__CHEAT_SRD_HUD_MAKER_REFRESH_HOOKED__';
const HUD_MANAGER_ANIMATION_REFRESH_HOOK_FLAG = '__CHEAT_SRD_HUD_MAKER_ANIMATION_REFRESH_HOOKED__';

const SOURCE_DEFINITIONS = Object.freeze([
    { key: '$dataMapHUD', scope: 'mapHud' },
    { key: '$dataBattleHUD', scope: 'battleHud' },
]);

function normalizeString(value) {
    if (typeof value === 'string') {
        return value;
    }

    if (value === null || value === undefined) {
        return '';
    }

    return String(value);
}

function looksLikeCodeText(value) {
    const source = normalizeString(value);
    if (!source) {
        return false;
    }

    return (
        source.includes('$game') ||
        source.includes('this.') ||
        source.includes('Math.') ||
        source.includes('=>') ||
        source.includes('function(') ||
        source.includes('return ') ||
        source.includes('&&') ||
        source.includes('||')
    );
}

export class SRDHUDMakerTranslator extends BasePluginTranslator {
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
        return [PLUGIN_NAME, 'SumRndmDde HUD Maker'];
    }

    getPluginLabel() {
        return 'SRD HUD Maker';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    enablePluginTranslation() {
        const manager = globalThis.HUDManager;
        if (typeof manager !== 'function') {
            return false;
        }

        const hasSetup = typeof manager.setup === 'function';
        const hasRefresh = typeof manager.refreshSpriteAndData === 'function';
        const hasAnimationRefresh = typeof manager.refreshAnimationSpriteAndData === 'function';

        if (!hasSetup && !hasRefresh && !hasAnimationRefresh) {
            console.log(
                '[SRDHUDMakerTranslator] No known hook points found on HUDManager, cannot enable translation',
                hasSetup,
                hasRefresh,
                hasAnimationRefresh
            );
            return false;
        }

        if (manager[HUD_MANAGER_HOOK_FLAG]) {
            return true;
        }

        if (hasSetup && !manager[HUD_MANAGER_SETUP_HOOK_FLAG]) {
            this.installSetupHook(manager);
        }

        if (hasRefresh && !manager[HUD_MANAGER_REFRESH_HOOK_FLAG]) {
            this.installRefreshHook(manager);
        }

        if (hasAnimationRefresh && !manager[HUD_MANAGER_ANIMATION_REFRESH_HOOK_FLAG]) {
            this.installAnimationRefreshHook(manager);
        }

        Object.defineProperty(manager, HUD_MANAGER_HOOK_FLAG, {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });

        return true;
    }

    installSetupHook(manager) {
        const original = manager.setup;
        const translateHudData = this.translateHudData.bind(this);
        const getRuntime = this.getRuntime.bind(this);

        manager.setup = function (data, hud) {
            const runtime = getRuntime();
            const nextData = translateHudData(data, runtime);
            return original.call(this, nextData, hud);
        };

        Object.defineProperty(manager, HUD_MANAGER_SETUP_HOOK_FLAG, {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    installRefreshHook(manager) {
        const original = manager.refreshSpriteAndData;
        const translateHudData = this.translateHudData.bind(this);
        const getRuntime = this.getRuntime.bind(this);

        manager.refreshSpriteAndData = function (sprite, data) {
            const runtime = getRuntime();
            const nextData = translateHudData(data, runtime);
            return original.call(this, sprite, nextData);
        };

        Object.defineProperty(manager, HUD_MANAGER_REFRESH_HOOK_FLAG, {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    installAnimationRefreshHook(manager) {
        const original = manager.refreshAnimationSpriteAndData;
        const translateHudData = this.translateHudData.bind(this);
        const getRuntime = this.getRuntime.bind(this);

        manager.refreshAnimationSpriteAndData = function (sprite, data) {
            const runtime = getRuntime();
            const nextData = translateHudData(data, runtime);
            return original.call(this, sprite, nextData);
        };

        Object.defineProperty(manager, HUD_MANAGER_ANIMATION_REFRESH_HOOK_FLAG, {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    translateHudData(data, runtime) {
        if (!data || !runtime) {
            return data;
        }

        return this.translateHudNode(data, runtime);
    }

    translateHudNode(node, runtime) {
        if (Array.isArray(node)) {
            return this.translateHudArrayNode(node, runtime);
        }

        if (!node || typeof node !== 'object') {
            return node;
        }

        return this.translateHudObjectNode(node, runtime);
    }

    translateHudArrayNode(node, runtime) {
        let changed = false;
        const translatedArray = node.map((value) => {
            const translated = this.translateHudNode(value, runtime);
            if (translated !== value) {
                changed = true;
            }
            return translated;
        });

        return changed ? translatedArray : node;
    }

    translateHudObjectNode(node, runtime) {
        if (this.isHudTextNode(node)) {
            const translatedValue = this.translateHudTextValue('Value', node.Value, runtime);
            if (translatedValue === node.Value) {
                return node;
            }

            return {
                ...node,
                Value: translatedValue,
            };
        }

        let changed = false;
        const translatedObject = { ...node };

        for (const [key, value] of Object.entries(node)) {
            const translated = this.translateHudObjectEntry(key, value, runtime);
            if (translated === value) {
                continue;
            }

            translatedObject[key] = translated;
            changed = true;
        }

        return changed ? translatedObject : node;
    }

    translateHudObjectEntry(key, value, runtime) {
        if (typeof value === 'string') {
            return this.translateHudTextValue(key, value, runtime);
        }

        if (value && typeof value === 'object') {
            return this.translateHudNode(value, runtime);
        }

        return value;
    }

    translateHudTextValue(key, value, runtime) {
        if (key !== 'Value' || !this.isUsableText(value) || looksLikeCodeText(value)) {
            return value;
        }

        const cacheKey = runtime.getCacheKey(value, this.getCacheType());
        runtime.trackCacheKeyUsage(cacheKey);

        if (!this.isRuntimeTranslationActive(runtime)) {
            return value;
        }

        return this.resolveRuntimeTranslation(value, runtime, this.getCacheType(), {
            requireRuntimeTranslationActive: true,
            missValue: value,
            harvestMissing: false,
        });
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
                console.warn('[SRDHUDMakerTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const entries = [];

        for (const sourceDefinition of SOURCE_DEFINITIONS) {
            const dataRoot = globalThis[sourceDefinition.key];
            this.collectStringsFromHudNode(dataRoot, entries, {
                scope: sourceDefinition.scope,
                dataKey: sourceDefinition.key,
            });
        }

        return entries;
    }

    collectStringsFromHudNode(node, output, sourceMeta, pathSegments = []) {
        if (Array.isArray(node)) {
            this.collectStringsFromHudArrayNode(node, output, sourceMeta, pathSegments);
            return;
        }

        if (!node || typeof node !== 'object') {
            return;
        }

        this.collectStringsFromHudObjectNode(node, output, sourceMeta, pathSegments);
    }

    collectStringsFromHudArrayNode(node, output, sourceMeta, pathSegments) {
        for (let index = 0; index < node.length; index += 1) {
            this.collectStringsFromHudNode(
                node[index],
                output,
                sourceMeta,
                pathSegments.concat(index)
            );
        }
    }

    collectStringsFromHudObjectNode(node, output, sourceMeta, pathSegments) {
        if (this.isHudTextNode(node)) {
            this.collectHudTextEntry(node.Value, output, sourceMeta, pathSegments);
            return;
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === 'object') {
                this.collectStringsFromHudNode(value, output, sourceMeta, pathSegments.concat(key));
            }
        }
    }

    isHudTextNode(node) {
        return (
            node &&
            typeof node === 'object' &&
            String(node.type || '') === 'Text' &&
            this.isUsableText(node.Value)
        );
    }

    collectHudTextEntry(value, output, sourceMeta, pathSegments) {
        if (!this.isUsableText(value) || looksLikeCodeText(value)) {
            return;
        }

        output.push({
            text: value,
            source: {
                ...sourceMeta,
                path: pathSegments.join('.'),
            },
        });
    }

    ensureScanEntriesSync() {
        if (this._scanPrepared) {
            return;
        }

        this._scanEntries = this.buildScanEntries();
        this._scanPrepared = true;
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = normalizeString(entry?.text);
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (byCacheKey.has(cacheKey)) {
                continue;
            }

            byCacheKey.set(cacheKey, {
                type: this.getCacheType(),
                id: `plugin_srd_hud_maker_${byCacheKey.size}`,
                value: text,
                cacheKey,
            });
        }

        return Array.from(byCacheKey.values());
    }

    collectUntranslated(context = {}) {
        const runtime = context?.runtime;
        if (!runtime) {
            return [];
        }

        this.ensureScanEntriesSync();
        const items = this.buildUniquePendingItems(runtime);
        return items.filter((item) => !runtime.hasUsableCacheValue(item.cacheKey));
    }

    getCachedCountsSync(context = {}) {
        const runtime = context?.runtime;
        if (!runtime) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        this.ensureScanEntriesSync();
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
