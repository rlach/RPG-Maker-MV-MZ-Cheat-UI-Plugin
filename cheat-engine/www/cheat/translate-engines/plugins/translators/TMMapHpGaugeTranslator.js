import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/**
 * TMMapHpGauge translator.
 *
 * Supported plugin versions:
 * - TMMapHpGauge.js v1.4.4 (MV)
 *
 * Translation notes:
 * - Collects VN gauge display names (`name`) from plugin parameters `gaugeA`-`gaugeD`.
 * - Runtime hook patches the plugin's gauge window draw path
 *   (`Window_MapHpGauge#drawVnGauge`) via the scene-owned instance.
 * - Seen tracking is performed at the draw observation point using original
 *   authored VN gauge names.
 */

const CACHE_TYPE = 'plugin_tm_map_hp_gauge';
const GAUGE_PARAMETER_KEYS = Object.freeze(['gaugeA', 'gaugeB', 'gaugeC', 'gaugeD']);

export class TMMapHpGaugeTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'TMMapHpGauge';
    }

    getPluginLabel() {
        return 'TM Map HP Gauge';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    enablePluginTranslation() {
        const sceneBaseProto = globalThis.Scene_Base?.prototype;
        if (!sceneBaseProto || typeof sceneBaseProto.createMapHpGaugeWindow !== 'function') {
            return false;
        }

        if (sceneBaseProto.__CHEAT_TM_MAP_HP_GAUGE_TRANSLATOR_HOOKED__) {
            return true;
        }

        const patchGaugeWindowInstance = this.patchGaugeWindowInstance.bind(this);
        const originalCreateMapHpGaugeWindow = sceneBaseProto.createMapHpGaugeWindow;

        sceneBaseProto.createMapHpGaugeWindow = function () {
            const result = originalCreateMapHpGaugeWindow.apply(this, arguments);

            try {
                patchGaugeWindowInstance(this._mapHpGaugeWindow);
            } catch (error) {
                console.warn(
                    '[TMMapHpGaugeTranslator] Failed to patch map HP gauge window instance',
                    error
                );
            }

            return result;
        };

        Object.defineProperty(sceneBaseProto, '__CHEAT_TM_MAP_HP_GAUGE_TRANSLATOR_HOOKED__', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });

        try {
            patchGaugeWindowInstance(globalThis.SceneManager?._scene?._mapHpGaugeWindow);
        } catch (error) {
            console.warn(
                '[TMMapHpGaugeTranslator] Failed to patch current map HP gauge window instance',
                error
            );
        }

        return true;
    }

    patchGaugeWindowInstance(windowInstance) {
        if (!windowInstance) {
            return;
        }

        const gaugeWindowProto = Object.getPrototypeOf(windowInstance);
        if (!gaugeWindowProto || typeof gaugeWindowProto.drawVnGauge !== 'function') {
            return;
        }

        if (gaugeWindowProto.__CHEAT_TM_MAP_HP_GAUGE_DRAW_VN_HOOKED__) {
            return;
        }

        const getRuntime = this.getRuntime.bind(this);
        const isUsableText = this.isUsableText.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);
        const cacheType = this.getCacheType();
        const originalDrawVnGauge = gaugeWindowProto.drawVnGauge;

        gaugeWindowProto.drawVnGauge = function (params, gauge) {
            let nextGauge = gauge;

            try {
                const runtime = getRuntime();
                const originalName = typeof gauge?.name === 'string' ? gauge.name : '';

                if (runtime && isUsableText(originalName)) {
                    if (isRuntimeTranslationActive(runtime)) {
                        const translatedName = resolveRuntimeTranslation(
                            originalName,
                            runtime,
                            cacheType,
                            {
                                requireRuntimeTranslationActive: true,
                                missValue: originalName,
                            }
                        );

                        if (translatedName !== originalName) {
                            nextGauge = {
                                ...gauge,
                                name: translatedName,
                            };
                        }
                    } else {
                        const cacheKey = runtime.getCacheKey(originalName, cacheType);
                        runtime.trackCacheKeyUsage(cacheKey);
                    }
                }
            } catch (error) {
                console.warn('[TMMapHpGaugeTranslator] Failed to translate VN gauge name', error);
            }

            return originalDrawVnGauge.call(this, params, nextGauge);
        };

        Object.defineProperty(gaugeWindowProto, '__CHEAT_TM_MAP_HP_GAUGE_DRAW_VN_HOOKED__', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
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
                console.warn('[TMMapHpGaugeTranslator] Scan failed', error);
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
            this.appendGaugeNameEntries(pluginEntry.parameters, 'pluginEntryParameter', entries);
        }

        const pluginManager = globalThis.PluginManager;
        if (typeof pluginManager?.parameters === 'function') {
            const runtimeParameters = pluginManager.parameters(this.getPluginName());
            this.appendGaugeNameEntries(
                runtimeParameters,
                'runtimePluginManagerParameter',
                entries
            );
        }

        return entries;
    }

    appendGaugeNameEntries(parameters, scope, output) {
        if (!parameters || typeof parameters !== 'object' || !Array.isArray(output)) {
            return;
        }

        for (const parameterKey of GAUGE_PARAMETER_KEYS) {
            const gaugeConfig = parseJsonSafely(parameters[parameterKey], null);
            if (!gaugeConfig || typeof gaugeConfig !== 'object') {
                continue;
            }

            const gaugeType = String(gaugeConfig.type || '')
                .trim()
                .toUpperCase();
            if (gaugeType !== 'VN') {
                continue;
            }

            const gaugeName = typeof gaugeConfig.name === 'string' ? gaugeConfig.name : '';
            if (!this.isUsableText(gaugeName)) {
                continue;
            }

            output.push({
                text: gaugeName,
                source: {
                    scope,
                    parameterKey,
                },
            });
        }
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
                id: `plugin_tm_map_hp_gauge_${byCacheKey.size}`,
                value: text,
                cacheKey,
            });
        }

        return Array.from(byCacheKey.values());
    }

    collectUntranslated({ runtime } = {}) {
        if (!runtime) {
            return [];
        }

        this.ensureScanEntriesSync();
        const items = this.buildUniquePendingItems(runtime);
        return items.filter((item) => !runtime.hasUsableCacheValue(item.cacheKey));
    }

    getCachedCountsSync({ runtime } = {}) {
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