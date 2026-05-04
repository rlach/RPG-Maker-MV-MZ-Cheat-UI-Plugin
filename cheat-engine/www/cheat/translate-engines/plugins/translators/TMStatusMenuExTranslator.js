import { BasePluginTranslator } from '../BasePluginTranslator.js';

const PLUGIN_NAME = 'TMStatusMenuEx';
const PARAM_FIELDS = ['xparamText', 'sparamText'];

export class TMStatusMenuExTranslator extends BasePluginTranslator {
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
        return 'TMStatusMenuEx';
    }

    getCacheType() {
        return 'plugin_tm_status_menu_ex';
    }

    detectPlugin() {
        const pluginNameLower = PLUGIN_NAME.toLowerCase();

        if (Array.isArray(window.$plugins)) {
            const matched = window.$plugins.some((plugin) => {
                if (!plugin || typeof plugin.name !== 'string' || plugin.status === false) {
                    return false;
                }

                return plugin.name.trim().toLowerCase() === pluginNameLower;
            });

            if (matched) {
                return true;
            }
        }

        const pluginManager = window['PluginManager'];
        if (pluginManager && typeof pluginManager.parameters === 'function') {
            const parameters = pluginManager.parameters(PLUGIN_NAME);
            const hasAnyParam = PARAM_FIELDS.some((field) => {
                const value =
                    parameters && typeof parameters[field] === 'string' ? parameters[field] : '';
                return !!value.trim();
            });

            if (hasAnyParam) {
                return true;
            }
        }

        const imported = window['Imported'];
        return !!imported?.[PLUGIN_NAME];
    }

    /**
     * Finds the $plugins entry for this plugin.
     * @returns {object|null}
     */
    findPluginEntry() {
        if (!Array.isArray(window.$plugins)) {
            return null;
        }

        const pluginNameLower = PLUGIN_NAME.toLowerCase();
        return (
            window.$plugins.find((plugin) => {
                if (!plugin || typeof plugin.name !== 'string' || plugin.status === false) {
                    return false;
                }
                return plugin.name.trim().toLowerCase() === pluginNameLower;
            }) || null
        );
    }

    /**
     * Appends scan entries from the given parameters object.
     * xparamText and sparamText are comma-separated lists; each non-empty item is a translatable entry.
     * @param {object} parameters
     * @param {string} scope
     * @param {Array} output
     */
    appendEntriesFromParameters(parameters, scope, output) {
        if (!parameters || typeof parameters !== 'object' || !Array.isArray(output)) {
            return;
        }

        for (const field of PARAM_FIELDS) {
            const raw = typeof parameters[field] === 'string' ? parameters[field] : '';
            if (!raw.trim()) {
                continue;
            }

            const items = raw.split(',');
            for (let i = 0; i < items.length; i++) {
                const text = items[i];
                if (!text?.trim()) {
                    continue;
                }

                output.push({
                    text,
                    source: {
                        scope,
                        field,
                        index: i,
                    },
                });
            }
        }
    }

    buildScanEntries() {
        const entries = [];

        const pluginEntry = this.findPluginEntry();
        if (pluginEntry && pluginEntry.parameters) {
            this.appendEntriesFromParameters(
                pluginEntry.parameters,
                'pluginEntryParameter',
                entries
            );
        }

        const pluginManager = window['PluginManager'];
        if (pluginManager && typeof pluginManager.parameters === 'function') {
            const runtimeParameters = pluginManager.parameters(PLUGIN_NAME);
            this.appendEntriesFromParameters(
                runtimeParameters,
                'runtimePluginManagerParameter',
                entries
            );
        }

        return entries;
    }

    async prepareTranslator() {
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
                console.warn('[TMStatusMenuExTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildUniquePendingItems(panel) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!text?.trim()) {
                continue;
            }

            const cacheKey = panel.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_tm_status_menu_ex_${byCacheKey.size}`,
                    value: text,
                    cacheKey,
                });
            }
        }

        return Array.from(byCacheKey.values());
    }

    collectUntranslated({ panel }) {
        if (!panel || typeof panel.getCacheKey !== 'function') {
            return [];
        }

        const items = this.buildUniquePendingItems(panel);
        return items.filter((item) => !panel.hasUsableCacheValue(item.cacheKey));
    }

    countPluginAmountSync({ panel }) {
        if (!panel || typeof panel.getCacheKey !== 'function') {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        const items = this.buildUniquePendingItems(panel);
        const totalStrings = items.length;
        const leftStrings = items.filter(
            (item) => !panel.hasUsableCacheValue(item.cacheKey)
        ).length;

        return {
            total: totalStrings,
            left: leftStrings,
            totalStrings,
            leftStrings,
        };
    }

    /**
     * Creates a temporary drawText override for a Window_Status instance that
     * looks up cached translations for any text it encounters, then removes itself
     * (restoring the prototype chain) when done.
     *
     * @param {object} windowInstance - The Window_Status instance
     * @param {object} runtime - The resolved translation runtime
     */
    _withTranslatedDrawText(windowInstance, runtime, callback) {
        const cacheType = this.getCacheType();
        const origDrawText = windowInstance.drawText;

        windowInstance.drawText = function (text, x, y, w, align) {
            let displayText = text;
            if (typeof text === 'string' && text.trim()) {
                const cacheKey = runtime.getCacheKey(text, cacheType);
                runtime.markCacheKeySeen?.(cacheKey);
                if (runtime.hasUsableCacheValue(cacheKey)) {
                    const cached = runtime.translationCache.get(cacheKey);
                    if (typeof cached === 'string' && cached.trim()) {
                        displayText = cached;
                    }
                }
            }
            origDrawText.call(this, displayText, x, y, w, align);
        };

        try {
            callback();
        } finally {
            // Restore prototype-chain drawText by removing the instance override
            delete windowInstance.drawText;
            // If delete did not fully restore (non-configurable own prop), reset explicitly
            if (
                windowInstance.drawText !== origDrawText &&
                !!Object.getOwnPropertyDescriptor(windowInstance, 'drawText')
            ) {
                windowInstance.drawText = origDrawText;
            }
        }
    }

    enablePluginTranslation() {
        const WindowStatusCtor = window['Window_Status'];
        if (!WindowStatusCtor?.prototype) {
            return;
        }

        if (
            typeof WindowStatusCtor.prototype.drawXparams !== 'function' &&
            typeof WindowStatusCtor.prototype.drawSparams !== 'function'
        ) {
            return;
        }

        const getRuntime = () => this.getRuntime();
        const isActive = (rt) => this.isRuntimeTranslationActive(rt);
        const applyTranslatedDraw = (win, rt, fn) => this._withTranslatedDrawText(win, rt, fn);

        if (typeof WindowStatusCtor.prototype.drawXparams === 'function') {
            const originalDrawXparams = WindowStatusCtor.prototype.drawXparams;

            WindowStatusCtor.prototype.drawXparams = function (y) {
                try {
                    const runtime = getRuntime();
                    if (runtime && isActive(runtime)) {
                        applyTranslatedDraw(this, runtime, () => {
                            originalDrawXparams.call(this, y);
                        });
                        return;
                    }
                } catch (error) {
                    console.warn(
                        '[TMStatusMenuExTranslator] Failed to apply translation in drawXparams',
                        error
                    );
                }

                originalDrawXparams.call(this, y);
            };
        }

        if (typeof WindowStatusCtor.prototype.drawSparams === 'function') {
            const originalDrawSparams = WindowStatusCtor.prototype.drawSparams;

            WindowStatusCtor.prototype.drawSparams = function (y) {
                try {
                    const runtime = getRuntime();
                    if (runtime && isActive(runtime)) {
                        applyTranslatedDraw(this, runtime, () => {
                            originalDrawSparams.call(this, y);
                        });
                        return;
                    }
                } catch (error) {
                    console.warn(
                        '[TMStatusMenuExTranslator] Failed to apply translation in drawSparams',
                        error
                    );
                }

                originalDrawSparams.call(this, y);
            };
        }
    }
}
