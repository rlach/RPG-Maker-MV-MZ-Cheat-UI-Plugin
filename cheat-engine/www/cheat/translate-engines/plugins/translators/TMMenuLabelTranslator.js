import { BasePluginTranslator } from '../BasePluginTranslator.js';

const RUNTIME_HOOK_GUARD = '__CHEAT_TM_MENU_LABEL_TRANSLATOR_HOOKED__';

const PARAM_FIELDS = [
    'labelAName',
    'labelAFooter',
    'labelBName',
    'labelBFooter',
    'labelCName',
    'labelCFooter',
    'labelDName',
    'labelDFooter',
];

export class TMMenuLabelTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'TMMenuLabel';
    }

    getPluginLabel() {
        return 'TMMenuLabel';
    }

    getCacheType() {
        return 'plugin_tm_menu_label';
    }

    findPluginEntry() {
        if (!Array.isArray(window.$plugins)) {
            return null;
        }

        const pluginName = String(this.getPluginName() || '')
            .trim()
            .toLowerCase();
        if (!pluginName) {
            return null;
        }

        return (
            window.$plugins.find((plugin) => {
                if (!plugin || typeof plugin.name !== 'string') {
                    return false;
                }

                return plugin.name.trim().toLowerCase() === pluginName;
            }) || null
        );
    }

    appendEntriesFromParameters(parameters, scope, output) {
        if (!parameters || typeof parameters !== 'object' || !Array.isArray(output)) {
            return;
        }

        for (const field of PARAM_FIELDS) {
            const text = typeof parameters[field] === 'string' ? parameters[field] : '';
            if (!this.isUsableText(text)) {
                continue;
            }

            output.push({
                text,
                source: {
                    scope,
                    field,
                },
            });
        }
    }

    enablePluginTranslation() {
        if (window[RUNTIME_HOOK_GUARD]) {
            return;
        }

        if (!SceneMenuCtor?.prototype) {
            return;
        }

        const translator = this;
        const originalCreateMenuLabelWindow = SceneMenuCtor.prototype.createMenuLabelWindow;

        if (typeof originalCreateMenuLabelWindow !== 'function') {
            return;
        }

        function patchWindowInstanceDraw(windowInstance) {
            if (!windowInstance || typeof windowInstance !== 'object') {
                return;
            }

            const proto = Object.getPrototypeOf(windowInstance);
            if (!proto || typeof proto.drawMenuLabel !== 'function') {
                return;
            }

            if (proto.__CHEAT_TM_MENU_LABEL_DRAW_PATCHED__) {
                return;
            }

            const originalDrawMenuLabel = proto.drawMenuLabel;

            proto.drawMenuLabel = function (x, y, label, value) {
                try {
                    if (label && typeof label === 'object') {
                        const runtime = this.getRuntime();
                        const translatedName = translator.resolveRuntimeTranslation(
                            label.name,
                            runtime
                        );
                        const translatedFooter = translator.resolveRuntimeTranslation(
                            label.footer,
                            runtime
                        );

                        if (translatedName !== label.name || translatedFooter !== label.footer) {
                            arguments[2] = {
                                ...label,
                                name: translatedName,
                                footer: translatedFooter,
                            };
                        }
                    }
                } catch (error) {
                    console.warn(
                        '[TMMenuLabelTranslator] Failed to apply runtime menu label translation',
                        error
                    );
                }

                return originalDrawMenuLabel.apply(this, arguments);
            };

            Object.defineProperty(proto, '__CHEAT_TM_MENU_LABEL_DRAW_PATCHED__', {
                value: true,
                configurable: true,
                enumerable: false,
                writable: false,
            });
        }

        SceneMenuCtor.prototype.createMenuLabelWindow = function () {
            const result = originalCreateMenuLabelWindow.apply(this, arguments);

            try {
                patchWindowInstanceDraw(this._menuLabelWindow);

                // TMMenuLabel refreshes once in its constructor before this patch point.
                // Refresh again so the first menu open immediately reflects cached translations.
                this._menuLabelWindow?.refresh?.();
            } catch (error) {
                console.warn(
                    '[TMMenuLabelTranslator] Failed to patch menu label window instance',
                    error
                );
            }

            return result;
        };

        window[RUNTIME_HOOK_GUARD] = true;
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
                console.warn('[TMMenuLabelTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
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
            const runtimeParameters = pluginManager.parameters(this.getPluginName());
            this.appendEntriesFromParameters(
                runtimeParameters,
                'runtimePluginManagerParameter',
                entries
            );
        }

        return entries;
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_tm_menu_label_${byCacheKey.size}`,
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

    countPluginAmountSync({ runtime }) {
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
