import { BasePluginTranslator } from '../BasePluginTranslator.js';

// TMStatusMenuEx / Av_TMStatusMenuEx (MV, unversioned builds).
// Detect only enabled manifest entries: unrelated SaveMaxNum builds can
// incorrectly advertise Imported.TMStatusMenuEx without implementing its UI.
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

    getPluginAliases() {
        return [PLUGIN_NAME, 'Av_TMStatusMenuEx'];
    }

    getPluginLabel() {
        return 'TMStatusMenuEx';
    }

    getCacheType() {
        return 'plugin_tm_status_menu_ex';
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

        const pluginEntry = this.getPluginAliases()
            .map((name) => this.findPluginEntry(name))
            .find((entry) => entry?.status !== false && entry);
        if (pluginEntry?.parameters) {
            this.appendEntriesFromParameters(
                pluginEntry.parameters,
                'pluginEntryParameter',
                entries
            );
        }

        const pluginManager = window['PluginManager'];
        if (pluginManager && typeof pluginManager.parameters === 'function') {
            const runtimeParameters = pluginManager.parameters(
                this.getPluginAliases()
                    .map((name) => this.findPluginEntry(name))
                    .find((entry) => entry?.status !== false && entry)?.name || PLUGIN_NAME
            );
            this.appendEntriesFromParameters(
                runtimeParameters,
                'runtimePluginManagerParameter',
                entries
            );
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

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!text?.trim()) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
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
        const translator = this;

        windowInstance.drawText = function (text, x, y, w, align) {
            const displayText = translator.resolveRuntimeTranslation(text, runtime, cacheType);
            return origDrawText.call(this, displayText, x, y, w, align);
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
            return false;
        }

        if (
            typeof WindowStatusCtor.prototype.drawXparams !== 'function' &&
            typeof WindowStatusCtor.prototype.drawSparams !== 'function'
        ) {
            return false;
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

        return true;
    }
}
