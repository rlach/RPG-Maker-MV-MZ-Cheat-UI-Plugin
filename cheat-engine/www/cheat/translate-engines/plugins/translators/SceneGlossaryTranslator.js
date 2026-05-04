import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { mergeKnowledgeEntries } from '../../../js/KnowledgeBaseRuntime.js';

const RUNTIME_HOOK_GUARD = '__CHEAT_SCENE_GLOSSARY_TRANSLATOR_HOOKED__';
const NOTE_CACHE_TYPE = 'item_note';

const GLOSSARY_TEXT_FIELDS = [
    'CommandName',
    'GlossaryHelp',
    'CategoryHelp',
    'ConfirmHelp',
    'UsingHelp',
    'CompleteMessage',
    'ConfirmUse',
    'ConfirmNoUse',
    'VisibleItemNotYet',
];

const HAS_OWN_PROPERTY = Object.prototype.hasOwnProperty;

const SCENE_GLOSSARY_PLUGIN_TAGS = (() => {
    const xmlCustom = (description, tagSymbol, maskValue) => ({
        description,
        tagSymbol,
        style: 'xml',
        type: 'withCustomParameter',
        bracket: 'none',
        maskValue,
        requiredConsistency: true,
    });

    const tags = [
        xmlCustom('SG description (ja)', 'SG説明', false),
        xmlCustom('SG description (en)', 'SGDescription', false),
        xmlCustom('SG common description (ja)', 'SG共通説明', false),
        xmlCustom('SG common description (en)', 'SGCommonDescription', false),
        xmlCustom('SG not-yet description (ja)', 'SG未入手説明', false),
        xmlCustom('SG not-yet description (en)', 'SGNotYetDescription', false),
        xmlCustom('SG category (ja)', 'SGカテゴリ', false),
        xmlCustom('SG category (en)', 'SGCategory', false),
    ];

    for (let index = 2; index <= 5; index++) {
        const pageTags = [
            xmlCustom(`SG description page${index} (ja)`, `SG説明${index}`, false),
            xmlCustom(`SG description page${index} (en)`, `SGDescription${index}`, false),
            xmlCustom(`SG common description page${index} (ja)`, `SG共通説明${index}`, false),
            xmlCustom(
                `SG common description page${index} (en)`,
                `SGCommonDescription${index}`,
                false
            ),
            xmlCustom(
                `SG not-yet description page${index} (ja)`,
                `SG未入手説明${index}`,
                false
            ),
            xmlCustom(
                `SG not-yet description page${index} (en)`,
                `SGNotYetDescription${index}`,
                false
            ),
        ];
        tags.push(...pageTags);
    }

    return tags;
})();

function isUsableText(value) {
    return typeof value === 'string' && value.trim() !== '';
}

function hasOwn(object, key) {
    if (!object || (typeof object !== 'object' && typeof object !== 'function')) {
        return false;
    }

    return typeof Object.hasOwn === 'function'
        ? Object.hasOwn(object, key)
        : HAS_OWN_PROPERTY.call(object, key);
}

function parseJsonSafely(value, fallback) {
    if (typeof value !== 'string') {
        return value ?? fallback;
    }

    const normalized = value.trim();
    if (!normalized) {
        return fallback;
    }

    try {
        return JSON.parse(normalized);
    } catch {
        return fallback;
    }
}

function parseStructArray(rawValue) {
    const parsed = parseJsonSafely(rawValue, []);
    if (!Array.isArray(parsed)) {
        return [];
    }

    const result = [];
    for (const item of parsed) {
        const parsedItem = parseJsonSafely(item, item);
        if (parsedItem && typeof parsedItem === 'object' && !Array.isArray(parsedItem)) {
            result.push(parsedItem);
        }
    }

    return result;
}

function parseStringArray(rawValue) {
    const parsed = parseJsonSafely(rawValue, []);
    if (!Array.isArray(parsed)) {
        return [];
    }

    const result = [];
    for (const item of parsed) {
        const text = typeof item === 'string' ? item.trim() : '';
        if (text) {
            result.push(text);
        }
    }

    return result;
}

function parseNoteTagEntries(noteText) {
    const result = [];
    const text = String(noteText || '');
    if (!text.trim()) {
        return result;
    }

    const regex = /<\s*(SG[^:\s>]+)\s*:\s*([\s\S]*?)>/gi;
    let match = null;
    while ((match = regex.exec(text)) !== null) {
        const tag = String(match[1] || '').trim();
        const value = String(match[2] || '').trim();
        if (!tag || !isUsableText(value)) {
            continue;
        }

        result.push({ tag, value });
    }

    return result;
}

function isGlossaryDescriptionTag(tagName) {
    return /^SG(?:説明|Description)\d*$/i.test(String(tagName || '').trim());
}

function isGlossaryCommonDescriptionTag(tagName) {
    return /^SG(?:共通説明|CommonDescription)\d*$/i.test(String(tagName || '').trim());
}

function isGlossaryNotYetDescriptionTag(tagName) {
    return /^SG(?:未入手説明|NotYetDescription)\d*$/i.test(String(tagName || '').trim());
}

function isGlossaryCategoryTag(tagName) {
    return /^SG(?:カテゴリ|Category)$/i.test(String(tagName || '').trim());
}

/**
 * Extract SG category pairs from original → translated decoded text.
 * Both texts contain decoded XML tags like <SGカテゴリ:武器> or <SGCategory:Arms>.
 * Category values may be comma-separated lists; items are paired positionally.
 */
function extractCategoryKnowledge(originalText, translatedText, output) {
    if (
        typeof originalText !== 'string' ||
        typeof translatedText !== 'string' ||
        !Array.isArray(output)
    ) {
        return;
    }

    const originalTags = parseNoteTagEntries(originalText);
    const translatedTags = parseNoteTagEntries(translatedText);

    const originalCategories = originalTags.filter((t) => isGlossaryCategoryTag(t.tag));
    const translatedCategories = translatedTags.filter((t) => isGlossaryCategoryTag(t.tag));

    const count = Math.min(originalCategories.length, translatedCategories.length);
    for (let i = 0; i < count; i++) {
        const origValues = originalCategories[i].value
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean);
        const transValues = translatedCategories[i].value
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean);

        const pairCount = Math.min(origValues.length, transValues.length);
        for (let j = 0; j < pairCount; j++) {
            if (origValues[j] !== transValues[j]) {
                output.push({
                    key: origValues[j],
                    translation: transValues[j],
                    info: 'SceneGlossary category',
                });
            }
        }
    }
}

function findPluginEntry(pluginName) {
    if (!Array.isArray(window.$plugins)) {
        return null;
    }

    const needle = String(pluginName || '')
        .trim()
        .toLowerCase();
    if (!needle) {
        return null;
    }

    return (
        window.$plugins.find((entry) => {
            if (!entry || typeof entry.name !== 'string') {
                return false;
            }

            return entry.name.trim().toLowerCase() === needle;
        }) || null
    );
}

function getOriginalItemNote(item) {
    if (!item || typeof item !== 'object') {
        return '';
    }

    const originalMap =
        item._translateOriginal && typeof item._translateOriginal === 'object'
            ? item._translateOriginal
            : null;

    if (originalMap && isUsableText(originalMap.note)) {
        return originalMap.note;
    }

    return isUsableText(item.note) ? item.note : '';
}

function getOriginalItemMeta(item) {
    if (!item || typeof item !== 'object') {
        return {};
    }

    if (!hasOwn(item, '__CHEAT_ORIGINAL_SCENE_GLOSSARY_META__')) {
        Object.defineProperty(item, '__CHEAT_ORIGINAL_SCENE_GLOSSARY_META__', {
            value: { ...(item.meta && typeof item.meta === 'object' ? item.meta : {}) },
            configurable: true,
            enumerable: false,
            writable: true,
        });
    }

    return item.__CHEAT_ORIGINAL_SCENE_GLOSSARY_META__ || {};
}

function buildMetaPatchFromNoteText(noteText) {
    const patch = {};
    const tagEntries = parseNoteTagEntries(noteText);

    for (const tagEntry of tagEntries) {
        const tagName = String(tagEntry.tag || '').trim();
        if (!tagName.startsWith('SG') || !isUsableText(tagEntry.value)) {
            continue;
        }

        if (
            isGlossaryDescriptionTag(tagName) ||
            isGlossaryCommonDescriptionTag(tagName) ||
            isGlossaryNotYetDescriptionTag(tagName) ||
            isGlossaryCategoryTag(tagName)
        ) {
            patch[tagName] = tagEntry.value;
        }
    }

    return patch;
}

function applyTranslatedGlossaryMeta(translator, item) {
    if (!item || typeof item !== 'object') {
        return;
    }

    const runtime = translator.getRuntime();
    const originalMeta = getOriginalItemMeta(item);
    if (!runtime || !translator.isRuntimeTranslationActive(runtime)) {
        item.meta = { ...originalMeta };
        return;
    }

    const originalNote = getOriginalItemNote(item);
    if (!isUsableText(originalNote)) {
        item.meta = { ...originalMeta };
        return;
    }

    const cacheKey = runtime.getCacheKey(originalNote, NOTE_CACHE_TYPE);
    runtime.markCacheKeySeen(cacheKey);

    if (!runtime.hasUsableCacheValue(cacheKey)) {
        item.meta = { ...originalMeta };
        return;
    }

    const translatedNote = runtime.translationCache.get(cacheKey);
    if (!isUsableText(translatedNote)) {
        item.meta = { ...originalMeta };
        return;
    }

    const patch = buildMetaPatchFromNoteText(translatedNote);
    item.meta = Object.keys(patch).length > 0 ? { ...originalMeta, ...patch } : { ...originalMeta };
}

function pushScanEntry(output, text, source, cacheType) {
    if (!Array.isArray(output) || !isUsableText(text)) {
        return;
    }

    output.push({ text, source, cacheType });
}

function getGlossaryPageSuffix(pageIndex) {
    const index = Number(pageIndex) || 0;
    return index > 0 ? String(index + 1) : '';
}

function getGlossaryDescriptionTagCandidates(pageIndex) {
    const suffix = getGlossaryPageSuffix(pageIndex);
    return [`SG説明${suffix}`, `SGDescription${suffix}`];
}

function extractDescriptionFromNoteText(noteText, pageIndex) {
    if (!isUsableText(noteText)) {
        return '';
    }

    const wanted = new Set(
        getGlossaryDescriptionTagCandidates(pageIndex).map((name) => name.toLowerCase())
    );
    const tagEntries = parseNoteTagEntries(noteText);
    for (const tagEntry of tagEntries) {
        const tagName = String(tagEntry.tag || '').trim().toLowerCase();
        if (!wanted.has(tagName)) {
            continue;
        }

        const value = String(tagEntry.value || '').trim();
        if (value) {
            return value;
        }
    }

    return '';
}

function appendEntriesFromGlossaryInfo(glossaryInfoList, scope, output) {
    if (!Array.isArray(glossaryInfoList) || !Array.isArray(output)) {
        return;
    }

    for (let glossaryIndex = 0; glossaryIndex < glossaryInfoList.length; glossaryIndex++) {
        const glossaryInfo = glossaryInfoList[glossaryIndex];
        if (!glossaryInfo || typeof glossaryInfo !== 'object' || Array.isArray(glossaryInfo)) {
            continue;
        }

        for (const field of GLOSSARY_TEXT_FIELDS) {
            const text = typeof glossaryInfo[field] === 'string' ? glossaryInfo[field] : '';
            if (!isUsableText(text)) {
                continue;
            }

            const cacheType = field === 'CommandName' ? 'command' : 'plugin_scene_glossary';
            pushScanEntry(
                output,
                text,
                {
                    scope,
                    field,
                    glossaryIndex,
                },
                cacheType
            );
        }
    }
}

function appendEntriesFromParameters(parameters, scope, output) {
    if (!parameters || typeof parameters !== 'object' || !Array.isArray(output)) {
        return;
    }

    const glossaryInfoList = parseStructArray(parameters.GlossaryInfo);
    appendEntriesFromGlossaryInfo(glossaryInfoList, scope, output);

    const categoryOrderList = parseStringArray(parameters.CategoryOrder);
    for (let categoryIndex = 0; categoryIndex < categoryOrderList.length; categoryIndex++) {
        pushScanEntry(
            output,
            categoryOrderList[categoryIndex],
            {
                scope,
                field: 'CategoryOrder',
                categoryIndex,
            },
            'plugin_scene_glossary'
        );
    }
}

function applyRuntimeTranslation(runtime, text, cacheTypes) {
    if (!isUsableText(text)) {
        return text;
    }

    const list = Array.isArray(cacheTypes) ? cacheTypes : [];
    for (const cacheType of list) {
        if (!isUsableText(cacheType)) {
            continue;
        }

        const cacheKey = runtime.getCacheKey(text, cacheType);
        runtime.markCacheKeySeen(cacheKey);

        if (!runtime.hasUsableCacheValue(cacheKey)) {
            continue;
        }

        const cached = runtime.translationCache.get(cacheKey);
        if (isUsableText(cached)) {
            return cached;
        }
    }

    return text;
}

function resolveRuntimeTranslation(translator, text, cacheTypes) {
    const runtime = translator.getRuntime();
    if (
        !runtime ||
        !translator.isRuntimeTranslationActive(runtime) ||
        !isUsableText(text) ||
        !(runtime.translationCache instanceof Map)
    ) {
        return text;
    }

    return applyRuntimeTranslation(runtime, text, cacheTypes);
}

function patchGlossaryDescription(translator) {
    if (
        !window.Window_Glossary ||
        !Window_Glossary.prototype ||
        typeof Window_Glossary.prototype.getDescription !== 'function'
    ) {
        return;
    }

    const originalGetDescription = Window_Glossary.prototype.getDescription;
    Window_Glossary.prototype.getDescription = function (index) {
        applyTranslatedGlossaryMeta(translator, this._itemData);
        const description = originalGetDescription.apply(this, arguments);

        try {
            return isUsableText(description)
                ? resolveRuntimeTranslation(translator, description, [translator.getCacheType()])
                : extractDescriptionFromNoteText(getOriginalItemNote(this._itemData), index);
        } catch (error) {
            console.warn(
                '[SceneGlossaryTranslator] Failed to apply glossary description translation',
                error
            );
            return description;
        }
    };

    if (typeof Window_Glossary.prototype.getMetaContents === 'function') {
        const originalGetMetaContents = Window_Glossary.prototype.getMetaContents;
        Window_Glossary.prototype.getMetaContents = function () {
            applyTranslatedGlossaryMeta(translator, this._itemData);
            return originalGetMetaContents.apply(this, arguments);
        };
    }
}

function patchGlossaryCategoryWindow(translator) {
    if (
        !window.Window_GlossaryCategory ||
        !Window_GlossaryCategory.prototype ||
        typeof Window_GlossaryCategory.prototype.drawItem !== 'function'
    ) {
        return;
    }

    const originalDrawItem = Window_GlossaryCategory.prototype.drawItem;
    Window_GlossaryCategory.prototype.drawItem = function (index) {
        const hasData = Array.isArray(this._data) && index >= 0 && index < this._data.length;
        const originalText = hasData && typeof this._data[index] === 'string' ? this._data[index] : '';

        try {
            if (hasData && isUsableText(originalText)) {
                const translated = resolveRuntimeTranslation(translator, originalText, [
                    translator.getCacheType(),
                ]);
                if (translated !== originalText) {
                    this._data[index] = translated;
                    const result = originalDrawItem.apply(this, arguments);
                    this._data[index] = originalText;
                    return result;
                }
            }
        } catch (error) {
            console.warn(
                '[SceneGlossaryTranslator] Failed to apply glossary category translation',
                error
            );
        }

        return originalDrawItem.apply(this, arguments);
    };
}

function patchGlossaryPartyMessages(translator) {
    if (!window.Game_Party || !Game_Party.prototype) {
        return;
    }

    if (typeof Game_Party.prototype.getGlossaryCategory === 'function') {
        const originalGetGlossaryCategory = Game_Party.prototype.getGlossaryCategory;
        Game_Party.prototype.getGlossaryCategory = function (item) {
            applyTranslatedGlossaryMeta(translator, item);
            return originalGetGlossaryCategory.apply(this, arguments);
        };
    }

    if (typeof Game_Party.prototype.getGlossaryHelpMessages === 'function') {
        const originalGetGlossaryHelpMessages = Game_Party.prototype.getGlossaryHelpMessages;
        Game_Party.prototype.getGlossaryHelpMessages = function () {
            const result = originalGetGlossaryHelpMessages.apply(this, arguments);
            if (!Array.isArray(result)) {
                return result;
            }

            try {
                return result.map((text) =>
                    resolveRuntimeTranslation(translator, text, [translator.getCacheType()])
                );
            } catch (error) {
                console.warn(
                    '[SceneGlossaryTranslator] Failed to apply glossary help text translation',
                    error
                );
                return result;
            }
        };
    }

    if (typeof Game_Party.prototype.getGlossaryConfirmMessages === 'function') {
        const originalGetGlossaryConfirmMessages = Game_Party.prototype.getGlossaryConfirmMessages;
        Game_Party.prototype.getGlossaryConfirmMessages = function () {
            const result = originalGetGlossaryConfirmMessages.apply(this, arguments);
            if (!Array.isArray(result)) {
                return result;
            }

            try {
                return result.map((text) =>
                    resolveRuntimeTranslation(translator, text, [translator.getCacheType()])
                );
            } catch (error) {
                console.warn(
                    '[SceneGlossaryTranslator] Failed to apply glossary confirm text translation',
                    error
                );
                return result;
            }
        };
    }

    if (typeof Game_Party.prototype.getGlossaryCompleteMessage === 'function') {
        const originalGetGlossaryCompleteMessage = Game_Party.prototype.getGlossaryCompleteMessage;
        Game_Party.prototype.getGlossaryCompleteMessage = function () {
            const result = originalGetGlossaryCompleteMessage.apply(this, arguments);
            try {
                return resolveRuntimeTranslation(translator, result, [translator.getCacheType()]);
            } catch (error) {
                console.warn(
                    '[SceneGlossaryTranslator] Failed to apply glossary complete message translation',
                    error
                );
                return result;
            }
        };
    }

    if (typeof Game_Party.prototype.getTextItemNotYet === 'function') {
        const originalGetTextItemNotYet = Game_Party.prototype.getTextItemNotYet;
        Game_Party.prototype.getTextItemNotYet = function () {
            const result = originalGetTextItemNotYet.apply(this, arguments);
            try {
                return resolveRuntimeTranslation(translator, result, [translator.getCacheType()]);
            } catch (error) {
                console.warn(
                    '[SceneGlossaryTranslator] Failed to apply glossary hidden item text translation',
                    error
                );
                return result;
            }
        };
    }
}

function patchGlossaryMenuCommand(translator) {
    if (
        !window.Window_MenuCommand ||
        !Window_MenuCommand.prototype ||
        typeof Window_MenuCommand.prototype.addOriginalCommands !== 'function'
    ) {
        return;
    }

    const originalAddOriginalCommands = Window_MenuCommand.prototype.addOriginalCommands;
    Window_MenuCommand.prototype.addOriginalCommands = function () {
        const result = originalAddOriginalCommands.apply(this, arguments);

        try {
            const list = Array.isArray(this._list) ? this._list : [];
            for (const command of list) {
                if (!command || !isUsableText(command.symbol) || !isUsableText(command.name)) {
                    continue;
                }

                if (!/^glossary\d*$/i.test(command.symbol)) {
                    continue;
                }

                command.name = resolveRuntimeTranslation(translator, command.name, [
                    'command',
                    translator.getCacheType(),
                ]);
            }
        } catch (error) {
            console.warn(
                '[SceneGlossaryTranslator] Failed to apply glossary menu command translation',
                error
            );
        }

        return result;
    };
}

export class SceneGlossaryTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'SceneGlossary';
    }

    getPluginLabel() {
        return 'SceneGlossary';
    }

    getCacheType() {
        return 'plugin_scene_glossary';
    }

    enablePluginTranslation() {
        if (window[RUNTIME_HOOK_GUARD]) {
            return;
        }

        this.registerPluginCustomTags(SCENE_GLOSSARY_PLUGIN_TAGS);
        patchGlossaryDescription(this);
        patchGlossaryCategoryWindow(this);
        patchGlossaryPartyMessages(this);
        patchGlossaryMenuCommand(this);
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

        this._scanPromise = Promise.resolve(this.buildScanEntries())
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[SceneGlossaryTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const entries = [];

        const pluginEntry = findPluginEntry(this.getPluginName());
        if (pluginEntry?.parameters) {
            appendEntriesFromParameters(pluginEntry.parameters, 'pluginEntryParameter', entries);
        }

        if (window.PluginManager && typeof PluginManager.parameters === 'function') {
            const runtimeParameters = PluginManager.parameters(this.getPluginName());
            appendEntriesFromParameters(
                runtimeParameters,
                'runtimePluginManagerParameter',
                entries
            );
        }

        return entries;
    }

    buildUniquePendingItems(panel) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!isUsableText(text)) {
                continue;
            }

            const cacheType = isUsableText(entry.cacheType) ? entry.cacheType : this.getCacheType();
            const cacheKey = panel.getCacheKey(text, cacheType);
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: cacheType,
                    id: `plugin_scene_glossary_${cacheType}_${byCacheKey.size}`,
                    value: text,
                    cacheKey,
                });
            }
        }

        return Array.from(byCacheKey.values());
    }

    collectUntranslated({ panel }) {
        if (!panel || typeof panel.getCacheKey !== 'function') {
            return [];
        }

        const items = this.buildUniquePendingItems(panel);
        return items.filter((item) => !panel.hasUsableCacheValue(item.cacheKey));
    }

    countPluginAmountSync({ panel }) {
        if (!panel || typeof panel.getCacheKey !== 'function') {
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

    manageKnowledgeBase(_query, response) {
        const successes = response && response.successes;
        if (!Array.isArray(successes) || successes.length === 0) {
            return;
        }

        const entries = [];
        for (const item of successes) {
            extractCategoryKnowledge(item.value, item.translated, entries);
        }

        if (entries.length > 0) {
            for (const entry of entries) {
                entry.plugin = this.getPluginName();
            }
            mergeKnowledgeEntries(entries);
        }
    }
}
