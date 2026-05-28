/**
 * RJ352933 Tsuka / Licotsuka_fix game-specific translator
 *
 * Purpose:
 * - Harvest translatable dialogue text used by setupRandomTalk from LicoTalking.json.
 * - Apply runtime cached translation to the final selected random talk text.
 *
 * Usage:
 * - Copy this file to cheat custom translator folder and enable custom translators.
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

function shouldSkipByKeyName(keyName) {
    const key = String(keyName || '').trim().toLowerCase();
    if (!key) {
        return false;
    }

    return /(^|_)(voice|se|bgm|bgs|me|file|path|id|index|group|key|tag|image|pic|pict|icon)(_|$)/.test(
        key
    );
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
            if (typeof child === 'string' && shouldSkipByKeyName(key)) {
                continue;
            }
            collectTextsFromUnknown(child, output, [...path, key]);
        }
        return;
    }

    if (typeof value === 'string' && isLikelyTranslatableText(value)) {
        output.push({
            text: value,
            source: {
                scope: 'LicoTalking',
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

export class RJ352933TsukaTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'RJ352933_Tsuka';
    }

    getPluginLabel() {
        return 'RJ352933 Tsuka Random Talk';
    }

    getCacheType() {
        return 'plugin_rj352933_tsuka_random_talk';
    }

    detectPlugin() {
        const hasPluginEntry = Array.isArray(window.$plugins)
            ? window.$plugins.some(
                  (plugin) =>
                      plugin?.status === true &&
                      String(plugin.name || '').trim().toLowerCase() === 'licotsuka_fix'
              )
            : false;

        return hasPluginEntry || typeof window.CCUtils?.setupRandomTalk === 'function';
    }

    enablePluginTranslation() {
        if (!window.CCUtils || typeof window.CCUtils.setupRandomTalk !== 'function') {
            return false;
        }

        if (window.CCUtils.__CHEAT_RJ352933_TSUKA_RANDOM_TALK_PATCHED__) {
            return true;
        }

        const originalSetupRandomTalk = window.CCUtils.setupRandomTalk;
        const runtimeForHook = () => this.getRuntime();
        const runtimeTranslationEnabled = (runtime) => this.isRuntimeTranslationActive(runtime);
        const resolveHookTranslation = (text, runtime) =>
            this.resolveRuntimeTranslation(text, runtime, this.getCacheType(), {
                requireRuntimeTranslationActive: true,
            });

        const translateGabMessage = (source, runtime) => {
            const message = typeof source === 'string' ? source : String(source ?? '');
            if (!this.isUsableText(message)) {
                return source;
            }

            const segments = message.split('|');
            let changed = false;
            const translatedSegments = segments.map((segment) => {
                if (!this.isUsableText(segment)) {
                    return segment;
                }

                const translated = resolveHookTranslation(segment, runtime);
                if (this.isUsableText(translated) && translated !== segment) {
                    changed = true;
                    return translated;
                }

                return segment;
            });

            if (!changed) {
                return source;
            }

            return translatedSegments.join('|');
        };

        window.CCUtils.setupRandomTalk = function (groupName, levelVariableId, talkVariableId, voiceVariableId) {
            const result = originalSetupRandomTalk.apply(this, arguments);

            const runtime = runtimeForHook();
            if (!runtime || !runtimeTranslationEnabled(runtime)) {
                return result;
            }

            const targetTalkVariableId = Number(talkVariableId || 884) || 884;
            const currentText = $gameVariables.value(targetTalkVariableId);
            if (typeof currentText !== 'string' || !currentText.trim()) {
                return result;
            }

            const translated = resolveHookTranslation(currentText, runtime);

            if (typeof translated === 'string' && translated.trim()) {
                $gameVariables.setValue(targetTalkVariableId, translated);
            }

            return result;
        };

        const gameSystemProto = window.Game_System?.prototype;
        if (gameSystemProto && typeof gameSystemProto.pushGabRightMessage === 'function') {
            const originalPushGabRightMessage = gameSystemProto.pushGabRightMessage;
            gameSystemProto.pushGabRightMessage = function (message) {
                const runtime = runtimeForHook();
                if (!runtime || !runtimeTranslationEnabled(runtime)) {
                    return originalPushGabRightMessage.apply(this, arguments);
                }

                const translatedMessage = translateGabMessage(message, runtime);
                return originalPushGabRightMessage.call(this, translatedMessage);
            };
        }

        if (gameSystemProto && typeof gameSystemProto.pushGabLeftMessage === 'function') {
            const originalPushGabLeftMessage = gameSystemProto.pushGabLeftMessage;
            gameSystemProto.pushGabLeftMessage = function (message, actorId) {
                const runtime = runtimeForHook();
                if (!runtime || !runtimeTranslationEnabled(runtime)) {
                    return originalPushGabLeftMessage.apply(this, arguments);
                }

                const translatedMessage = translateGabMessage(message, runtime);
                return originalPushGabLeftMessage.call(this, translatedMessage, actorId);
            };
        }

        window.CCUtils.__CHEAT_RJ352933_TSUKA_RANDOM_TALK_PATCHED__ = true;
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
                console.warn('[RJ352933TsukaTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async resolveLicoTalkingData() {
        if (window.$dataUniques?.LicoTalking) {
            return window.$dataUniques.LicoTalking;
        }

        if (window.$dataUniques?.licoTalking) {
            return window.$dataUniques.licoTalking;
        }

        const loaded = await loadJsonFromDataFile('LicoTalking.json');
        return loaded || [];
    }

    async buildScanEntries() {
        const entries = [];
        const source = await this.resolveLicoTalkingData();
        collectTextsFromUnknown(source, entries);
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
                    id: `plugin_rj352933_tsuka_${byCacheKey.size}`,
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
