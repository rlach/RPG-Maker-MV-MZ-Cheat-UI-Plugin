/**
 * NoreRecollectionSaveTranslator
 *
 * Translator for Nore_RecollectionSave.js
 * Supported versions:
 * - TypeScript-compiled MV variant (game plugin build, no explicit semver header)
 *
 * Text sources:
 * - Plugin parameters (localized labels/messages)
 * - MV plugin command text payloads: 回想セーブ <label>
 *
 * Runtime notes:
 * - Hooks save/load list drawing and recollection confirm windows to translate
 *   rendered labels without changing command tokens.
 */

import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../js/translation-runtime/ObjectTranslationModalMethods.js';

const MV_PLUGIN_COMMAND_CODE = 356;
const RECO_SAVE_COMMAND = '回想セーブ';
const PARAM_TEXT_KEYS = [
    'alreadySaveExists',
    'alreadySaveExistsEn',
    'alreadySaveExistsCh',
    'fullSaveFiles',
    'fullSaveFilesEn',
    'fullSaveFilesCh',
    'recosaveJp',
    'recosaveEn',
    'recosaveCh',
    'loadJp',
    'loadEn',
    'loadCh',
    'confirmloadJp',
    'confirmloadEn',
    'confirmloadCh',
    'deleteJp',
    'deleteEn',
    'deleteCh',
    'copiedJp',
    'copiedEn',
    'copiedCh',
];

function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

export class NoreRecollectionSaveTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'Nore_RecollectionSave';
    }

    getPluginLabel() {
        return 'Nore RecollectionSave';
    }

    getCacheType() {
        return 'plugin_nore_recollection_save';
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
                console.warn('[NoreRecollectionSaveTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];
        this._collectPluginParameterEntries(entries);
        this._collectRecoSaveCommandsFromCommonEvents(entries);
        await this._collectRecoSaveCommandsFromMaps(entries);
        return entries;
    }

    _collectPluginParameterEntries(output) {
        const parameters = this._resolvePluginParameters();
        if (!parameters) {
            return;
        }

        for (const paramKey of PARAM_TEXT_KEYS) {
            const text = String(parameters[paramKey] || '');
            if (!this.isUsableText(text)) {
                continue;
            }

            output.push({
                text,
                source: { scope: 'pluginParam', paramKey },
            });
        }
    }

    _collectRecoSaveCommandsFromCommonEvents(output) {
        if (!Array.isArray(window.$dataCommonEvents)) {
            return;
        }

        for (let i = 0; i < window.$dataCommonEvents.length; i += 1) {
            const commonEvent = window.$dataCommonEvents[i];
            if (!commonEvent || !Array.isArray(commonEvent.list)) {
                continue;
            }

            this._collectRecoSaveCommandsFromList(
                commonEvent.list,
                { scope: 'commonEvent', commonEventId: i },
                output
            );
        }
    }

    async _collectRecoSaveCommandsFromMaps(output) {
        const mapInfos = Array.isArray(window.$dataMapInfos) ? window.$dataMapInfos : [];

        for (const mapInfo of mapInfos) {
            const mapId = Number(mapInfo?.id);
            if (!mapId) {
                continue;
            }

            try {
                const mapData = await loadMapDataById(mapId);
                if (!mapData || !Array.isArray(mapData.events)) {
                    continue;
                }

                this._collectRecoSaveCommandsFromMapData(mapData, mapId, output);
            } catch (error) {
                console.warn(
                    `[NoreRecollectionSaveTranslator] Failed to scan map ${mapId} for reco save commands`,
                    error
                );
            }
        }
    }

    _collectRecoSaveCommandsFromMapData(mapData, mapId, output) {
        for (let eventIdx = 0; eventIdx < mapData.events.length; eventIdx += 1) {
            const event = mapData.events[eventIdx];
            if (!event || !Array.isArray(event.pages)) {
                continue;
            }

            this._collectRecoSaveCommandsFromMapEvent(event, mapId, eventIdx, output);
        }
    }

    _collectRecoSaveCommandsFromMapEvent(event, mapId, eventIdx, output) {
        for (let pageIdx = 0; pageIdx < event.pages.length; pageIdx += 1) {
            const page = event.pages[pageIdx];
            if (!page || !Array.isArray(page.list)) {
                continue;
            }

            this._collectRecoSaveCommandsFromList(
                page.list,
                { scope: 'mapEvent', mapId, eventIdx, pageIdx },
                output
            );
        }
    }

    _collectRecoSaveCommandsFromList(list, baseMeta, output) {
        for (let cmdIdx = 0; cmdIdx < list.length; cmdIdx += 1) {
            const command = list[cmdIdx];
            const text = this._extractRecoSaveCommandText(command);
            if (!this.isUsableText(text)) {
                continue;
            }

            output.push({
                text,
                source: { ...baseMeta, cmdIdx, scopeType: 'pluginCommand' },
            });
        }
    }

    _extractRecoSaveCommandText(command) {
        if (Number(command?.code) !== MV_PLUGIN_COMMAND_CODE) {
            return '';
        }

        const commandLine = String(command?.parameters?.[0] || '');
        if (!commandLine.trim()) {
            return '';
        }

        if (!commandLine.startsWith(RECO_SAVE_COMMAND)) {
            return '';
        }

        let payload = commandLine.slice(RECO_SAVE_COMMAND.length);
        if (payload.startsWith(' ')) {
            payload = payload.slice(1);
        }

        return payload;
    }

    collectUntranslated({ runtime }) {
        if (!runtime) {
            return [];
        }

        const items = this._buildUniquePendingItems(runtime);
        return items.filter((item) => !runtime.hasUsableCacheValue(item.cacheKey));
    }

    getCachedCountsSync({ runtime }) {
        if (!runtime) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        const items = this._buildUniquePendingItems(runtime);
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

    enablePluginTranslation() {
        const savefileListProto = window.Window_SavefileList?.prototype;
        const selectableProto = Window_Selectable?.prototype;
        const sceneFileProto = Reflect.get(globalThis, 'Scene_File')?.prototype;
        const gameMessageProto = window.Game_Message?.prototype;
        const horzCommandProto = globalThis['Window_HorzCommand']?.prototype;
        const windowBaseProto = window.Window_Base?.prototype;

        if (
            !savefileListProto ||
            !gameMessageProto ||
            !sceneFileProto ||
            typeof savefileListProto.drawText !== 'function' ||
            typeof gameMessageProto.add !== 'function' ||
            typeof sceneFileProto.createListWindow !== 'function'
        ) {
            console.log(
                '[NoreRecollectionSaveTranslator] Required prototypes or methods not found, cannot apply translation hooks.',
                {
                    savefileListDrawText: typeof savefileListProto?.drawText,
                    gameMessageAdd: typeof gameMessageProto?.add,
                }
            );
            return false;
        }

        const runtimeSource = this._buildRuntimeSource();
        this._hookSavefileListDrawText(savefileListProto, runtimeSource);
        if (selectableProto && typeof selectableProto.drawText === 'function') {
            this._hookSelectableDrawText(selectableProto);
        }
        if (sceneFileProto && typeof sceneFileProto.createListWindow === 'function') {
            this._hookSceneFileCreateListWindow(sceneFileProto);
        }
        if (horzCommandProto && typeof horzCommandProto.addCommand === 'function') {
            this._hookWindowConfirmCommandLabels(horzCommandProto);
        }
        if (windowBaseProto && typeof windowBaseProto.drawTextEx === 'function') {
            this._hookWindowConfirmPromptText(windowBaseProto, runtimeSource);
        }
        this._hookGameMessageAdd(gameMessageProto);
        return true;
    }

    _buildRuntimeSource() {
        if (!this._scanPrepared) {
            this._scanEntries = this._buildSyncScanEntries();
        }

        const exactTexts = new Set();
        const templates = [];

        for (const entry of this._scanEntries) {
            const text = String(entry?.text || '');
            if (!this.isUsableText(text)) {
                continue;
            }

            exactTexts.add(text);

            if (!text.includes('%1')) {
                continue;
            }

            const pattern = escapeRegExp(text).replace('%1', '(.+?)');
            templates.push({
                template: text,
                regex: new RegExp(`^${pattern}$`),
            });
        }

        return { exactTexts, templates };
    }

    _hookSavefileListDrawText(prototype, runtimeSource) {
        if (prototype.__CHEAT_NORE_RECOLLECTION_SAVE_DRAW_TEXT_PATCHED__) {
            return;
        }

        const original = prototype.drawText;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);
        const isUsableText = this.isUsableText.bind(this);

        prototype.drawText = function (text, x, y, maxWidth, align) {
            let renderedText = text;

            try {
                const runtime = getRuntime();
                if (!isRuntimeTranslationActive(runtime) || !isUsableText(text)) {
                    return original.call(this, renderedText, x, y, maxWidth, align);
                }

                const cacheKey = runtime.getCacheKey(text, 'plugin_nore_recollection_save');
                if (runtime.hasUsableCacheValue(cacheKey)) {
                    renderedText = resolveRuntimeTranslation(
                        text,
                        runtime,
                        'plugin_nore_recollection_save',
                        {
                            requireRuntimeTranslationActive: true,
                            missValue: text,
                        }
                    );

                    return original.call(this, renderedText, x, y, maxWidth, align);
                }

                for (const templateEntry of runtimeSource.templates) {
                    const match = text.match(templateEntry.regex);
                    if (!match) {
                        continue;
                    }

                    const translatedTemplate = resolveRuntimeTranslation(
                        templateEntry.template,
                        runtime,
                        'plugin_nore_recollection_save',
                        {
                            requireRuntimeTranslationActive: true,
                            missValue: templateEntry.template,
                        }
                    );

                    if (translatedTemplate === templateEntry.template) {
                        break;
                    }

                    renderedText = translatedTemplate.includes('%1')
                        ? translatedTemplate.replace('%1', match[1])
                        : translatedTemplate;
                    break;
                }
            } catch (error) {
                console.warn(
                    '[NoreRecollectionSaveTranslator] Failed to translate save list text',
                    error
                );
            }

            return original.call(this, renderedText, x, y, maxWidth, align);
        };

        Object.defineProperty(prototype, '__CHEAT_NORE_RECOLLECTION_SAVE_DRAW_TEXT_PATCHED__', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    _hookSelectableDrawText(prototype) {
        if (prototype.__CHEAT_NORE_RECOLLECTION_SAVE_SELECTABLE_DRAW_TEXT_PATCHED__) {
            return;
        }

        const original = prototype.drawText;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);
        const isUsableText = this.isUsableText.bind(this);

        prototype.drawText = function (text, x, y, maxWidth, align) {
            let renderedText = text;

            try {
                const runtime = getRuntime();
                if (!isRuntimeTranslationActive(runtime) || !isUsableText(text)) {
                    return original.call(this, renderedText, x, y, maxWidth, align);
                }

                const cacheKey = runtime.getCacheKey(text, 'plugin_nore_recollection_save');
                if (runtime.hasUsableCacheValue(cacheKey)) {
                    renderedText = resolveRuntimeTranslation(
                        text,
                        runtime,
                        'plugin_nore_recollection_save',
                        {
                            requireRuntimeTranslationActive: true,
                            missValue: text,
                        }
                    );
                }
            } catch (error) {
                console.warn(
                    '[NoreRecollectionSaveTranslator] Failed to translate selectable text',
                    error
                );
            }

            return original.call(this, renderedText, x, y, maxWidth, align);
        };

        Object.defineProperty(
            prototype,
            '__CHEAT_NORE_RECOLLECTION_SAVE_SELECTABLE_DRAW_TEXT_PATCHED__',
            {
                value: true,
                configurable: true,
                enumerable: false,
                writable: false,
            }
        );
    }

    _hookSceneFileCreateListWindow(prototype) {
        if (prototype.__CHEAT_NORE_RECOLLECTION_SAVE_CREATE_LIST_WINDOW_PATCHED__) {
            return;
        }

        const original = prototype.createListWindow;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);
        const isUsableText = this.isUsableText.bind(this);

        prototype.createListWindow = function () {
            console.log(
                '[NoreRecollectionSaveTranslator] createListWindow called, applying drawItem hook'
            );
            original.call(this);
            const listWindow = this?._listWindow;

            console.log('[NoreRecollectionSaveTranslator] List window instance', listWindow);

            if (
                !listWindow ||
                typeof listWindow.drawItem !== 'function' ||
                listWindow.__CHEAT_NORE_RECOLLECTION_SAVE_DRAW_ITEM_PATCHED__
            ) {
                return;
            }

            const originalDrawItem = listWindow.drawItem;
            listWindow.drawItem = function (index) {
                console.log(`[NoreRecollectionSaveTranslator] drawItem called for index ${index}`);
                const runtime = getRuntime();
                if (!isRuntimeTranslationActive(runtime)) {
                    return originalDrawItem.call(this, index);
                }

                const originalDrawText = this.drawText;
                const drawTextFn = typeof originalDrawText === 'function' ? originalDrawText : null;
                if (!drawTextFn) {
                    return originalDrawItem.call(this, index);
                }

                var id = index + this.pageTopIndex();
                var info = DataManager.loadSavefileInfo(id);

                this.drawText = function (text, x, y, maxWidth, align) {
                    console.log(
                        `[NoreRecollectionSaveTranslator] drawText called with text: ${text}`
                    );
                    // if info label doesn't exist or is different than text then this is not the save label, so skip translation
                    if (!isUsableText(text) || !info?.label || text !== info.label) {
                        return Reflect.apply(drawTextFn, this, [text, x, y, maxWidth, align]);
                    }

                    console.log(
                        '[NoreRecollectionSaveTranslator] Translating save file label',
                        text,
                        info?.label
                    );
                    const translated = resolveRuntimeTranslation(
                        text,
                        runtime,
                        'plugin_nore_recollection_save',
                        {
                            requireRuntimeTranslationActive: true,
                            missValue: text,
                        }
                    );

                    return Reflect.apply(drawTextFn, this, [translated, x, y, maxWidth, align]);
                };

                try {
                    return originalDrawItem.call(this, index);
                } finally {
                    this.drawText = originalDrawText;
                }
            };

            Object.defineProperty(
                listWindow,
                '__CHEAT_NORE_RECOLLECTION_SAVE_DRAW_ITEM_PATCHED__',
                {
                    value: true,
                    configurable: true,
                    enumerable: false,
                    writable: false,
                }
            );
        };

        Object.defineProperty(
            prototype,
            '__CHEAT_NORE_RECOLLECTION_SAVE_CREATE_LIST_WINDOW_PATCHED__',
            {
                value: true,
                configurable: true,
                enumerable: false,
                writable: false,
            }
        );
    }

    _hookWindowConfirmCommandLabels(prototype) {
        if (prototype.__CHEAT_NORE_RECOLLECTION_SAVE_HORZ_COMMAND_PATCHED__) {
            return;
        }

        const original = prototype.addCommand;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);

        prototype.addCommand = function (name, symbol, enabled, ext) {
            if (this?.constructor?.name !== 'Window_Confirm') {
                return original.call(this, name, symbol, enabled, ext);
            }

            const runtime = getRuntime();
            if (!isRuntimeTranslationActive(runtime)) {
                return original.call(this, name, symbol, enabled, ext);
            }

            const translated = resolveRuntimeTranslation(
                name,
                runtime,
                'plugin_nore_recollection_save',
                {
                    requireRuntimeTranslationActive: true,
                    missValue: name,
                }
            );

            return original.call(this, translated, symbol, enabled, ext);
        };

        Object.defineProperty(prototype, '__CHEAT_NORE_RECOLLECTION_SAVE_HORZ_COMMAND_PATCHED__', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    _hookWindowConfirmPromptText(prototype, runtimeSource) {
        if (prototype.__CHEAT_NORE_RECOLLECTION_SAVE_DRAW_TEXT_EX_PATCHED__) {
            return;
        }

        const original = prototype.drawTextEx;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);
        const isUsableText = this.isUsableText.bind(this);

        prototype.drawTextEx = function (text, x, y) {
            let renderedText = text;

            try {
                if (!isUsableText(text)) {
                    return original.call(this, renderedText, x, y);
                }

                const runtime = getRuntime();
                if (!isRuntimeTranslationActive(runtime)) {
                    return original.call(this, renderedText, x, y);
                }

                const cacheKey = runtime.getCacheKey(text, 'plugin_nore_recollection_save');
                if (runtime.hasUsableCacheValue(cacheKey)) {
                    renderedText = resolveRuntimeTranslation(
                        text,
                        runtime,
                        'plugin_nore_recollection_save',
                        {
                            requireRuntimeTranslationActive: true,
                            missValue: text,
                        }
                    );

                    return original.call(this, renderedText, x, y);
                }

                for (const templateEntry of runtimeSource.templates) {
                    const match = text.match(templateEntry.regex);
                    if (!match) {
                        continue;
                    }

                    const translatedTemplate = resolveRuntimeTranslation(
                        templateEntry.template,
                        runtime,
                        'plugin_nore_recollection_save',
                        {
                            requireRuntimeTranslationActive: true,
                            missValue: templateEntry.template,
                        }
                    );

                    if (translatedTemplate === templateEntry.template) {
                        break;
                    }

                    renderedText = translatedTemplate.replace(
                        /%([1-9]\d*)/g,
                        (placeholder, indexText) => {
                            const captureIndex = Number(indexText);
                            return match[captureIndex] ?? placeholder;
                        }
                    );
                    break;
                }
            } catch (error) {
                console.warn(
                    '[NoreRecollectionSaveTranslator] Failed to translate drawTextEx text',
                    error
                );
            }

            return original.call(this, renderedText, x, y);
        };

        Object.defineProperty(prototype, '__CHEAT_NORE_RECOLLECTION_SAVE_DRAW_TEXT_EX_PATCHED__', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    _hookGameMessageAdd(prototype) {
        if (prototype.__CHEAT_NORE_RECOLLECTION_SAVE_GAME_MESSAGE_PATCHED__) {
            return;
        }

        const original = prototype.add;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);

        prototype.add = function (text) {
            const runtime = getRuntime();
            if (!isRuntimeTranslationActive(runtime)) {
                return original.call(this, text);
            }

            const translated = resolveRuntimeTranslation(
                text,
                runtime,
                'plugin_nore_recollection_save',
                {
                    requireRuntimeTranslationActive: true,
                    missValue: text,
                }
            );

            return original.call(this, translated);
        };

        Object.defineProperty(prototype, '__CHEAT_NORE_RECOLLECTION_SAVE_GAME_MESSAGE_PATCHED__', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    _resolvePluginParameters() {
        const pluginEntry = this.findPluginEntry(this.getPluginName());
        if (pluginEntry?.parameters && typeof pluginEntry.parameters === 'object') {
            return pluginEntry.parameters;
        }

        if (typeof window.PluginManager?.parameters === 'function') {
            const parameters = window.PluginManager.parameters(this.getPluginName());
            if (parameters && typeof parameters === 'object') {
                return parameters;
            }
        }

        return null;
    }

    _buildUniquePendingItems(runtime) {
        if (!this._scanPrepared) {
            this._scanEntries = this._buildSyncScanEntries();
        }

        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = String(entry?.text || '');
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (byCacheKey.has(cacheKey)) {
                continue;
            }

            byCacheKey.set(cacheKey, {
                type: this.getCacheType(),
                id: `plugin_nore_recollection_save_${byCacheKey.size}`,
                value: text,
                cacheKey,
            });
        }

        return Array.from(byCacheKey.values());
    }

    _buildSyncScanEntries() {
        const entries = [];
        this._collectPluginParameterEntries(entries);
        this._collectRecoSaveCommandsFromCommonEvents(entries);
        return entries;
    }
}
