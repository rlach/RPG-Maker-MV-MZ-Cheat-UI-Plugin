// @ts-nocheck
import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../js/translation-runtime/ObjectTranslationModalMethods.js';

const CACHE_TYPE = 'plugin_category_synthesis';
const COMMAND_CACHE_TYPE = 'command';

const CALL_COMMAND_NAMES = new Set(['カテゴリ合成呼び出し', 'CallCategorySynthesis']);
const SHOP_COMMAND_NAMES = new Set(['合成ショップ設定', 'SettingSynthesisShop']);

const COMMAND_ARG_NAME_KEYS = new Set(['名前', 'name']);
const COMMAND_ARG_CATEGORY_KEYS = new Set(['カテゴリ', 'categories']);
const ANY_WINDOW = /** @type {any} */ (typeof globalThis !== 'undefined' ? globalThis : {});

const CATEGORY_TOKEN_SPLIT = ',';
const ESCAPE_CHAR = String.fromCharCode(27);
const ESCAPE_PREFIX_PATTERN = `(?:\\\\|${ESCAPE_CHAR}|\\\\u001b)`;
const ESCAPE_ICON_REGEX = new RegExp(`${ESCAPE_PREFIX_PATTERN}I\\[(\\d+)\\]`, 'gi');
const ESCAPE_COLOR_REGEX = new RegExp(`${ESCAPE_PREFIX_PATTERN}C\\[(\\d+)\\]`, 'gi');
const DEBUG_LOG_LIMIT = 600;
let DEBUG_LOG_COUNT = 0;
let DEBUG_LOG_LIMIT_NOTIFIED = false;

const PARAM_FIELD_CONFIGS = Object.freeze([
    { field: 'DefaultSynthesisName', cacheType: CACHE_TYPE },
    {
        field: 'DefaultSynthesisCategories',
        cacheType: COMMAND_CACHE_TYPE,
        splitByComma: true,
        role: 'category',
    },
    { field: 'NeedMachineryName', cacheType: CACHE_TYPE },
    { field: 'NeedMaterialName', cacheType: CACHE_TYPE },
    { field: 'MaterialListText', cacheType: CACHE_TYPE },
    { field: 'SynthesisText', cacheType: CACHE_TYPE },
    { field: 'NumberSynthesisText', cacheType: CACHE_TYPE, supportsNumTemplate: true },
    { field: 'SynthesisHelp', cacheType: CACHE_TYPE },
    { field: 'EstimateText', cacheType: CACHE_TYPE },
    { field: 'SynthesisPriceText', cacheType: CACHE_TYPE },
    { field: 'SynthesisResultText', cacheType: CACHE_TYPE },
    { field: 'MenuSynthesisCommandName', cacheType: COMMAND_CACHE_TYPE },
]);

const CATEGORY_SYNTHESIS_PLUGIN_TAGS = Object.freeze([
    {
        description: 'CategorySynthesis synthetic materials (ja)',
        style: 'xml',
        type: 'withCustomParameter',
        tagSymbol: '合成材料',
        bracket: 'none',
        maskValue: true,
        requiredConsistency: true,
    },
    {
        description: 'CategorySynthesis synthetic materials (en)',
        style: 'xml',
        type: 'withCustomParameter',
        tagSymbol: 'SyntheticMaterials',
        bracket: 'none',
        maskValue: true,
        requiredConsistency: true,
    },
    {
        description: 'CategorySynthesis machinery (ja)',
        style: 'xml',
        type: 'withCustomParameter',
        tagSymbol: '必要器材',
        bracket: 'none',
        maskValue: true,
        requiredConsistency: true,
    },
    {
        description: 'CategorySynthesis machinery (en)',
        style: 'xml',
        type: 'withCustomParameter',
        tagSymbol: 'Machinery',
        bracket: 'none',
        maskValue: true,
        requiredConsistency: true,
    },
    {
        description: 'CategorySynthesis synthetic number (ja)',
        style: 'xml',
        type: 'withCustomParameter',
        tagSymbol: '合成数',
        bracket: 'none',
        maskValue: true,
        requiredConsistency: true,
    },
    {
        description: 'CategorySynthesis synthetic number (en)',
        style: 'xml',
        type: 'withCustomParameter',
        tagSymbol: 'SyntheticNumber',
        bracket: 'none',
        maskValue: true,
        requiredConsistency: true,
    },
    {
        description: 'CategorySynthesis synthetic price (ja)',
        style: 'xml',
        type: 'withCustomParameter',
        tagSymbol: '合成料',
        bracket: 'none',
        maskValue: true,
        requiredConsistency: true,
    },
    {
        description: 'CategorySynthesis synthetic price (en)',
        style: 'xml',
        type: 'withCustomParameter',
        tagSymbol: 'SyntheticPrice',
        bracket: 'none',
        maskValue: true,
        requiredConsistency: true,
    },
    {
        description: 'CategorySynthesis dummy recipe (ja)',
        style: 'xml',
        type: 'withCustomParameter',
        tagSymbol: 'ダミーレシピ',
        bracket: 'none',
        maskValue: true,
        requiredConsistency: true,
    },
    {
        description: 'CategorySynthesis dummy recipe (en)',
        style: 'xml',
        type: 'withCustomParameter',
        tagSymbol: 'DummyRecipe',
        bracket: 'none',
        maskValue: true,
        requiredConsistency: true,
    },
    {
        description: 'CategorySynthesis synthetic priority (ja)',
        style: 'xml',
        type: 'withCustomParameter',
        tagSymbol: '合成優先度',
        bracket: 'none',
        maskValue: true,
        requiredConsistency: true,
    },
    {
        description: 'CategorySynthesis synthetic priority (en)',
        style: 'xml',
        type: 'withCustomParameter',
        tagSymbol: 'SyntheticPriority',
        bracket: 'none',
        maskValue: true,
        requiredConsistency: true,
    },
    {
        description: 'CategorySynthesis published recipe (ja)',
        style: 'xml',
        type: 'withCustomParameter',
        tagSymbol: '掲載レシピ',
        bracket: 'none',
        maskValue: true,
        requiredConsistency: true,
    },
    {
        description: 'CategorySynthesis published recipe (en)',
        style: 'xml',
        type: 'withCustomParameter',
        tagSymbol: 'PublishedRecipe',
        bracket: 'none',
        maskValue: true,
        requiredConsistency: true,
    },
]);

function normalizePluginName(value) {
    return String(value || '')
        .trim()
        .toLowerCase();
}

function isCategorySynthesisSceneActive() {
    const scene = ANY_WINDOW.SceneManager?._scene;
    if (!scene || typeof scene !== 'object') {
        return false;
    }

    const ctorName =
        scene.constructor && typeof scene.constructor.name === 'string'
            ? scene.constructor.name
            : '';

    if (ctorName === 'Scene_CategorySynthesis') {
        return true;
    }

    return !!(scene._recipeWindow && scene._categoryWindow && scene._synthesisWindow);
}

function isDebugEnabled() {
    return false;
}

function debugLog(message, payload) {
    if (!isDebugEnabled()) {
        return;
    }

    if (DEBUG_LOG_COUNT >= DEBUG_LOG_LIMIT) {
        if (!DEBUG_LOG_LIMIT_NOTIFIED) {
            DEBUG_LOG_LIMIT_NOTIFIED = true;
            console.warn(
                `[CategorySynthesisTranslator][debug] log limit reached (${DEBUG_LOG_LIMIT}). Set window.${DEBUG_FLAG_NAME}=false to disable logs.`
            );
        }
        return;
    }

    DEBUG_LOG_COUNT += 1;
    if (payload !== undefined) {
        console.warn(`[CategorySynthesisTranslator][debug] ${message}`, payload);
        return;
    }

    console.warn(`[CategorySynthesisTranslator][debug] ${message}`);
}

function getCurrentSynthesisCategoryState() {
    const scene = ANY_WINDOW.SceneManager?._scene;
    if (!scene || typeof scene !== 'object') {
        return {
            sceneCtorName: '',
            selectedCategory: '',
        };
    }

    const sceneCtorName =
        scene.constructor && typeof scene.constructor.name === 'string'
            ? scene.constructor.name
            : '';

    let selectedCategory = '';
    if (typeof scene?._recipeWindow?._category === 'string' && scene._recipeWindow._category.trim() !== '') {
        selectedCategory = String(scene._recipeWindow._category);
    } else if (typeof scene?._categoryWindow?.category === 'function') {
        const value = scene._categoryWindow.category();
        if (typeof value === 'string' && value.trim() !== '') {
            selectedCategory = String(value);
        }
    }

    return {
        sceneCtorName,
        selectedCategory,
    };
}

function getItemDebugMeta(item) {
    if (!item || typeof item !== 'object') {
        return { id: 0, name: '', kind: 'unknown' };
    }

    let kind = 'unknown';
    if (typeof DataManager !== 'undefined') {
        if (typeof DataManager.isItem === 'function' && DataManager.isItem(item)) {
            kind = 'item';
        } else if (typeof DataManager.isWeapon === 'function' && DataManager.isWeapon(item)) {
            kind = 'weapon';
        } else if (typeof DataManager.isArmor === 'function' && DataManager.isArmor(item)) {
            kind = 'armor';
        }
    }

    return {
        id: Number(item.id) || 0,
        name: String(item.name || ''),
        kind,
    };
}

function normalizeCategoryToken(value) {
    const source = String(value || '');
    if (!source) {
        return '';
    }

    const withoutIcons = source.replace(ESCAPE_ICON_REGEX, '');
    const withoutColors = withoutIcons.replace(ESCAPE_COLOR_REGEX, '');
    const withoutEscapeLeftovers = withoutColors.split(ESCAPE_CHAR).join('');
    const squashedSpaces = withoutEscapeLeftovers.replace(/\s+/g, ' ').trim();
    return squashedSpaces.toLowerCase();
}

function extractIconIndex(value) {
    if (!(typeof value === 'string' && value.trim() !== '')) {
        return 0;
    }

    ESCAPE_ICON_REGEX.lastIndex = 0;
    const match = ESCAPE_ICON_REGEX.exec(String(value));
    if (!match || !match[1]) {
        return 0;
    }

    return Number(match[1]) || 0;
}

function toCanonicalBuiltinCategoryKey(value) {
    const normalized = normalizeCategoryToken(value);
    if (!normalized) {
        return '';
    }

    const iconIndex = extractIconIndex(value);
    if (iconIndex === 48) {
        return '__builtin_item';
    }
    if (iconIndex === 50) {
        return '__builtin_weapon';
    }
    if (iconIndex === 62) {
        return '__builtin_armor';
    }

    if (normalized === 'アイテム' || normalized === 'item' || normalized === 'items') {
        return '__builtin_item';
    }
    if (normalized === '武器' || normalized === 'weapon' || normalized === 'weapons') {
        return '__builtin_weapon';
    }
    if (normalized === '防具' || normalized === 'armor' || normalized === 'armors') {
        return '__builtin_armor';
    }
    if (
        normalized === '大事なもの' ||
        normalized === 'key item' ||
        normalized === 'key items' ||
        normalized === 'important item' ||
        normalized === 'important items'
    ) {
        return '__builtin_key_item';
    }

    return '';
}

function toCanonicalCustomCategoryKey(value) {
    const normalized = normalizeCategoryToken(value);
    if (!normalized) {
        return '';
    }

    // Keep this focused: CategorySynthesis projects often use 料理/Cooking/Food interchangeably.
    if (
        normalized === '料理' ||
        normalized === 'cooking' ||
        normalized === 'food' ||
        normalized === 'foods'
    ) {
        return '__custom_cooking';
    }

    return '';
}

function toCanonicalCategoryKey(value) {
    return toCanonicalBuiltinCategoryKey(value) || toCanonicalCustomCategoryKey(value);
}

function splitCsvValues(value) {
    if (!(typeof value === 'string' && value.trim() !== '')) {
        return [];
    }

    return String(value)
        .split(CATEGORY_TOKEN_SPLIT)
        .map((entry) => String(entry || '').trim())
        .filter((entry) => entry.length > 0);
}

function parseCommandPayloadSegments(payload) {
    const segments = [];
    const source = String(payload || '').trim();
    if (!source) {
        return segments;
    }

    const regex = /(?:^|\s)([^:\s]+)\s*:\s*(.*?)(?=\s+[^:\s]+\s*:|$)/g;
    let match = regex.exec(source);
    while (match) {
        const key = String(match[1] || '').trim();
        const value = String(match[2] || '').trim();
        if (key && value) {
            segments.push({ key, value });
        }
        match = regex.exec(source);
    }

    return segments;
}

function parsePluginCommandLine(commandLine) {
    const line = String(commandLine || '').trim();
    if (!line) {
        return null;
    }

    const parts = line.split(/\s+/);
    const command = String(parts.shift() || '').trim();
    if (!command) {
        return null;
    }

    if (!CALL_COMMAND_NAMES.has(command) && !SHOP_COMMAND_NAMES.has(command)) {
        return null;
    }

    const payload = parts.join(' ').trim();
    const segments = parseCommandPayloadSegments(payload);

    return {
        command,
        payload,
        segments,
    };
}

export class CategorySynthesisTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
        this._sourceTextByField = null;
        this._sourceTextByFieldResolved = false;
        this._parameterFieldConfigsByField = new Map();

        for (const config of PARAM_FIELD_CONFIGS) {
            this._parameterFieldConfigsByField.set(config.field, config);
        }
    }

    getPluginName() {
        return 'CategorySynthesis';
    }

    getPluginLabel() {
        return 'CategorySynthesis';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    findPluginEntry() {
        if (!Array.isArray(ANY_WINDOW.$plugins)) {
            return null;
        }

        const pluginName = normalizePluginName(this.getPluginName());
        if (!pluginName) {
            return null;
        }

        return (
            ANY_WINDOW.$plugins.find((plugin) => {
                if (!plugin || typeof plugin.name !== 'string') {
                    return false;
                }

                return normalizePluginName(plugin.name) === pluginName;
            }) || null
        );
    }

    getRuntimeParameters() {
        const pluginManager = ANY_WINDOW.PluginManager;
        if (!pluginManager || typeof pluginManager.parameters !== 'function') {
            return null;
        }

        const parameters = pluginManager.parameters(this.getPluginName());
        return parameters && typeof parameters === 'object' ? parameters : null;
    }

    getSourceTextByField() {
        if (this._sourceTextByFieldResolved) {
            return this._sourceTextByField || new Map();
        }

        const map = new Map();

        const pluginEntry = this.findPluginEntry();
        if (pluginEntry?.parameters && typeof pluginEntry.parameters === 'object') {
            for (const fieldConfig of PARAM_FIELD_CONFIGS) {
                const raw = pluginEntry.parameters[fieldConfig.field];
                if (this.isUsableText(raw) && !map.has(fieldConfig.field)) {
                    map.set(fieldConfig.field, raw);
                }
            }
        }

        const runtimeParameters = this.getRuntimeParameters();
        if (runtimeParameters && typeof runtimeParameters === 'object') {
            for (const fieldConfig of PARAM_FIELD_CONFIGS) {
                const raw = runtimeParameters[fieldConfig.field];
                if (this.isUsableText(raw) && !map.has(fieldConfig.field)) {
                    map.set(fieldConfig.field, raw);
                }
            }
        }

        this._sourceTextByField = map;
        this._sourceTextByFieldResolved = true;
        return map;
    }

    appendParameterEntries(output) {
        const sourceTextByField = this.getSourceTextByField();

        for (const fieldConfig of PARAM_FIELD_CONFIGS) {
            const raw = sourceTextByField.get(fieldConfig.field);
            if (!this.isUsableText(raw)) {
                continue;
            }

            if (fieldConfig.splitByComma) {
                const values = splitCsvValues(raw);
                for (let i = 0; i < values.length; i++) {
                    const value = values[i];
                    if (!this.isUsableText(value)) {
                        continue;
                    }

                    output.push({
                        text: value,
                        cacheType: fieldConfig.cacheType,
                        role: fieldConfig.role || 'parameter',
                        source: {
                            scope: 'pluginParameter',
                            field: fieldConfig.field,
                            index: i,
                        },
                    });
                }
                continue;
            }

            output.push({
                text: raw,
                cacheType: fieldConfig.cacheType,
                role: fieldConfig.role || 'parameter',
                supportsNumTemplate: !!fieldConfig.supportsNumTemplate,
                source: {
                    scope: 'pluginParameter',
                    field: fieldConfig.field,
                },
            });
        }
    }

    collectPluginCommandsFromList(list, baseMeta, output) {
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

            const parsed = parsePluginCommandLine(commandLine);
            if (!parsed || !Array.isArray(parsed.segments) || parsed.segments.length === 0) {
                continue;
            }

            for (const segment of parsed.segments) {
                const key = String(segment.key || '').trim();
                const value = String(segment.value || '').trim();

                if (!key || !this.isUsableText(value)) {
                    continue;
                }

                if (COMMAND_ARG_NAME_KEYS.has(key)) {
                    output.push({
                        text: value,
                        cacheType: COMMAND_CACHE_TYPE,
                        role: 'commandName',
                        source: {
                            ...baseMeta,
                            cmdIdx,
                            command: parsed.command,
                            argument: key,
                        },
                    });
                    continue;
                }

                if (COMMAND_ARG_CATEGORY_KEYS.has(key)) {
                    const categories = splitCsvValues(value);
                    for (let i = 0; i < categories.length; i++) {
                        output.push({
                            text: categories[i],
                            cacheType: COMMAND_CACHE_TYPE,
                            role: 'category',
                            source: {
                                ...baseMeta,
                                cmdIdx,
                                command: parsed.command,
                                argument: key,
                                index: i,
                            },
                        });
                    }
                }
            }
        }
    }

    collectCommonEventEntries(output) {
        const commonEvents = Array.isArray(ANY_WINDOW.$dataCommonEvents)
            ? ANY_WINDOW.$dataCommonEvents
            : [];
        if (!commonEvents.length) {
            return;
        }

        for (let commonEventId = 0; commonEventId < commonEvents.length; commonEventId++) {
            const commonEvent = commonEvents[commonEventId];
            if (!commonEvent || !Array.isArray(commonEvent.list)) {
                continue;
            }

            this.collectPluginCommandsFromList(
                commonEvent.list,
                {
                    scope: 'commonEvent',
                    commonEventId,
                },
                output
            );
        }
    }

    async collectMapEntries(output) {
        const mapInfos = Array.isArray(ANY_WINDOW.$dataMapInfos) ? ANY_WINDOW.$dataMapInfos : [];

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

                        this.collectPluginCommandsFromList(
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
            } catch (error) {
                console.warn(`[CategorySynthesisTranslator] Failed to scan map ${mapId}`, error);
            }
        }
    }

    resolveCacheTypeByField(field) {
        const config = this._parameterFieldConfigsByField.get(String(field || '').trim());
        return config?.cacheType || this.getCacheType();
    }

    resolveCachedText(runtime, text, cacheType) {
        if (!this.isUsableText(text)) {
            return text;
        }

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
        return this.isUsableText(cached) ? cached : text;
    }

    resolveTextWithNumTemplate(runtime, value, sourceTemplate, cacheType) {
        if (!this.isUsableText(value) || !this.isUsableText(sourceTemplate)) {
            return value;
        }

        if (!sourceTemplate.includes('_num')) {
            return value;
        }

        const escaped = sourceTemplate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const sourcePattern = new RegExp(`^${escaped.replace('_num', '(.+?)')}$`);
        const match = sourcePattern.exec(value);
        if (!match) {
            return value;
        }

        const translatedTemplate = this.resolveCachedText(runtime, sourceTemplate, cacheType);
        if (!this.isUsableText(translatedTemplate) || translatedTemplate === sourceTemplate) {
            return value;
        }

        const numValue = String(match[1] || '');
        if (!translatedTemplate.includes('_num')) {
            return translatedTemplate;
        }

        return translatedTemplate.replaceAll('_num', numValue);
    }

    translateKnownPluginText(runtime, text) {
        if (!this.isUsableText(text)) {
            return text;
        }

        const sourceTextByField = this.getSourceTextByField();

        for (const fieldConfig of PARAM_FIELD_CONFIGS) {
            const sourceValue = sourceTextByField.get(fieldConfig.field);
            if (!this.isUsableText(sourceValue)) {
                continue;
            }

            const cacheType = this.resolveCacheTypeByField(fieldConfig.field);

            if (fieldConfig.splitByComma) {
                const tokens = splitCsvValues(sourceValue);
                for (const token of tokens) {
                    if (token !== text) {
                        continue;
                    }

                    const translated = this.resolveCachedText(runtime, token, cacheType);
                    if (translated !== token) {
                        return translated;
                    }
                }
                continue;
            }

            if (sourceValue === text) {
                const translated = this.resolveCachedText(runtime, sourceValue, cacheType);
                if (translated !== sourceValue) {
                    return translated;
                }
            }

            if (fieldConfig.supportsNumTemplate) {
                const translatedTemplate = this.resolveTextWithNumTemplate(
                    runtime,
                    text,
                    sourceValue,
                    cacheType
                );
                if (translatedTemplate !== text) {
                    return translatedTemplate;
                }
            }
        }

        return text;
    }

    translateCategoryCandidatesForMatch(runtime, categories) {
        const translated = new Set();
        if (!Array.isArray(categories)) {
            return translated;
        }

        for (const category of categories) {
            const source = String(category || '');
            if (!source) {
                continue;
            }

            translated.add(source);

            const translatedCategory = this.resolveCachedText(runtime, source, COMMAND_CACHE_TYPE);
            if (this.isUsableText(translatedCategory)) {
                translated.add(translatedCategory);
            }
        }

        return translated;
    }

    getKnownCategoryTokens() {
        const tokens = new Set();

        for (const entry of this._scanEntries) {
            if (!entry || entry.role !== 'category' || !this.isUsableText(entry.text)) {
                continue;
            }

            tokens.add(String(entry.text));
        }

        const sourceTextByField = this.getSourceTextByField();
        const defaultCategories = sourceTextByField.get('DefaultSynthesisCategories');
        for (const token of splitCsvValues(defaultCategories)) {
            tokens.add(token);
        }

        return Array.from(tokens);
    }

    buildCategoryAliasLookup(runtime) {
        const lookup = new Map();
        const knownTokens = this.getKnownCategoryTokens();

        for (const token of knownTokens) {
            if (!this.isUsableText(token)) {
                continue;
            }

            const normalizedSource = normalizeCategoryToken(token);
            if (!normalizedSource) {
                continue;
            }

            if (!lookup.has(normalizedSource)) {
                lookup.set(normalizedSource, new Set());
            }

            const aliases = lookup.get(normalizedSource);
            aliases.add(normalizedSource);

            const translatedToken = this.resolveCachedText(runtime, token, COMMAND_CACHE_TYPE);
            const normalizedTranslated = normalizeCategoryToken(translatedToken);
            if (normalizedTranslated) {
                aliases.add(normalizedTranslated);
            }
        }

        return lookup;
    }

    buildCategoryDisplayLookup(runtime) {
        const byNormalized = new Map();
        const byCanonical = new Map();
        const knownTokens = this.getKnownCategoryTokens();

        for (const token of knownTokens) {
            if (!this.isUsableText(token)) {
                continue;
            }

            const normalizedSource = normalizeCategoryToken(token);
            if (!normalizedSource) {
                continue;
            }

            if (!byNormalized.has(normalizedSource)) {
                byNormalized.set(normalizedSource, new Set());
            }

            const displays = byNormalized.get(normalizedSource);
            displays.add(String(token));

            const translated = this.resolveCachedText(runtime, token, COMMAND_CACHE_TYPE);
            if (this.isUsableText(translated)) {
                displays.add(String(translated));
            }

            const canonical = toCanonicalCategoryKey(token);
            if (canonical) {
                if (!byCanonical.has(canonical)) {
                    byCanonical.set(canonical, new Set());
                }

                const canonicalDisplays = byCanonical.get(canonical);
                canonicalDisplays.add(String(token));
                if (this.isUsableText(translated)) {
                    canonicalDisplays.add(String(translated));
                }
            }
        }

        return { byNormalized, byCanonical };
    }

    patchDataManagerSecondaryCategoriesRuntime() {
        if (
            typeof DataManager === 'undefined' ||
            typeof DataManager.itemSecondaryCategories !== 'function'
        ) {
            return;
        }

        if (DataManager.__CHEAT_CATEGORY_SYNTHESIS_SECONDARY_CATEGORY_PATCHED__) {
            return;
        }

        const translator = this;
        const originalItemSecondaryCategories = DataManager.itemSecondaryCategories;

        debugLog('installing DataManager.itemSecondaryCategories patch');

        DataManager.itemSecondaryCategories = function (item) {
            const categories = originalItemSecondaryCategories.apply(this, arguments);
            if (!Array.isArray(categories) || categories.length === 0) {
                return categories;
            }

            const runtime = translator.getRuntime();
            if (
                !translator.isRuntimeTranslationActive(runtime) ||
                !isCategorySynthesisSceneActive()
            ) {
                return categories;
            }

            const sceneState = getCurrentSynthesisCategoryState();
            const selectedCategory = sceneState.selectedCategory;
            const normalizedSelected = normalizeCategoryToken(selectedCategory);

            const displayLookup = translator.buildCategoryDisplayLookup(runtime);
            const merged = [];
            const seen = new Set();

            const pushUnique = (value) => {
                if (!translator.isUsableText(value)) {
                    return;
                }

                const key = String(value);
                if (seen.has(key)) {
                    return;
                }

                seen.add(key);
                merged.push(key);
            };

            for (const category of categories) {
                pushUnique(category);

                const canonical = toCanonicalCategoryKey(category);
                // Keep non-builtin categories untouched (e.g. Cooking) to preserve
                // original plugin behavior that already worked without this translator.
                if (!canonical || canonical.startsWith('__custom_')) {
                    const directTranslatedCustom = translator.resolveCachedText(
                        runtime,
                        category,
                        COMMAND_CACHE_TYPE
                    );
                    pushUnique(directTranslatedCustom);

                    if (canonical && canonical.startsWith('__custom_')) {
                        const displaysByCustomCanonical = displayLookup.byCanonical.get(canonical);
                        if (displaysByCustomCanonical) {
                            for (const displayValue of displaysByCustomCanonical) {
                                pushUnique(displayValue);
                            }
                        }
                    }

                    if (!canonical || canonical.startsWith('__custom_')) {
                        continue;
                    }
                }

                // Built-in path
                if (!canonical) {
                    continue;
                }

                const directTranslated = translator.resolveCachedText(
                    runtime,
                    category,
                    COMMAND_CACHE_TYPE
                );
                pushUnique(directTranslated);

                const normalized = normalizeCategoryToken(category);
                if (!normalized) {
                    continue;
                }

                const displaysByNormalized = displayLookup.byNormalized.get(normalized);
                if (displaysByNormalized) {
                    for (const displayValue of displaysByNormalized) {
                        pushUnique(displayValue);
                    }
                }

                const displaysByCanonical = displayLookup.byCanonical.get(canonical);
                if (displaysByCanonical) {
                    for (const displayValue of displaysByCanonical) {
                        pushUnique(displayValue);
                    }
                }
            }

            const normalizedOriginal = categories.map((entry) => normalizeCategoryToken(entry));
            const normalizedMerged = merged.map((entry) => normalizeCategoryToken(entry));
            const canonicalOriginal = categories.map((entry) =>
                toCanonicalBuiltinCategoryKey(entry)
            );
            const canonicalMerged = merged.map((entry) => toCanonicalBuiltinCategoryKey(entry));
            const canonicalSelected = toCanonicalBuiltinCategoryKey(selectedCategory);
            const canonicalAnyOriginal = categories.map((entry) => toCanonicalCategoryKey(entry));
            const canonicalAnyMerged = merged.map((entry) => toCanonicalCategoryKey(entry));
            const canonicalAnySelected = toCanonicalCategoryKey(selectedCategory);
            const selectedHitsOriginal =
                !!normalizedSelected && normalizedOriginal.includes(normalizedSelected);
            const selectedHitsMerged =
                !!normalizedSelected && normalizedMerged.includes(normalizedSelected);
            const selectedCanonicalHitOriginal =
                !!canonicalSelected && canonicalOriginal.includes(canonicalSelected);
            const selectedCanonicalHitMerged =
                !!canonicalSelected && canonicalMerged.includes(canonicalSelected);
            const selectedCanonicalAnyHitOriginal =
                !!canonicalAnySelected && canonicalAnyOriginal.includes(canonicalAnySelected);
            const selectedCanonicalAnyHitMerged =
                !!canonicalAnySelected && canonicalAnyMerged.includes(canonicalAnySelected);

            debugLog('itemSecondaryCategories resolved', {
                scene: sceneState.sceneCtorName,
                selectedCategory,
                normalizedSelected,
                canonicalSelected,
                selectedHitsOriginal,
                selectedHitsMerged,
                selectedCanonicalHitOriginal,
                selectedCanonicalHitMerged,
                canonicalAnySelected,
                selectedCanonicalAnyHitOriginal,
                selectedCanonicalAnyHitMerged,
                item: getItemDebugMeta(item),
                categories,
                normalizedOriginal,
                canonicalOriginal,
                canonicalAnyOriginal,
                merged,
                normalizedMerged,
                canonicalMerged,
                canonicalAnyMerged,
            });

            debugLog(
                `itemSecondaryCategories compact ${JSON.stringify({
                    scene: sceneState.sceneCtorName,
                    selectedCategory,
                    normalizedSelected,
                    canonicalSelected,
                    selectedHitsOriginal,
                    selectedHitsMerged,
                    selectedCanonicalHitOriginal,
                    selectedCanonicalHitMerged,
                    canonicalAnySelected,
                    selectedCanonicalAnyHitOriginal,
                    selectedCanonicalAnyHitMerged,
                    item: getItemDebugMeta(item),
                    categories,
                    merged,
                })}`
            );

            return merged;
        };

        DataManager.__CHEAT_CATEGORY_SYNTHESIS_SECONDARY_CATEGORY_PATCHED__ = true;
    }

    hasCategoryMatch(runtime, item, category) {
        if (!this.isUsableText(category) || !item || typeof DataManager === 'undefined') {
            return false;
        }

        if (typeof DataManager.itemSecondaryCategories !== 'function') {
            return false;
        }

        const rawCategories = DataManager.itemSecondaryCategories(item);
        if (!Array.isArray(rawCategories) || rawCategories.length === 0) {
            return false;
        }

        const normalizedTarget = normalizeCategoryToken(category);
        if (!normalizedTarget) {
            return false;
        }
        const canonicalTarget = toCanonicalBuiltinCategoryKey(category);
        const canonicalAnyTarget = toCanonicalCategoryKey(category);

        const categoryAliasLookup = this.buildCategoryAliasLookup(runtime);

        for (const rawCategory of rawCategories) {
            const normalizedRaw = normalizeCategoryToken(rawCategory);
            if (normalizedRaw === normalizedTarget) {
                return true;
            }

            const canonicalRaw = toCanonicalBuiltinCategoryKey(rawCategory);
            if (canonicalTarget && canonicalRaw && canonicalTarget === canonicalRaw) {
                return true;
            }

            const canonicalAnyRaw = toCanonicalCategoryKey(rawCategory);
            if (canonicalAnyTarget && canonicalAnyRaw && canonicalAnyTarget === canonicalAnyRaw) {
                return true;
            }

            const aliases = categoryAliasLookup.get(normalizedRaw);
            if (aliases && aliases.has(normalizedTarget)) {
                return true;
            }

            if (aliases && canonicalTarget) {
                for (const aliasNormalized of aliases) {
                    const aliasCanonical = toCanonicalBuiltinCategoryKey(aliasNormalized);
                    if (aliasCanonical && aliasCanonical === canonicalTarget) {
                        return true;
                    }

                    const aliasCanonicalAny = toCanonicalCategoryKey(aliasNormalized);
                    if (
                        canonicalAnyTarget &&
                        aliasCanonicalAny &&
                        aliasCanonicalAny === canonicalAnyTarget
                    ) {
                        return true;
                    }
                }
            }
        }

        const translatedCandidates = this.translateCategoryCandidatesForMatch(
            runtime,
            rawCategories
        );
        for (const translatedCategory of translatedCandidates) {
            if (normalizeCategoryToken(translatedCategory) === normalizedTarget) {
                return true;
            }
        }

        return false;
    }

    patchSynthesisCategoryMatchingRuntime() {
        const RecipeWindow = ANY_WINDOW.Window_Recipe;
        const SynthesisStatusWindow = ANY_WINDOW.Window_SynthesisStatus;
        const MaterialWindow = ANY_WINDOW.Window_Material;
        const EstimateWindow = ANY_WINDOW.Window_Estimate;

        if (
            !RecipeWindow ||
            !RecipeWindow.prototype ||
            !SynthesisStatusWindow ||
            !SynthesisStatusWindow.prototype ||
            !MaterialWindow ||
            !MaterialWindow.prototype ||
            !EstimateWindow ||
            !EstimateWindow.prototype
        ) {
            return;
        }

        const translator = this;

        const originalRecipeIncludes = RecipeWindow.prototype.includes;
        RecipeWindow.prototype.includes = function (item) {
            if (!translator.isRuntimeTranslationActive(translator.getRuntime())) {
                return originalRecipeIncludes.apply(this, arguments);
            }

            const category = this._category;
            if (
                category === '_item' ||
                category === '_weapon' ||
                category === '_armor' ||
                category === '_keyItem'
            ) {
                return originalRecipeIncludes.apply(this, arguments);
            }

            const runtime = translator.getRuntime();
            return translator.hasCategoryMatch(runtime, item, category);
        };

        const originalRecipeCheckEnable = RecipeWindow.prototype.checkEnableRecipe;
        RecipeWindow.prototype.checkEnableRecipe = function (recipe) {
            if (!translator.isRuntimeTranslationActive(translator.getRuntime())) {
                return originalRecipeCheckEnable.apply(this, arguments);
            }

            if (!recipe || !Array.isArray(recipe.recipe)) {
                return originalRecipeCheckEnable.apply(this, arguments);
            }

            let ary = recipe.recipe;
            if (!ANY_WINDOW.$gameTemp || !ANY_WINDOW.$gameTemp._callShopSynthesis) {
                ary = ary.concat(recipe.machinery || []);
            }

            const runtime = translator.getRuntime();

            for (let i = 0, max = ary.length; i < max; i++) {
                const m = ary[i];
                if (!Array.isArray(m) || m.length < 2) {
                    continue;
                }

                if (
                    typeof DataManager.isSynthesisItem === 'function' &&
                    DataManager.isSynthesisItem(m[0])
                ) {
                    const decoded = DataManager.decodeSynthesisItem(m[0]);
                    if ($gameParty.numItems(decoded) < m[1]) {
                        return false;
                    }
                    continue;
                }

                const neededCategory = m[0];
                const amount = Number(m[1]) || 0;
                let count = 0;
                const allItems = Array.isArray($gameParty?.allItems?.())
                    ? $gameParty.allItems()
                    : [];
                for (const it of allItems) {
                    if (translator.hasCategoryMatch(runtime, it, neededCategory)) {
                        count += $gameParty.numItems(it);
                    }
                }

                if (count < amount) {
                    return false;
                }
            }

            return true;
        };

        const originalStatusNumItems = SynthesisStatusWindow.prototype.numItems;
        SynthesisStatusWindow.prototype.numItems = function (item) {
            if (!translator.isRuntimeTranslationActive(translator.getRuntime())) {
                return originalStatusNumItems.apply(this, arguments);
            }

            if (
                !item ||
                (typeof DataManager.isSynthesisItem === 'function' &&
                    DataManager.isSynthesisItem(item))
            ) {
                return originalStatusNumItems.apply(this, arguments);
            }

            if (!this._numItems) {
                this.clearNumItems();
            }

            if (Object.prototype.hasOwnProperty.call(this._numItems, item)) {
                return this._numItems[item];
            }

            let count = 0;
            const runtime = translator.getRuntime();
            const allItems = Array.isArray($gameParty?.allItems?.()) ? $gameParty.allItems() : [];
            for (const it of allItems) {
                if (typeof DataManager.isMaterial !== 'function' || !DataManager.isMaterial(it)) {
                    continue;
                }

                if (translator.hasCategoryMatch(runtime, it, item)) {
                    count += $gameParty.numItems(it);
                }
            }

            this._numItems[item] = count;
            return count;
        };

        const originalEstimateCheckRecipe = EstimateWindow.prototype.checkRecipe;
        EstimateWindow.prototype.checkRecipe = function (ary) {
            if (!translator.isRuntimeTranslationActive(translator.getRuntime())) {
                return originalEstimateCheckRecipe.apply(this, arguments);
            }

            if (!Array.isArray(ary) || !Array.isArray(this._sets)) {
                return originalEstimateCheckRecipe.apply(this, arguments);
            }

            const sets = this._sets.clone();
            const runtime = translator.getRuntime();

            for (let i = 0, max = ary.length; i < max; i++) {
                const recipeEntry = ary[i];

                if (
                    typeof DataManager.isSynthesisItem === 'function' &&
                    DataManager.isSynthesisItem(recipeEntry)
                ) {
                    const expectedItem = DataManager.decodeSynthesisItem(recipeEntry);
                    const index = sets.indexOf(expectedItem);
                    if (index < 0) {
                        return false;
                    }

                    sets[index] = null;
                    ary[i] = null;
                    continue;
                }

                let matched = false;
                for (let j = 0, jmax = sets.length; j < jmax; j++) {
                    const setItem = sets[j];
                    if (!setItem) {
                        continue;
                    }

                    if (!translator.hasCategoryMatch(runtime, setItem, recipeEntry)) {
                        continue;
                    }

                    sets[j] = null;
                    ary[i] = null;
                    matched = true;
                    break;
                }

                if (!matched) {
                    return false;
                }
            }

            return true;
        };

        const originalMaterialIncludes = MaterialWindow.prototype.includes;
        MaterialWindow.prototype.includes = function (item) {
            if (!translator.isRuntimeTranslationActive(translator.getRuntime())) {
                return originalMaterialIncludes.apply(this, arguments);
            }

            if (!this._category) {
                return false;
            }

            if (typeof DataManager.isMaterial !== 'function' || !DataManager.isMaterial(item)) {
                return false;
            }

            if (
                typeof DataManager.isItem === 'function' &&
                DataManager.isItem(item) &&
                item.itypeId > 2
            ) {
                return false;
            }

            if (
                typeof DataManager.isSynthesisItem === 'function' &&
                DataManager.isSynthesisItem(this._category)
            ) {
                return DataManager.decodeSynthesisItem(this._category) === item;
            }

            const runtime = translator.getRuntime();
            return translator.hasCategoryMatch(runtime, item, this._category);
        };
    }

    patchSynthesisUiTextRuntime() {
        const BaseWindow = ANY_WINDOW.Window_Base;
        if (
            !BaseWindow ||
            !BaseWindow.prototype ||
            typeof BaseWindow.prototype.drawText !== 'function'
        ) {
            return;
        }

        const targetWindowNames = new Set([
            'Window_Recipe',
            'Window_SynthesisStatus',
            'Window_MaterialList',
            'Window_Estimate',
            'Window_Material',
            'Window_SynthesisResult',
            'Window_Synthesis',
        ]);

        const translator = this;
        const originalDrawText = BaseWindow.prototype.drawText;

        BaseWindow.prototype.drawText = function (text, x, y, maxWidth, align) {
            const runtime = translator.getRuntime();
            if (translator.isRuntimeTranslationActive(runtime) && typeof text === 'string') {
                const ctorName = this?.constructor?.name || '';
                if (targetWindowNames.has(ctorName)) {
                    const translated = translator.translateKnownPluginText(runtime, text);
                    if (translated !== text) {
                        arguments[0] = translated;
                    }
                }
            }

            return originalDrawText.apply(this, arguments);
        };

        if (
            ANY_WINDOW.Scene_CategorySynthesis &&
            ANY_WINDOW.Scene_CategorySynthesis.prototype &&
            typeof ANY_WINDOW.Scene_CategorySynthesis.prototype.activateSynthesis === 'function'
        ) {
            const originalActivateSynthesis =
                ANY_WINDOW.Scene_CategorySynthesis.prototype.activateSynthesis;
            ANY_WINDOW.Scene_CategorySynthesis.prototype.activateSynthesis = function () {
                const result = originalActivateSynthesis.apply(this, arguments);

                const runtime = translator.getRuntime();
                if (!translator.isRuntimeTranslationActive(runtime)) {
                    return result;
                }

                if (!this._synthesisWindow || !this._synthesisWindow._helpWindow) {
                    return result;
                }

                const helpWindow = this._synthesisWindow._helpWindow;
                const currentHelpText =
                    typeof helpWindow._text === 'string' ? helpWindow._text : '';
                if (!translator.isUsableText(currentHelpText)) {
                    return result;
                }

                const translated = translator.translateKnownPluginText(runtime, currentHelpText);
                if (translated !== currentHelpText && typeof helpWindow.setText === 'function') {
                    helpWindow.setText(translated);
                }

                return result;
            };
        }
    }

    enablePluginTranslation() {
        this.registerPluginCustomTags([...CATEGORY_SYNTHESIS_PLUGIN_TAGS]);
        this.patchDataManagerSecondaryCategoriesRuntime();
        this.patchSynthesisCategoryMatchingRuntime();
        this.patchSynthesisUiTextRuntime();
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
                console.warn('[CategorySynthesisTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];
        this.appendParameterEntries(entries);
        this.collectCommonEventEntries(entries);
        await this.collectMapEntries(entries);
        return entries;
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheType = String(entry.cacheType || this.getCacheType());
            const cacheKey = runtime.getCacheKey(text, cacheType);
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: cacheType,
                    id: `plugin_category_synthesis_${byCacheKey.size}`,
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
