import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../js/translation-runtime/ObjectTranslationModalMethods.js';

// Replicated from KMS_MapActiveMessage.js plugin source
const ACTIVE_MESSAGE_REGEX = /<(?:アクティブメッセージ|ActiveMessage)\s*[:\s]\s*([^>]+)>/i;
const BEGIN_MESSAGE_REGEX = /<(?:アクティブメッセージ|ActiveMessage)\s*[:\s][^>]+$/i;
const END_MESSAGE_REGEX = /([^>]*)>/;

export class KmsMapActiveMessageTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'KMS_MapActiveMessage';
    }

    getPluginLabel() {
        return 'KMS MapActiveMessage';
    }

    getCacheType() {
        return 'plugin_kms_map_active_message';
    }

    extractActiveMessageTextsFromList(list) {
        const texts = [];

        if (!Array.isArray(list)) {
            return texts;
        }

        let inMessage = false;
        let commentUnit = '';

        for (const cmd of list) {
            if (!cmd || (Number(cmd.code) !== 108 && Number(cmd.code) !== 408)) {
                // Plugin only parses leading comment block; stop at first non-comment
                break;
            }

            const commentText = String((cmd.parameters && cmd.parameters[0]) || '');

            if (inMessage) {
                commentUnit += '\n' + commentText;

                if (END_MESSAGE_REGEX.test(commentText)) {
                    const match = ACTIVE_MESSAGE_REGEX.exec(commentUnit);
                    if (match && match[1] && match[1].trim()) {
                        texts.push(match[1]);
                    }
                    commentUnit = '';
                    inMessage = false;
                }
            } else {
                if (BEGIN_MESSAGE_REGEX.test(commentText)) {
                    commentUnit = commentText;
                    inMessage = true;
                } else {
                    const match = ACTIVE_MESSAGE_REGEX.exec(commentText);
                    if (match && match[1] && match[1].trim()) {
                        texts.push(match[1]);
                    }
                }
            }
        }

        // Handle unclosed multi-line message block
        if (inMessage && commentUnit) {
            const match = ACTIVE_MESSAGE_REGEX.exec(commentUnit);
            if (match && match[1] && match[1].trim()) {
                texts.push(match[1]);
            }
        }

        return texts;
    }

    enablePluginTranslation() {
        if (!window.Game_Event || !Game_Event.prototype) {
            return;
        }

        const hasNewApi = typeof Game_Event.prototype.getMapActiveMessages === 'function';
        const hasLegacyApi = typeof Game_Event.prototype.getMapActiveMessage === 'function';

        if (!hasNewApi && !hasLegacyApi) {
            return;
        }

        const cacheType = this.getCacheType();
        const resolveRuntime = () =>
            window.__ensureTranslationRuntime?.() || window.__TranslationRuntime || null;

        const translateTextFromCache = (text) => {
            if (typeof text !== 'string' || !text.trim()) {
                return text;
            }

            const runtime = resolveRuntime();
            if (
                !runtime
            ) {
                return text;
            }

            const cacheKey = runtime.getCacheKey(text, cacheType);

            runtime.trackCacheKeyUsage(cacheKey);

            if (!runtime.hasUsableCacheValue(cacheKey)) {
                return text;
            }

            const cached = runtime.translationCache.get(cacheKey);
            if (typeof cached !== 'string' || !cached.trim()) {
                return text;
            }

            return cached;
        };

        if (hasNewApi) {
            const originalGetMapActiveMessages = Game_Event.prototype.getMapActiveMessages;

            Game_Event.prototype.getMapActiveMessages = function () {
                const messages = originalGetMapActiveMessages.call(this);

                if (!Array.isArray(messages)) {
                    return messages;
                }

                try {
                    return messages.map((msg) => {
                        if (!msg || typeof msg.text !== 'string' || !msg.text.trim()) {
                            return msg;
                        }

                        const translatedText = translateTextFromCache(msg.text);
                        if (translatedText === msg.text) {
                            return msg;
                        }

                        return { ...msg, text: translatedText };
                    });
                } catch (error) {
                    console.warn(
                        '[KmsMapActiveMessageTranslator] Failed to apply cached translation (new API)',
                        error
                    );
                    return messages;
                }
            };
        }

        if (hasLegacyApi) {
            const originalGetMapActiveMessage = Game_Event.prototype.getMapActiveMessage;

            Game_Event.prototype.getMapActiveMessage = function () {
                const message = originalGetMapActiveMessage.call(this);

                try {
                    return translateTextFromCache(message);
                } catch (error) {
                    console.warn(
                        '[KmsMapActiveMessageTranslator] Failed to apply cached translation (legacy API)',
                        error
                    );
                    return message;
                }
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

        this._scanPromise = this.buildScanEntries()
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[KmsMapActiveMessageTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];

        const mapInfos = Array.isArray(window.$dataMapInfos) ? window.$dataMapInfos : [];

        for (const mapInfo of mapInfos) {
            const mapId = Number(mapInfo && mapInfo.id);
            if (!mapId) {
                continue;
            }

            try {
                const mapData = await loadMapDataById(mapId);
                if (!mapData || !Array.isArray(mapData.events)) {
                    continue;
                }

                for (let eventIdx = 0; eventIdx < mapData.events.length; eventIdx++) {
                    const event = mapData.events[eventIdx];
                    if (!event || !Array.isArray(event.pages)) {
                        continue;
                    }

                    for (let pageIdx = 0; pageIdx < event.pages.length; pageIdx++) {
                        const page = event.pages[pageIdx];
                        if (!page || !Array.isArray(page.list)) {
                            continue;
                        }

                        this.collectActiveMessageTextsFromList(
                            page.list,
                            { scope: 'mapEvent', mapId, eventIdx, pageIdx },
                            entries
                        );
                    }
                }
            } catch (error) {
                console.warn(`[KmsMapActiveMessageTranslator] Failed to scan map ${mapId}`, error);
            }
        }

        return entries;
    }

    collectActiveMessageTextsFromList(list, baseMeta, output) {
        if (!Array.isArray(list) || !Array.isArray(output)) {
            return;
        }

        const texts = this.extractActiveMessageTextsFromList(list);
        for (let i = 0; i < texts.length; i++) {
            output.push({
                text: texts[i],
                source: { ...baseMeta, textIdx: i },
            });
        }
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!text || !text.trim()) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_kms_map_active_message_${byCacheKey.size}`,
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
