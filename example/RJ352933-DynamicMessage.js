/**
 * RJ352933 DynamicMessage game-specific translator
 *
 * Targets LicoDynamicMessage data flow:
 * - dialogues.json (CombinedDialogues.dialogueMap)
 * - namecallings.json (CombinedDialogues.nameCallingMap)
 *
 * Runtime hooks translate the resolved dialogue/name text at fetch time.
 */

const BasePluginTranslator = globalThis.__CheatBasePluginTranslator;

function parseJsonSafely(value, fallback = null) {
    if (typeof value !== 'string') {
        return value ?? fallback;
    }

    const source = value.trim();
    if (!source) {
        return fallback;
    }

    try {
        return JSON.parse(source);
    } catch {
        return fallback;
    }
}

function isLikelyTranslatableText(text) {
    if (!(typeof text === 'string' && text.trim() !== '')) {
        return false;
    }

    const trimmed = text.trim();
    if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
        return false;
    }

    if (!/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaffA-Za-z]/.test(trimmed)) {
        return false;
    }

    if (/^[A-Za-z0-9_./:%+-]+$/.test(trimmed) && !/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/.test(trimmed)) {
        return false;
    }

    return true;
}

function collectTextsFromUnknown(value, output, path = []) {
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
            collectTextsFromUnknown(value[i], output, [...path, String(i)]);
        }
        return;
    }

    if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
            collectTextsFromUnknown(child, output, [...path, key]);
        }
        return;
    }

    if (typeof value === 'string' && isLikelyTranslatableText(value)) {
        output.push({
            text: value,
            source: {
                scope: 'LicoDynamicMessageData',
                path,
            },
        });
    }
}

async function loadJsonFromDataFile(filename) {
    const safeName = String(filename || '').trim();
    if (!safeName) {
        return null;
    }

    try {
        if (typeof fetch === 'function') {
            const response = await fetch(`./data/${safeName}`);
            if (response?.ok) {
                return await response.json();
            }
        }
    } catch {
        // Fall through to fs path.
    }

    try {
        const fs = require('fs');
        const path = require('path');
        const basePath = path.resolve(process.cwd(), 'www', 'data', safeName);
        if (!fs.existsSync(basePath)) {
            return null;
        }

        return parseJsonSafely(fs.readFileSync(basePath, 'utf-8'), null);
    } catch {
        return null;
    }
}

export class RJ352933DynamicMessageTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'RJ352933_DynamicMessage';
    }

    getPluginLabel() {
        return 'RJ352933 DynamicMessage';
    }

    getCacheType() {
        return 'plugin_rj352933_dynamic_message';
    }

    detectPlugin() {
        const hasPluginEntry = Array.isArray(window.$plugins)
            ? window.$plugins.some(
                  (plugin) =>
                                            plugin?.status === true &&
                      String(plugin.name || '').trim().toLowerCase() === 'licodynamicmessage'
              )
            : false;

        return hasPluginEntry || !!window.CombinedDialogues;
    }

    enablePluginTranslation() {
        const combined = window.CombinedDialogues;
        if (!combined || typeof combined !== 'object') {
            return false;
        }

        if (combined.__CHEAT_RJ352933_DYNAMIC_MESSAGE_PATCHED__) {
            return true;
        }

        const runtimeForHook = () => this.getRuntime();
        const runtimeTranslationEnabled = (runtime) => this.isRuntimeTranslationActive(runtime);
        const resolveHookTranslation = (text, runtime) =>
            this.resolveRuntimeTranslation(text, runtime, this.getCacheType(), {
                requireRuntimeTranslationActive: true,
            });

        if (typeof combined.getDialogueData === 'function') {
            const originalGetDialogueData = combined.getDialogueData;
            combined.getDialogueData = function () {
                const result = originalGetDialogueData.apply(this, arguments);
                const runtime = runtimeForHook();
                if (!runtime || !runtimeTranslationEnabled(runtime)) {
                    return result;
                }

                return resolveHookTranslation(result, runtime);
            };
        }

        if (typeof combined.getNameCalling === 'function') {
            const originalGetNameCalling = combined.getNameCalling;
            combined.getNameCalling = function () {
                const result = originalGetNameCalling.apply(this, arguments);
                const runtime = runtimeForHook();
                if (!runtime || !runtimeTranslationEnabled(runtime)) {
                    return result;
                }

                return resolveHookTranslation(result, runtime);
            };
        }

        combined.__CHEAT_RJ352933_DYNAMIC_MESSAGE_PATCHED__ = true;
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
                console.warn('[RJ352933DynamicMessageTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async resolveDialogueDataSources() {
        const dialogueMap = Array.isArray(window.CombinedDialogues?.dialogueMap)
            ? window.CombinedDialogues.dialogueMap
            : null;
        const nameCallingMap =
            window.CombinedDialogues?.nameCallingMap &&
            typeof window.CombinedDialogues.nameCallingMap === 'object'
                ? window.CombinedDialogues.nameCallingMap
                : null;

        if (dialogueMap && nameCallingMap) {
            return { dialogueMap, nameCallingMap };
        }

        const pluginEntry = Array.isArray(window.$plugins)
            ? window.$plugins.find(
                  (plugin) =>
                      plugin &&
                      String(plugin.name || '').trim().toLowerCase() === 'licodynamicmessage'
              )
            : null;

        const dialogueFile = String(pluginEntry?.parameters?.dialogueFile || 'dialogues.json').trim();
        const nameCallingFile = String(pluginEntry?.parameters?.nameCallingFile || 'namecallings.json').trim();

        return {
            dialogueMap: (await loadJsonFromDataFile(dialogueFile)) || [],
            nameCallingMap: (await loadJsonFromDataFile(nameCallingFile)) || {},
        };
    }

    async buildScanEntries() {
        const entries = [];
        const sources = await this.resolveDialogueDataSources();
        collectTextsFromUnknown(sources.dialogueMap, entries, ['dialogueMap']);
        collectTextsFromUnknown(sources.nameCallingMap, entries, ['nameCallingMap']);
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
                    id: `plugin_rj352933_dynamic_message_${byCacheKey.size}`,
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
}
