import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * Safely parse a JSON string, returning null on failure.
 * @param {unknown} value
 * @returns {unknown}
 */
function safeParseJSON(value) {
    if (typeof value !== 'string' || !value.trim()) {
        return null;
    }
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

/**
 * Extract translatable entries from a single command object.
 * @param {object} cmd
 * @param {object} source
 * @param {number} cmdIdx
 * @returns {Array}
 */
function extractCommandEntries(cmd, source, cmdIdx) {
    const entries = [];
    const cmdText = typeof cmd.Text === 'string' ? cmd.Text.trim() : '';
    if (cmdText) {
        entries.push({ text: cmdText, kind: 'commandText', source: { ...source, cmdIdx } });
    }
    const helpText = typeof cmd.HelpText === 'string' ? cmd.HelpText.trim() : '';
    if (helpText) {
        entries.push({ text: helpText, kind: 'helpText', source: { ...source, cmdIdx } });
    }
    return entries;
}

/**
 * Extract translatable entries from a single window object.
 * @param {object} win
 * @param {string} sceneId
 * @param {number} winIdx
 * @returns {Array}
 */
function extractWindowEntries(win, sceneId, winIdx) {
    const entries = [];
    const source = { sceneId, winIdx };

    const commonHelpText = typeof win.CommonHelpText === 'string' ? win.CommonHelpText.trim() : '';
    if (commonHelpText) {
        entries.push({ text: commonHelpText, kind: 'commonHelpText', source });
    }

    const commandList = safeParseJSON(win.CommandList);
    if (!Array.isArray(commandList)) {
        return entries;
    }

    for (let cmdIdx = 0; cmdIdx < commandList.length; cmdIdx++) {
        const cmd = safeParseJSON(commandList[cmdIdx]);
        if (cmd) {
            entries.push(...extractCommandEntries(cmd, source, cmdIdx));
        }
    }

    return entries;
}

/**
 * Extract translatable entries from a single scene object.
 * @param {object} scene
 * @returns {Array}
 */
function extractSceneEntries(scene) {
    const entries = [];
    const sceneId = scene.Id.trim();
    const windowList = safeParseJSON(scene.WindowList);
    if (!Array.isArray(windowList)) {
        return entries;
    }
    for (let winIdx = 0; winIdx < windowList.length; winIdx++) {
        const win = safeParseJSON(windowList[winIdx]);
        if (win) {
            entries.push(...extractWindowEntries(win, sceneId, winIdx));
        }
    }
    return entries;
}

export class SceneCustomMenuTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'SceneCustomMenu';
    }

    getPluginLabel() {
        return 'SceneCustomMenu';
    }

    getCacheType() {
        return 'plugin_scene_custom_menu';
    }

    enablePluginTranslation() {
        if (!window.Window_CustomMenuCommand || !Window_CustomMenuCommand.prototype) {
            return;
        }

        const cacheType = this.getCacheType();
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);

        const originalDrawItemSub = Window_CustomMenuCommand.prototype.drawItemSub;
        Window_CustomMenuCommand.prototype.drawItemSub = function (item, rect, index) {
            try {
                const runtime = getRuntime();
                if (
                    runtime &&
                    isRuntimeTranslationActive(runtime) &&
                    item &&
                    typeof item.Text === 'string' &&
                    item.Text.trim()
                ) {
                    const cacheKey = runtime.getCacheKey(item.Text, cacheType);
                    runtime.markCacheKeySeen(cacheKey);
                    if (runtime.hasUsableCacheValue(cacheKey)) {
                        const cached = runtime.translationCache.get(cacheKey);
                        if (typeof cached === 'string' && cached.trim()) {
                            return originalDrawItemSub.call(
                                this,
                                { ...item, Text: cached },
                                rect,
                                index
                            );
                        }
                    }
                }
            } catch (error) {
                console.warn(
                    '[SceneCustomMenuTranslator] Failed to apply cached command text translation',
                    error
                );
            }
            return originalDrawItemSub.call(this, item, rect, index);
        };

        const originalFindHelpText = Window_CustomMenuCommand.prototype.findHelpText;
        Window_CustomMenuCommand.prototype.findHelpText = function () {
            const text = originalFindHelpText.call(this);
            if (typeof text !== 'string' || !text.trim()) {
                return text;
            }
            try {
                const runtime = getRuntime();
                if (!runtime || !isRuntimeTranslationActive(runtime)) {
                    return text;
                }
                const cacheKey = runtime.getCacheKey(text, cacheType);
                runtime.markCacheKeySeen(cacheKey);
                if (!runtime.hasUsableCacheValue(cacheKey)) {
                    return text;
                }
                const cached = runtime.translationCache.get(cacheKey);
                return typeof cached === 'string' && cached.trim() ? cached : text;
            } catch (error) {
                console.warn(
                    '[SceneCustomMenuTranslator] Failed to apply cached help text translation',
                    error
                );
                return text;
            }
        };
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

        this._scanPromise = this.buildScanEntries()
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[SceneCustomMenuTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const pluginEntry = Array.isArray(window.$plugins)
            ? window.$plugins.find(
                  (p) =>
                      p &&
                      typeof p.name === 'string' &&
                      p.name.trim().toLowerCase() === 'scenecustommenu'
              )
            : null;

        if (!pluginEntry?.parameters) {
            return [];
        }

        const params = pluginEntry.parameters;
        const entries = [];

        for (let sceneIdx = 1; sceneIdx <= 20; sceneIdx++) {
            const scene = safeParseJSON(params[`Scene${sceneIdx}`]);
            if (scene && typeof scene.Id === 'string' && scene.Id.trim()) {
                entries.push(...extractSceneEntries(scene));
            }
        }

        return entries;
    }

    buildUniquePendingItems(panel) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!text) {
                continue;
            }

            const cacheKey = panel.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_scene_custom_menu_${byCacheKey.size}`,
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
}
