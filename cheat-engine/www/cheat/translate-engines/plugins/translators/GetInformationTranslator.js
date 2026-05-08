import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../panels/translate-on-the-fly/ObjectTranslationModalMethods.js';

const RUNTIME_HOOK_GUARD = '__CHEAT_GET_INFORMATION_TRANSLATOR_HOOKED__';
const CACHE_TYPE = 'plugin_get_information';
const COMMAND_CACHE_TYPE = 'plugin_get_information_command';
const DIRECT_TEMPLATE_TYPE = '__CHEAT_GET_INFORMATION_DIRECT_TEMPLATE__';

const PARAM_TEXT_FIELDS = [
    'Get Gold Text',
    'Lost Gold Text',
    'Get Item Text',
    'Lost Item Text',
    'Get Item Text Num',
    'Lost Item Text Num',
    'Get Skill Text',
    'Lost Skill Text',
    'Exp Up Text',
    'Exp Down Text',
    'Lv Up Text',
    'Lv Down Text',
    'Param Up Text',
    'Param Down Text',
    'Abp Up Text',
    'Abp Down Text',
    'Class Lv Up Text',
    'Class Lv Down Text',
    'Formation Lv Up Text',
    'Formation Lv Max Text',
];

const COMMAND_NAMES = new Set(['ShowInfo', 'インフォ表示']);

const GET_INFORMATION_PLUGIN_TAGS = [
    {
        description: 'GetInformation icon placeholder',
        type: 'withCustomParameter',
        tagSymbol: 'I',
        bracket: '[',
        maskValue: true,
        requiredConsistency: false,
    },
    {
        description: 'GetInformation SE control',
        type: 'withCustomParameter',
        tagSymbol: 'SE',
        bracket: '[',
        maskValue: true,
        requiredConsistency: false,
    },
];

function splitCommandLine(commandLine) {
    const line = String(commandLine || '').trim();
    if (!line) {
        return { command: '', payload: '' };
    }

    const firstSpace = line.indexOf(' ');
    if (firstSpace < 0) {
        return { command: line, payload: '' };
    }

    return {
        command: line.slice(0, firstSpace).trim(),
        payload: line.slice(firstSpace + 1).trim(),
    };
}

export class GetInformationTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'GetInformation';
    }

    getPluginLabel() {
        return 'GetInformation';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    findPluginEntry() {
        if (!Array.isArray(window.$plugins)) {
            return null;
        }

        const pluginName = String(this.getPluginName() || '')
            .trim()
            .toLowerCase();
        if (!pluginName) {
            return null;
        }

        return (
            window.$plugins.find((plugin) => {
                if (!plugin || typeof plugin.name !== 'string') {
                    return false;
                }

                return plugin.name.trim().toLowerCase() === pluginName;
            }) || null
        );
    }

    getRuntimeParameters() {
        const pluginManager = window.PluginManager;
        if (!pluginManager || typeof pluginManager.parameters !== 'function') {
            return null;
        }

        const parameters = pluginManager.parameters(this.getPluginName());
        return parameters && typeof parameters === 'object' ? parameters : null;
    }

    getSourceTextByField() {
        const result = new Map();

        const pluginEntry = this.findPluginEntry();
        if (pluginEntry?.parameters && typeof pluginEntry.parameters === 'object') {
            for (const field of PARAM_TEXT_FIELDS) {
                const value = pluginEntry.parameters[field];
                if (!result.has(field) && this.isUsableText(value)) {
                    result.set(field, value);
                }
            }
        }

        const runtimeParameters = this.getRuntimeParameters();
        if (runtimeParameters) {
            for (const field of PARAM_TEXT_FIELDS) {
                const value = runtimeParameters[field];
                if (!result.has(field) && this.isUsableText(value)) {
                    result.set(field, value);
                }
            }
        }

        return result;
    }

    appendParameterEntries(output) {
        const byField = this.getSourceTextByField();
        for (const field of PARAM_TEXT_FIELDS) {
            const text = byField.get(field);
            if (!this.isUsableText(text)) {
                continue;
            }

            output.push({
                text,
                cacheType: CACHE_TYPE,
                source: {
                    scope: 'pluginParameters',
                    field,
                },
            });
        }
    }

    parseShowInfoCommandLine(commandLine) {
        const parsed = splitCommandLine(commandLine);
        if (!COMMAND_NAMES.has(parsed.command)) {
            return null;
        }

        if (!this.isUsableText(parsed.payload)) {
            return null;
        }

        return {
            command: parsed.command,
            text: parsed.payload,
        };
    }

    collectShowInfoCommandsFromList(list, baseMeta, output) {
        if (!Array.isArray(list) || !Array.isArray(output)) {
            return;
        }

        for (let cmdIdx = 0; cmdIdx < list.length; cmdIdx++) {
            const cmd = list[cmdIdx];
            if (!cmd || Number(cmd.code) !== 356) {
                continue;
            }

            const commandLine =
                Array.isArray(cmd.parameters) && typeof cmd.parameters[0] === 'string'
                    ? cmd.parameters[0]
                    : '';

            const parsed = this.parseShowInfoCommandLine(commandLine);
            if (!parsed) {
                continue;
            }

            output.push({
                text: parsed.text,
                cacheType: COMMAND_CACHE_TYPE,
                source: {
                    ...baseMeta,
                    cmdIdx,
                    command: parsed.command,
                },
            });
        }
    }

    collectMapDataCommandEntries(mapData, mapId, output) {
        if (!mapData || !Array.isArray(mapData.events)) {
            return;
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

                this.collectShowInfoCommandsFromList(
                    page.list,
                    {
                        scope: 'mapEvent',
                        mapId,
                        eventIdx,
                        pageIdx,
                    },
                    output
                );
            }
        }
    }

    async collectMapCommandEntries(output) {
        const mapInfos = Array.isArray(window.$dataMapInfos) ? window.$dataMapInfos : [];
        for (const mapInfo of mapInfos) {
            const mapId = Number(mapInfo?.id);
            if (!mapId) {
                continue;
            }

            try {
                const mapData = await loadMapDataById(mapId);
                this.collectMapDataCommandEntries(mapData, mapId, output);
            } catch (error) {
                console.warn(`[GetInformationTranslator] Failed to scan map ${mapId}`, error);
            }
        }
    }

    collectCommonEventCommandEntries(output) {
        if (!Array.isArray(window.$dataCommonEvents)) {
            return;
        }

        for (let commonEventId = 0; commonEventId < $dataCommonEvents.length; commonEventId++) {
            const commonEvent = $dataCommonEvents[commonEventId];
            if (!commonEvent || !Array.isArray(commonEvent.list)) {
                continue;
            }

            this.collectShowInfoCommandsFromList(
                commonEvent.list,
                {
                    scope: 'commonEvent',
                    commonEventId,
                },
                output
            );
        }
    }

    resolveItemTemplateField(value) {
        if (value > 1) {
            return 'Get Item Text Num';
        }
        if (value === -1) {
            return 'Lost Item Text';
        }
        if (value < -1) {
            return 'Lost Item Text Num';
        }

        return 'Get Item Text';
    }

    resolveSignedTemplateField(positiveField, negativeField, flag) {
        return flag ? positiveField : negativeField;
    }

    resolveTemplateField(type, value, object) {
        const safeType = String(type || '');

        if (safeType === 'gold') {
            return value < 0 ? 'Lost Gold Text' : 'Get Gold Text';
        }

        if (safeType === 'item') {
            return this.resolveItemTemplateField(value);
        }

        if (safeType === 'skill') {
            return value === 1 ? 'Get Skill Text' : 'Lost Skill Text';
        }

        if (safeType === 'formationLevel') {
            return object?.value === 'max' ? 'Formation Lv Max Text' : 'Formation Lv Up Text';
        }

        const signedFieldMap = {
            exp: ['Exp Up Text', 'Exp Down Text'],
            level: ['Lv Up Text', 'Lv Down Text'],
            abp: ['Abp Up Text', 'Abp Down Text'],
            classLevel: ['Class Lv Up Text', 'Class Lv Down Text'],
            param: ['Param Up Text', 'Param Down Text'],
        };

        const pair = signedFieldMap[safeType];
        if (!pair) {
            return null;
        }

        return this.resolveSignedTemplateField(pair[0], pair[1], !!object?.value);
    }

    tryResolveCachedText(sourceText, cacheType, runtime) {
        if (
            !this.isUsableText(sourceText) ||
            !runtime
        ) {
            return { cacheKey: '', translatedText: sourceText };
        }

        const cacheKey = runtime.getCacheKey(sourceText, cacheType);

        runtime.trackCacheKeyUsage(cacheKey);

        if (!runtime.hasUsableCacheValue(cacheKey)) {
            return { cacheKey, translatedText: sourceText };
        }

        const cached = runtime.translationCache.get(cacheKey);
        if (!this.isUsableText(cached)) {
            return { cacheKey, translatedText: sourceText };
        }

        return { cacheKey, translatedText: cached };
    }

    applyActorPlaceholder(text, actor) {
        if (!actor || typeof actor !== 'number') {
            return text;
        }

        const actorObj = window.$gameActors?.actor?.(actor);
        if (actorObj && typeof actorObj.name === 'function') {
            return text.replaceAll('_actor', actorObj.name());
        }

        return text;
    }

    applyObjectPlaceholders(text, object) {
        if (!object || typeof object !== 'object') {
            return text;
        }

        let result = text;

        if (typeof object.name === 'string') {
            result = result.replaceAll('_name', object.name.trim());
        }

        if (typeof object.iconIndex === 'number') {
            result = result.replaceAll('_icon', String(object.iconIndex));
        }

        if (typeof object.description === 'string') {
            const descs = object.description.split(/\n/);
            if (descs[0] && this.isUsableText(descs[0])) {
                result = result.replaceAll('_desc1', descs[0]);
            }
            if (descs[1] && this.isUsableText(descs[1])) {
                result = result.replaceAll('_desc2', descs[1]);
            }
        }

        return result;
    }

    applyPlaceholderSubstitutions(template, object, value, actor, classParam) {
        if (!this.isUsableText(template)) {
            return template;
        }

        let result = template;
        result = this.applyActorPlaceholder(result, actor);

        if (classParam && typeof classParam === 'string') {
            result = result.replaceAll('_class', classParam);
        }

        result = this.applyObjectPlaceholders(result, object);

        if (typeof value === 'number') {
            result = result.replaceAll('_num', String(Math.abs(value)));
        }

        return result;
    }

    resolveShowInfoRuntimeTranslation(args, runtime) {
        if (!Array.isArray(args) || args.length < 2) {
            return null;
        }

        const object = args[0];
        const value = args[1];
        const type = args[2];
        const actor = args[3];
        const classParam = args[4];

        if (value === 0) {
            return null;
        }

        const field = this.resolveTemplateField(type, value, object);
        if (field) {
            const byField = this.getSourceTextByField();
            const sourceTemplate = byField.get(field);
            if (!this.isUsableText(sourceTemplate)) {
                return null;
            }

            const { translatedText } = this.tryResolveCachedText(
                sourceTemplate,
                CACHE_TYPE,
                runtime
            );
            if (translatedText === sourceTemplate) {
                return null;
            }

            const preSubstituted = this.applyPlaceholderSubstitutions(
                translatedText,
                object,
                value,
                actor,
                classParam
            );

            return {
                shouldOverrideTemplate: true,
                template: preSubstituted,
                preSubstituted: true,
            };
        }

        if (typeof value === 'string' && this.isUsableText(value)) {
            const { translatedText } = this.tryResolveCachedText(
                value,
                COMMAND_CACHE_TYPE,
                runtime
            );
            if (translatedText === value) {
                return null;
            }

            return {
                shouldOverrideTemplate: true,
                template: translatedText,
                preSubstituted: false,
            };
        }

        return null;
    }

    enablePluginTranslation() {
        if (window[RUNTIME_HOOK_GUARD]) {
            return;
        }

        this.registerPluginCustomTags(GET_INFORMATION_PLUGIN_TAGS);

        const commonPopupManager = window.CommonPopupManager;
        if (!commonPopupManager || typeof commonPopupManager.showInfo !== 'function') {
            window[RUNTIME_HOOK_GUARD] = true;
            return;
        }

        const originalShowInfo = commonPopupManager.showInfo;
        const isUsableTranslatedTemplate = (text) => this.isUsableText(text);
        const resolveRuntimeTranslation = (...args) =>
            this.resolveShowInfoRuntimeTranslation(args, this.getRuntime());

        commonPopupManager.showInfo = function (object, value, type, actor, c) {
            try {
                const result = resolveRuntimeTranslation(...arguments);
                if (
                    result?.shouldOverrideTemplate &&
                    isUsableTranslatedTemplate(result.template) &&
                    result.preSubstituted
                ) {
                    arguments[1] = result.template;
                    arguments[2] = DIRECT_TEMPLATE_TYPE;
                }
            } catch (error) {
                console.warn(
                    '[GetInformationTranslator] Failed to apply cached runtime translation',
                    error
                );
            }

            return originalShowInfo.apply(this, arguments);
        };

        window[RUNTIME_HOOK_GUARD] = true;
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
                console.warn('[GetInformationTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];
        this.appendParameterEntries(entries);
        this.collectCommonEventCommandEntries(entries);
        await this.collectMapCommandEntries(entries);
        return entries;
    }

    buildUniquePendingItems(panel) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheType = entry.cacheType || this.getCacheType();
            const cacheKey = panel.getCacheKey(text, cacheType);
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: cacheType,
                    id: `plugin_get_information_${byCacheKey.size}`,
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
