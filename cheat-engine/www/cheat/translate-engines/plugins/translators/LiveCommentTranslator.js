import { BasePluginTranslator } from '../BasePluginTranslator.js';

/*
 * LiveComment translator.
 *
 * Supported versions:
 * - MV (2021-09-27 changelog version)
 *
 * Translation notes:
 * - Text is stored in common-event Show Text command blocks consumed by ST_COMMENT.
 * - The first line can include LiveComment metadata prefix (value and/or wait frames),
 *   and only the comment payload portion is collected and translated.
 * - Runtime hook point is Service_Chat#createComment via Scene_Map service instance.
 * - Plugin command tokens (ST_COMMENT/CL_COMMENT/RM_COMMENT) are preserved and not translated.
 */

const CACHE_TYPE = 'plugin_live_comment';
const LIVE_COMMENT_SERVICE_HOOK_FLAG = '__CHEAT_LIVE_COMMENT_TRANSLATOR_HOOKED__';
const SCENE_MAP_HOOK_FLAG = '__CHEAT_LIVE_COMMENT_TRANSLATOR_SCENE_MAP_HOOKED__';
const SCENE_MAP_UPDATE_HOOK_FLAG = '__CHEAT_LIVE_COMMENT_TRANSLATOR_SCENE_MAP_UPDATE_HOOKED__';
const SCENE_MAP_TRANSLATOR_REF = '__CHEAT_LIVE_COMMENT_TRANSLATOR_REF__';
const GAME_MAP_SETUP_HOOK_FLAG = '__CHEAT_LIVE_COMMENT_TRANSLATOR_GAME_MAP_SETUP_HOOKED__';
const GAME_MAP_TRANSLATOR_REF = '__CHEAT_LIVE_COMMENT_TRANSLATOR_REF__';
const LIVE_COMMENT_PREFIX_PATTERN = /^((\d+),)?((\d+)f,)?(.*)$/i;

function normalizeCommentLine(value) {
    if (typeof value === 'string') {
        return value;
    }

    if (value === null || value === undefined) {
        return '';
    }

    return String(value);
}

function extractFirstLinePayload(text) {
    const source = normalizeCommentLine(text);
    const match = LIVE_COMMENT_PREFIX_PATTERN.exec(source);
    if (!match) {
        return source;
    }

    return String(match[5] || '');
}

export class LiveCommentTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
        this._hookedService = null;
    }

    getPluginName() {
        return 'LiveComment';
    }

    getPluginLabel() {
        return 'LiveComment';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    _translateRuntimeCommentLine(text, runtime) {
        const sourceText = normalizeCommentLine(text);
        if (!this.isUsableText(sourceText) || !runtime) {
            return sourceText;
        }

        const cacheKey = runtime.getCacheKey(sourceText, CACHE_TYPE);
        runtime.trackCacheKeyUsage(cacheKey);

        if (!this.isRuntimeTranslationActive(runtime)) {
            return sourceText;
        }

        return this.resolveRuntimeTranslation(sourceText, runtime, CACHE_TYPE, {
            requireRuntimeTranslationActive: true,
            missValue: sourceText,
            harvestMissing: false,
        });
    }

    _translateRuntimeCommentLines(texts, runtime) {
        if (!Array.isArray(texts) || texts.length === 0) {
            return texts;
        }

        let changed = false;
        const translatedLines = texts.map((line) => {
            const sourceText = normalizeCommentLine(line);
            const translated = this._translateRuntimeCommentLine(sourceText, runtime);
            if (translated !== sourceText) {
                changed = true;
            }
            return translated;
        });

        return changed ? translatedLines : texts;
    }

    _tryHookLiveCommentService(scene) {
        const service = scene?._service;
        if (!service || typeof service.createComment !== 'function') {
            return false;
        }

        if (this._hookedService === service) {
            return true;
        }

        if (service[LIVE_COMMENT_SERVICE_HOOK_FLAG]) {
            this._hookedService = service;
            return true;
        }

        const originalCreateComment = service.createComment;

        service.createComment = (text, x, y, value) => {
            const runtime = this.getRuntime();
            const translatedText = this._translateRuntimeCommentLines(text, runtime);
            return originalCreateComment.call(service, translatedText, x, y, value);
        };

        service[LIVE_COMMENT_SERVICE_HOOK_FLAG] = true;
        this._hookedService = service;
        return true;
    }

    _installSceneMapHook() {
        if (!window.Scene_Map || !Scene_Map.prototype) {
            return false;
        }

        Scene_Map.prototype[SCENE_MAP_TRANSLATOR_REF] = this;

        if (
            !Scene_Map.prototype[SCENE_MAP_HOOK_FLAG] &&
            typeof Scene_Map.prototype.onMapLoaded === 'function'
        ) {
            const originalOnMapLoaded = Scene_Map.prototype.onMapLoaded;
            Scene_Map.prototype.onMapLoaded = function () {
                originalOnMapLoaded.apply(this, arguments);
                const translator = Scene_Map.prototype[SCENE_MAP_TRANSLATOR_REF];
                if (translator) {
                    translator._tryHookLiveCommentService(this);
                }
            };
            Scene_Map.prototype[SCENE_MAP_HOOK_FLAG] = true;
        }

        if (
            !Scene_Map.prototype[SCENE_MAP_UPDATE_HOOK_FLAG] &&
            typeof Scene_Map.prototype.update === 'function'
        ) {
            const originalUpdate = Scene_Map.prototype.update;
            Scene_Map.prototype.update = function () {
                originalUpdate.apply(this, arguments);
                const translator = Scene_Map.prototype[SCENE_MAP_TRANSLATOR_REF];
                if (translator) {
                    translator._tryHookLiveCommentService(this);
                }
            };
            Scene_Map.prototype[SCENE_MAP_UPDATE_HOOK_FLAG] = true;
        }

        return (
            Scene_Map.prototype[SCENE_MAP_HOOK_FLAG] ||
            Scene_Map.prototype[SCENE_MAP_UPDATE_HOOK_FLAG]
        );
    }

    _installGameMapHook() {
        if (typeof Game_Map === 'undefined' || !Game_Map.prototype) {
            return false;
        }

        Game_Map.prototype[GAME_MAP_TRANSLATOR_REF] = this;

        if (
            !Game_Map.prototype[GAME_MAP_SETUP_HOOK_FLAG] &&
            typeof Game_Map.prototype.setup === 'function'
        ) {
            const originalSetup = Game_Map.prototype.setup;
            Game_Map.prototype.setup = function () {
                originalSetup.apply(this, arguments);
                const translator = Game_Map.prototype[GAME_MAP_TRANSLATOR_REF];
                if (translator) {
                    translator._tryHookLiveCommentService(window.SceneManager?._scene);
                }
            };
            Game_Map.prototype[GAME_MAP_SETUP_HOOK_FLAG] = true;
        }

        return !!Game_Map.prototype[GAME_MAP_SETUP_HOOK_FLAG];
    }

    enablePluginTranslation() {
        const sceneHooksInstalled = this._installSceneMapHook();
        const gameMapHooksInstalled = this._installGameMapHook();
        const activeSceneHooked = this._tryHookLiveCommentService(window.SceneManager?._scene);

        return activeSceneHooked || sceneHooksInstalled || gameMapHooksInstalled;
    }

    _extractMessageLines(list, startIndex) {
        const lines = [];
        let cursor = startIndex + 1;

        while (cursor < list.length && Number(list[cursor]?.code) === 401) {
            lines.push(normalizeCommentLine(list[cursor]?.parameters?.[0]));
            cursor += 1;
        }

        return { lines, cursor };
    }

    _pushCollectedMessageLines(messageLines, output, baseMeta, commandIndex) {
        if (!Array.isArray(messageLines) || messageLines.length === 0) {
            return;
        }

        const firstLinePayload = extractFirstLinePayload(messageLines[0]);
        if (this.isUsableText(firstLinePayload)) {
            output.push({
                text: firstLinePayload,
                source: {
                    ...baseMeta,
                    cmdIdx: commandIndex,
                    lineIdx: 0,
                    kind: 'showText',
                },
            });
        }

        for (let lineIdx = 1; lineIdx < messageLines.length; lineIdx++) {
            const lineText = messageLines[lineIdx];
            if (!this.isUsableText(lineText)) {
                continue;
            }

            output.push({
                text: lineText,
                source: {
                    ...baseMeta,
                    cmdIdx: commandIndex,
                    lineIdx,
                    kind: 'showText',
                },
            });
        }
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
                console.warn('[LiveCommentTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const entries = [];
        if (!Array.isArray(window.$dataCommonEvents)) {
            return entries;
        }

        for (let commonEventId = 0; commonEventId < $dataCommonEvents.length; commonEventId++) {
            const commonEvent = $dataCommonEvents[commonEventId];
            if (!commonEvent || !Array.isArray(commonEvent.list)) {
                continue;
            }

            this.collectLiveCommentEntriesFromList(
                commonEvent.list,
                {
                    scope: 'commonEvent',
                    commonEventId,
                },
                entries
            );
        }

        return entries;
    }

    collectLiveCommentEntriesFromList(list, baseMeta, output) {
        if (!Array.isArray(list) || !Array.isArray(output)) {
            return;
        }

        let commandIndex = 0;
        while (commandIndex < list.length) {
            const command = list[commandIndex];
            if (Number(command?.code) !== 101) {
                commandIndex += 1;
                continue;
            }

            const { lines, cursor } = this._extractMessageLines(list, commandIndex);
            this._pushCollectedMessageLines(lines, output, baseMeta, commandIndex);
            commandIndex = cursor;
        }
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = normalizeCommentLine(entry?.text);
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, CACHE_TYPE);
            if (byCacheKey.has(cacheKey)) {
                continue;
            }

            byCacheKey.set(cacheKey, {
                type: CACHE_TYPE,
                id: `plugin_live_comment_${byCacheKey.size}`,
                value: text,
                cacheKey,
            });
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
