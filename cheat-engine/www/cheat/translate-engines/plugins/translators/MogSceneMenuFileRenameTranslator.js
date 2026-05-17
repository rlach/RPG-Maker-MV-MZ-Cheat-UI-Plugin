import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/*
 * MOG_SceneMenu_FileRename.js
 * Version: 1.0
 * Target: MV
 *
 * Uses the plugin parameter `changeFileList` to map menu command labels back to
 * the intended icon file names. This translator does not introduce a separate
 * translation cache: it reuses the existing command cache and only observes the
 * translated command name at runtime.
 */

const PLUGIN_NAME = 'MOG_SceneMenu_FileRename';
const CACHE_TYPE = 'command';

function normalizePluginName(value) {
    return String(value || '')
        .trim()
        .toLowerCase();
}

function normalizeText(value) {
    return String(value || '').trim();
}

export class MogSceneMenuFileRenameTranslator extends BasePluginTranslator {
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
        return 'MOG SceneMenu FileRename';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    findPluginEntry() {
        const plugins = Array.isArray(window.$plugins) ? window.$plugins : [];
        const targetName = normalizePluginName(PLUGIN_NAME);

        return (
            plugins.find((plugin) => {
                return normalizePluginName(plugin?.name) === targetName;
            }) || null
        );
    }

    collectRenameEntries(output) {
        if (!Array.isArray(output)) {
            return;
        }

        const pluginEntry = this.findPluginEntry();
        if (!pluginEntry?.parameters) {
            return;
        }

        const rawList = parseJsonSafely(pluginEntry.parameters.changeFileList, []);
        if (!Array.isArray(rawList)) {
            return;
        }

        for (let index = 0; index < rawList.length; index++) {
            const rawItem = rawList[index];
            const item = parseJsonSafely(rawItem, null);
            if (!item || typeof item !== 'object') {
                continue;
            }

            const menuCommand = normalizeText(item.menuCommand);
            const loadFile = normalizeText(item.loadFile);
            if (!this.isUsableText(menuCommand) || !loadFile) {
                continue;
            }

            output.push({
                text: menuCommand,
                loadFile,
                source: {
                    scope: 'pluginParam',
                    field: 'changeFileList',
                    index,
                },
            });
        }
    }

    resolveTranslatedLoadFile(filename, runtime) {
        const requestedName = normalizeText(filename);
        if (!this.isUsableText(requestedName) || !runtime) {
            return filename;
        }

        for (const entry of this._scanEntries) {
            const sourceText = normalizeText(entry?.text);
            const loadFile = normalizeText(entry?.loadFile);
            if (!sourceText || !loadFile) {
                continue;
            }

            const canonicalName = runtime.getCanonicalSystemCommandName(sourceText);
            const cacheKey = runtime.getCacheKey(canonicalName, this.getCacheType());
            runtime.trackCacheKeyUsage(cacheKey);

            if (!runtime.hasUsableCacheValue(cacheKey)) {
                continue;
            }

            const translatedName = normalizeText(runtime.translationCache.get(cacheKey));
            if (translatedName && translatedName === requestedName) {
                return loadFile;
            }
        }

        return filename;
    }

    enablePluginTranslation() {
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveTranslatedLoadFile = this.resolveTranslatedLoadFile.bind(this);

        if (window.ImageManager?.loadMenusMainCommands) {
            const originalLoadMenusMainCommands = window.ImageManager.loadMenusMainCommands;
            window.ImageManager.loadMenusMainCommands = function (filename) {
                try {
                    const runtime = getRuntime();
                    if (isRuntimeTranslationActive(runtime)) {
                        arguments[0] = resolveTranslatedLoadFile(filename, runtime);
                    }
                } catch (error) {
                    console.warn(
                        '[MogSceneMenuFileRenameTranslator] Failed to remap scene menu icon file',
                        error
                    );
                }

                return originalLoadMenusMainCommands.apply(this, arguments);
            };
        }

        if (window.ImageManager?.loadBcom) {
            const originalLoadBcom = window.ImageManager.loadBcom;
            window.ImageManager.loadBcom = function (filename) {
                try {
                    const runtime = getRuntime();
                    if (isRuntimeTranslationActive(runtime)) {
                        arguments[0] = resolveTranslatedLoadFile(filename, runtime);
                    }
                } catch (error) {
                    console.warn(
                        '[MogSceneMenuFileRenameTranslator] Failed to remap battle command icon file',
                        error
                    );
                }

                return originalLoadBcom.apply(this, arguments);
            };
        }
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
                console.warn('[MogSceneMenuFileRenameTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const entries = [];
        this.collectRenameEntries(entries);
        return entries;
    }

    buildUniquePendingItems(runtime) {
        return [];
    }

    collectUntranslated({ runtime } = {}) {
        return [];
    }

    countPluginAmountSync({ runtime } = {}) {
        return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
    }
}
