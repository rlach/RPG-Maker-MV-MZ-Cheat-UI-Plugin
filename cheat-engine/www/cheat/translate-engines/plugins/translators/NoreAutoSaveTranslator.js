/**
 * NoreAutoSaveTranslator
 *
 * Translator for Nore_AutoSave.js
 * Supported versions:
 * - v0.02 (MV)
 *
 * Text sources:
 * - Plugin parameters (autosave labels per locale)
 * - MV plugin command payloads: Nore_AutoSave autoSave <label>
 */

import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../js/translation-runtime/ObjectTranslationModalMethods.js';

const MV_PLUGIN_COMMAND_CODE = 356;
const AUTOSAVE_PLUGIN_COMMAND = 'Nore_AutoSave';
const AUTOSAVE_SUB_COMMAND = 'autoSave';
const PARAM_TEXT_KEYS = ['autosaveJp', 'autosaveEn', 'autosaveCh'];

export class NoreAutoSaveTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'Nore_AutoSave';
    }

    getPluginLabel() {
        return 'Nore AutoSave';
    }

    getCacheType() {
        return 'plugin_nore_auto_save';
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
                console.warn('[NoreAutoSaveTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];
        this._collectPluginParameterEntries(entries);
        this._collectAutoSaveCommandsFromCommonEvents(entries);
        await this._collectAutoSaveCommandsFromMaps(entries);
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

    _collectAutoSaveCommandsFromCommonEvents(output) {
        if (!Array.isArray(window.$dataCommonEvents)) {
            return;
        }

        for (let i = 0; i < window.$dataCommonEvents.length; i += 1) {
            const commonEvent = window.$dataCommonEvents[i];
            if (!commonEvent || !Array.isArray(commonEvent.list)) {
                continue;
            }

            this._collectAutoSaveCommandsFromList(
                commonEvent.list,
                { scope: 'commonEvent', commonEventId: i },
                output
            );
        }
    }

    async _collectAutoSaveCommandsFromMaps(output) {
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

                this._collectAutoSaveCommandsFromMapData(mapData, mapId, output);
            } catch (error) {
                console.warn(
                    `[NoreAutoSaveTranslator] Failed to scan map ${mapId} for autoSave commands`,
                    error
                );
            }
        }
    }

    _collectAutoSaveCommandsFromMapData(mapData, mapId, output) {
        for (let eventIdx = 0; eventIdx < mapData.events.length; eventIdx += 1) {
            const event = mapData.events[eventIdx];
            if (!event || !Array.isArray(event.pages)) {
                continue;
            }

            this._collectAutoSaveCommandsFromMapEvent(event, mapId, eventIdx, output);
        }
    }

    _collectAutoSaveCommandsFromMapEvent(event, mapId, eventIdx, output) {
        for (let pageIdx = 0; pageIdx < event.pages.length; pageIdx += 1) {
            const page = event.pages[pageIdx];
            if (!page || !Array.isArray(page.list)) {
                continue;
            }

            this._collectAutoSaveCommandsFromList(
                page.list,
                { scope: 'mapEvent', mapId, eventIdx, pageIdx },
                output
            );
        }
    }

    _collectAutoSaveCommandsFromList(list, baseMeta, output) {
        for (let cmdIdx = 0; cmdIdx < list.length; cmdIdx += 1) {
            const command = list[cmdIdx];
            const text = this._extractAutoSaveCommandText(command);
            if (!this.isUsableText(text)) {
                continue;
            }

            output.push({
                text,
                source: { ...baseMeta, cmdIdx, scopeType: 'pluginCommand' },
            });
        }
    }

    _extractAutoSaveCommandText(command) {
        if (Number(command?.code) !== MV_PLUGIN_COMMAND_CODE) {
            return '';
        }

        const commandLine = String(command?.parameters?.[0] || '');
        if (!commandLine.trim()) {
            return '';
        }

        const prefix = `${AUTOSAVE_PLUGIN_COMMAND} ${AUTOSAVE_SUB_COMMAND}`;
        if (!commandLine.startsWith(prefix)) {
            return '';
        }

        let payload = commandLine.slice(prefix.length);
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
        if (!savefileListProto || typeof savefileListProto.drawText !== 'function') {
            return false;
        }

        const runtimeSource = this._buildRuntimeSource();
        this._hookSavefileListDrawText(savefileListProto, runtimeSource);
        return true;
    }

    _buildRuntimeSource() {
        if (!this._scanPrepared) {
            this._scanEntries = this._buildSyncScanEntries();
        }

        const exactTexts = new Set();
        for (const entry of this._scanEntries) {
            const text = String(entry?.text || '');
            if (!this.isUsableText(text)) {
                continue;
            }

            exactTexts.add(text);
        }

        return { exactTexts };
    }

    _hookSavefileListDrawText(prototype, runtimeSource) {
        if (prototype.__CHEAT_NORE_AUTO_SAVE_DRAW_TEXT_PATCHED__) {
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
                if (
                    !isRuntimeTranslationActive(runtime) ||
                    !isUsableText(text) ||
                    !runtimeSource.exactTexts.has(text)
                ) {
                    return original.call(this, renderedText, x, y, maxWidth, align);
                }

                renderedText = resolveRuntimeTranslation(text, runtime, 'plugin_nore_auto_save', {
                    requireRuntimeTranslationActive: true,
                    missValue: text,
                });
            } catch (error) {
                console.warn('[NoreAutoSaveTranslator] Failed to translate save list text', error);
            }

            return original.call(this, renderedText, x, y, maxWidth, align);
        };

        Object.defineProperty(prototype, '__CHEAT_NORE_AUTO_SAVE_DRAW_TEXT_PATCHED__', {
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
                id: `plugin_nore_auto_save_${byCacheKey.size}`,
                value: text,
                cacheKey,
            });
        }

        return Array.from(byCacheKey.values());
    }

    _buildSyncScanEntries() {
        const entries = [];
        this._collectPluginParameterEntries(entries);
        this._collectAutoSaveCommandsFromCommonEvents(entries);
        return entries;
    }
}
