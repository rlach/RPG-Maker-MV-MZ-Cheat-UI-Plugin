import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../panels/translate-on-the-fly/ObjectTranslationModalMethods.js';

export class NuunSaveScreenTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'NUUN_SaveScreen';
    }

    getPluginLabel() {
        return 'NUUN SaveScreen';
    }

    getCacheType() {
        return 'plugin_nuun_save_screen';
    }

    enablePluginTranslation() {
        this._hookDrawContentsBase();
        this._hookDrawAnyName();
    }

    _hookDrawContentsBase() {
        if (
            !window.Window_SavefileList ||
            !Window_SavefileList.prototype ||
            typeof Window_SavefileList.prototype.drawContentsBase !== 'function'
        ) {
            return;
        }

        const cacheType = this.getCacheType();
        const original = Window_SavefileList.prototype.drawContentsBase;

        Window_SavefileList.prototype.drawContentsBase = function (
            info,
            x,
            y,
            width,
            data,
            savefileId,
            r
        ) {
            let effectiveData = data;
            try {
                const runtime =
                    window.__ensureTranslationRuntime?.() || window.__TranslationRuntime || null;
                const isActive =
                    runtime &&
                    (!!(runtime.isTranslationEnabled?.() || runtime.enabled) ||
                        !!runtime.translateCacheWhenDisabled);

                if (
                    isActive &&
                    data &&
                    typeof data.ParamName === 'string' &&
                    data.ParamName.trim()
                ) {
                    const cacheKey = runtime.getCacheKey(data.ParamName, cacheType);
                    runtime.trackCacheKeyUsage(cacheKey);
                    if (runtime.hasUsableCacheValue(cacheKey)) {
                        const cached = runtime.translationCache.get(cacheKey);
                        if (typeof cached === 'string' && cached.trim()) {
                            effectiveData = { ...data, ParamName: cached };
                        }
                    }
                }
            } catch (error) {
                console.warn(
                    '[NuunSaveScreenTranslator] Failed to apply cached ParamName translation',
                    error
                );
            }

            return original.call(this, info, x, y, width, effectiveData, savefileId, r);
        };
    }

    _hookDrawAnyName() {
        if (
            !window.Window_SavefileList ||
            !Window_SavefileList.prototype ||
            typeof Window_SavefileList.prototype.drawAnyName !== 'function'
        ) {
            return;
        }

        const cacheType = this.getCacheType();
        const original = Window_SavefileList.prototype.drawAnyName;

        Window_SavefileList.prototype.drawAnyName = function (info, x, y, width, data) {
            let effectiveInfo = info;
            try {
                const runtime =
                    window.__ensureTranslationRuntime?.() || window.__TranslationRuntime || null;
                const isActive =
                    runtime &&
                    (!!(runtime.isTranslationEnabled?.() || runtime.enabled) ||
                        !!runtime.translateCacheWhenDisabled);

                if (
                    isActive &&
                    info &&
                    typeof info.AnyName === 'string' &&
                    info.AnyName.trim()
                ) {
                    const cacheKey = runtime.getCacheKey(info.AnyName, cacheType);
                    runtime.trackCacheKeyUsage(cacheKey);
                    if (runtime.hasUsableCacheValue(cacheKey)) {
                        const cached = runtime.translationCache.get(cacheKey);
                        if (typeof cached === 'string' && cached.trim()) {
                            effectiveInfo = { ...info, AnyName: cached };
                        }
                    }
                }
            } catch (error) {
                console.warn(
                    '[NuunSaveScreenTranslator] Failed to apply cached AnyName translation',
                    error
                );
            }

            return original.call(this, effectiveInfo, x, y, width, data);
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
                console.warn('[NuunSaveScreenTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];

        this.collectParamNamesFromPluginParams(entries);
        this.collectSetAnyNameFromCommonEvents(entries);
        await this.collectSetAnyNameFromMaps(entries);

        return entries;
    }

    collectSetAnyNameFromCommonEvents(output) {
        if (!Array.isArray(window.$dataCommonEvents)) {
            return;
        }

        for (let i = 0; i < $dataCommonEvents.length; i++) {
            const commonEvent = $dataCommonEvents[i];
            if (!commonEvent || !Array.isArray(commonEvent.list)) {
                continue;
            }

            this.collectSetAnyNameFromList(
                commonEvent.list,
                { scope: 'commonEvent', commonEventId: i },
                output
            );
        }
    }

    async collectSetAnyNameFromMaps(output) {
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

                this.collectSetAnyNameFromMapEvents(mapData.events, mapId, output);
            } catch (error) {
                console.warn(
                    `[NuunSaveScreenTranslator] Failed to scan map ${mapId} for SetAnyName commands`,
                    error
                );
            }
        }
    }

    collectSetAnyNameFromMapEvents(events, mapId, output) {
        for (let eventIdx = 0; eventIdx < events.length; eventIdx++) {
            const event = events[eventIdx];
            if (!event || !Array.isArray(event.pages)) {
                continue;
            }

            for (let pageIdx = 0; pageIdx < event.pages.length; pageIdx++) {
                const page = event.pages[pageIdx];
                if (!page || !Array.isArray(page.list)) {
                    continue;
                }

                this.collectSetAnyNameFromList(
                    page.list,
                    { scope: 'mapEvent', mapId, eventIdx, pageIdx },
                    output
                );
            }
        }
    }

    collectParamNamesFromPluginParams(output) {
        if (!Array.isArray(window.$plugins)) {
            return;
        }

        const pluginEntry = window.$plugins.find(
            (p) =>
                p &&
                typeof p.name === 'string' &&
                p.name.trim().toLowerCase() === 'nuun_savescreen'
        );

        if (!pluginEntry?.parameters) {
            return;
        }

        const rawContentsList = pluginEntry.parameters['ContentsList'];
        if (typeof rawContentsList !== 'string' || !rawContentsList.trim()) {
            return;
        }

        let parsed;
        try {
            parsed = JSON.parse(rawContentsList);
        } catch (error) {
            console.warn('[NuunSaveScreenTranslator] Failed to parse ContentsList parameter', error);
            return;
        }

        if (!Array.isArray(parsed)) {
            return;
        }

        for (const rawEntry of parsed) {
            if (typeof rawEntry !== 'string') {
                continue;
            }

            let entry;
            try {
                entry = JSON.parse(rawEntry);
            } catch (parseError) {
                console.warn('[NuunSaveScreenTranslator] Failed to parse ContentsList entry', parseError);
                continue;
            }

            const paramName =
                entry && typeof entry.ParamName === 'string' ? entry.ParamName.trim() : '';
            if (paramName) {
                output.push({
                    text: paramName,
                    source: { scope: 'pluginParam', param: 'ContentsList.ParamName' },
                });
            }
        }
    }

    collectSetAnyNameFromList(list, baseMeta, output) {
        if (!Array.isArray(list) || !Array.isArray(output)) {
            return;
        }

        for (let cmdIdx = 0; cmdIdx < list.length; cmdIdx++) {
            const cmd = list[cmdIdx];
            if (!cmd) {
                continue;
            }

            const entry = this.extractSetAnyNameEntry(cmd);
            if (!entry) {
                continue;
            }

            output.push({
                text: entry.text,
                source: { ...baseMeta, cmdIdx },
            });
        }
    }

    extractSetAnyNameEntry(cmd) {
        if (Number(cmd.code) !== 357) {
            return null;
        }

        const parameters = Array.isArray(cmd.parameters) ? cmd.parameters : [];
        const pluginName = String(parameters[0] || '').trim();
        const commandName = String(parameters[1] || '').trim();
        const args = parameters[3] && typeof parameters[3] === 'object' ? parameters[3] : null;
        const text = args && typeof args.AnyName === 'string' ? args.AnyName.trim() : '';

        if (
            pluginName.toLowerCase() !== 'nuun_savescreen' ||
            commandName !== 'SetAnyName' ||
            !text
        ) {
            return null;
        }

        return { text };
    }

    buildUniquePendingItems(panel) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!text.trim()) {
                continue;
            }

            const cacheKey = panel.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_nuun_save_screen_${byCacheKey.size}`,
                    value: text,
                    cacheKey,
                });
            }
        }

        return Array.from(byCacheKey.values());
    }

    collectUntranslated({ panel }) {
        if (!panel) {
            return [];
        }

        const items = this.buildUniquePendingItems(panel);
        return items.filter((item) => !panel.hasUsableCacheValue(item.cacheKey));
    }

    countPluginAmountSync({ panel }) {
        if (!panel) {
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
