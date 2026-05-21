import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../js/translation-runtime/ObjectTranslationModalMethods.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/**
 * NUUN_SaveScreen translator.
 *
 * Supported versions:
 * - MZ v2.1.3
 * - MZ v1.4.1 style: labels are rendered inside drawPlaytime/drawMapName/drawGold/
 *   drawOriginal_1/drawOriginal_2, with source strings defined by plugin parameters.
 * - Legacy style: ContentsList.ParamName + SetAnyName plugin command payloads.
 *
 * Notes:
 * - Runtime hooks translate only visible label payloads and AnyName text.
 * - Dynamic values are not targeted; label hooks intercept only the first drawText call
 *   inside label renderer methods.
 */

const LEGACY_COMMAND_SET_ANY_NAME = 'SetAnyName';
const PARAM_TEXT_FALLBACKS = {
    PlaytimeName: 'プレイ時間',
    LocationName: '現在地',
    MoneyName: '所持金',
};
const PARAM_TEXT_KEYS = [
    'PlaytimeName',
    'LocationName',
    'MoneyName',
    'OriginalName1',
    'OriginalName2',
    'AnyDefaultName',
];

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
        const savefileListProto = window.Window_SavefileList?.prototype;
        if (!savefileListProto) {
            console.log('[NuunSaveScreenTranslator] Window_SavefileList not found');
            return false;
        }

        const requiredMethods = [
            'drawContentsBase',
            'drawAnyName',
            'drawPlaytime',
            'drawMapName',
            'drawGold',
        ];

        if (
            requiredMethods.some(
                (methodName) => typeof savefileListProto[methodName] !== 'function'
            )
        ) {
            console.log(
                '[NuunSaveScreenTranslator] Required methods not found',
                requiredMethods.filter(
                    (methodName) => typeof savefileListProto[methodName] !== 'function'
                )
            );
            return false;
        }

        if (savefileListProto.__CHEAT_NUUN_SAVE_SCREEN_TRANSLATOR_HOOKED__) {
            return true;
        }

        this._hookDrawContentsBase(savefileListProto);
        this._hookDrawAnyName(savefileListProto);
        this._hookFirstDrawTextOfMethod(savefileListProto, 'drawPlaytime');
        this._hookFirstDrawTextOfMethod(savefileListProto, 'drawMapName');
        this._hookFirstDrawTextOfMethod(savefileListProto, 'drawGold');
        this._hookFirstDrawTextOfMethod(savefileListProto, 'drawOriginal_1');
        this._hookFirstDrawTextOfMethod(savefileListProto, 'drawOriginal_2');

        savefileListProto.__CHEAT_NUUN_SAVE_SCREEN_TRANSLATOR_HOOKED__ = true;
        return true;
    }

    _hookDrawContentsBase(savefileListProto) {
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);
        const isTranslatableCandidate = this._isTranslatableCandidate.bind(this);
        const cacheType = this.getCacheType();
        const original = savefileListProto.drawContentsBase;

        savefileListProto.drawContentsBase = function (info, x, y, width, data, savefileId, r) {
            let effectiveData = data;
            try {
                const runtime = getRuntime();
                if (
                    isRuntimeTranslationActive(runtime) &&
                    isTranslatableCandidate(data?.ParamName)
                ) {
                    const translated = resolveRuntimeTranslation(
                        data.ParamName,
                        runtime,
                        cacheType,
                        {
                            requireRuntimeTranslationActive: true,
                        }
                    );
                    if (isTranslatableCandidate(translated)) {
                        effectiveData = { ...data, ParamName: translated };
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

    _hookDrawAnyName(savefileListProto) {
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);
        const isTranslatableCandidate = this._isTranslatableCandidate.bind(this);
        const cacheType = this.getCacheType();
        const original = savefileListProto.drawAnyName;

        savefileListProto.drawAnyName = function (info, x, y, width, data) {
            let effectiveInfo = info;
            try {
                const runtime = getRuntime();
                if (isRuntimeTranslationActive(runtime) && isTranslatableCandidate(info?.AnyName)) {
                    const translated = resolveRuntimeTranslation(info.AnyName, runtime, cacheType, {
                        requireRuntimeTranslationActive: true,
                    });
                    if (isTranslatableCandidate(translated)) {
                        effectiveInfo = { ...info, AnyName: translated };
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

    _hookFirstDrawTextOfMethod(savefileListProto, methodName) {
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);
        const isTranslatableCandidate = this._isTranslatableCandidate.bind(this);
        const cacheType = this.getCacheType();
        const original = savefileListProto[methodName];

        if (typeof original !== 'function') {
            return;
        }

        savefileListProto[methodName] = function (...args) {
            const runtime = getRuntime();
            if (!isRuntimeTranslationActive(runtime)) {
                return original.apply(this, args);
            }

            const originalDrawText = this['drawText'];
            if (typeof originalDrawText !== 'function') {
                return original.apply(this, args);
            }

            let drawTextCallIndex = 0;

            this.drawText = function (text, ...drawArgs) {
                drawTextCallIndex += 1;
                if (drawTextCallIndex === 1 && isTranslatableCandidate(text)) {
                    const translated = resolveRuntimeTranslation(text, runtime, cacheType, {
                        requireRuntimeTranslationActive: true,
                    });

                    return Reflect.apply(originalDrawText, this, [translated, ...drawArgs]);
                }

                return Reflect.apply(originalDrawText, this, [text, ...drawArgs]);
            };

            try {
                return original.apply(this, args);
            } finally {
                this.drawText = originalDrawText;
            }
        };
    }

    _isTranslatableCandidate(value) {
        return this.isUsableText(value);
    }

    async precomputeCounts() {
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

        this.collectLabelsFromPluginParams(entries);
        this.collectParamNamesFromPluginParams(entries);
        this.collectSetAnyNameFromCommonEvents(entries);
        await this.collectSetAnyNameFromMaps(entries);

        return entries;
    }

    collectLabelsFromPluginParams(output) {
        const pluginEntry = this.findPluginEntry(this.getPluginName());
        const params = pluginEntry?.parameters;
        if (!params || typeof params !== 'object') {
            return;
        }

        for (const key of PARAM_TEXT_KEYS) {
            const configuredText = String(params[key] || '').trim();
            const fallbackText = String(PARAM_TEXT_FALLBACKS[key] || '').trim();
            const text = this.isUsableText(configuredText) ? configuredText : fallbackText;
            if (!this._isTranslatableCandidate(text)) {
                continue;
            }

            output.push({
                text,
                source: { scope: 'pluginParam', param: key },
            });
        }
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
        const pluginEntry = this.findPluginEntry(this.getPluginName());

        if (!pluginEntry?.parameters) {
            return;
        }

        const rawContentsList = pluginEntry.parameters['ContentsList'];
        if (typeof rawContentsList !== 'string' || !rawContentsList.trim()) {
            return;
        }

        const parsed = parseJsonSafely(rawContentsList, []);
        if (!Array.isArray(parsed)) {
            return;
        }

        for (const rawEntry of parsed) {
            if (typeof rawEntry !== 'string') {
                continue;
            }

            const entry = parseJsonSafely(rawEntry, null);
            if (!entry || typeof entry !== 'object') {
                continue;
            }

            const paramName =
                entry && typeof entry.ParamName === 'string' ? entry.ParamName.trim() : '';
            if (this._isTranslatableCandidate(paramName)) {
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
            commandName !== LEGACY_COMMAND_SET_ANY_NAME ||
            !this._isTranslatableCandidate(text)
        ) {
            return null;
        }

        return { text };
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!this._isTranslatableCandidate(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
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
