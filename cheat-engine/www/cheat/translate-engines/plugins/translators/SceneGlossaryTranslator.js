import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { mergeKnowledgeEntries } from '../../../js/KnowledgeBaseRuntime.js';
import { parseJsonSafely } from './TranslatorHelpers.js';
import { TAG_BRACKET, TAG_STYLE, TAG_TYPE } from '../../ai-engine/constants.js';

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

const NOTE_TAG_DATABASE_SOURCES = [
    { scope: 'items', getter: () => window.$dataItems },
    { scope: 'weapons', getter: () => window.$dataWeapons },
    { scope: 'armors', getter: () => window.$dataArmors },
    { scope: 'skills', getter: () => window.$dataSkills },
    { scope: 'states', getter: () => window.$dataStates },
    { scope: 'enemies', getter: () => window.$dataEnemies },
];

function returnStatTag(statName, tagSymbol) {
    return {
        description: `Returns ${statName}`,
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: tagSymbol,
        requiredConsistency: true,
    };
}

const HAS_OWN_PROPERTY = Object.prototype.hasOwnProperty;

export const SCENE_GLOSSARY_PLUGIN_TAGS = (() => {
    const xmlCustom = (description, tagSymbol, maskValue) => ({
        description,
        tagSymbol,
        style: TAG_STYLE.XML,
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        bracket: TAG_BRACKET.NONE,
        maskValue,
        requiredConsistency: true,
    });

    const xmlCategoryTag = (description, tagSymbol) => ({
        ...xmlCustom(description, tagSymbol, false),
        alwaysTranslate: true,
        alwaysAddToKnowledgeBase: true,
    });

    const tags = [
        xmlCustom('SG description (ja)', 'SG説明', false),
        xmlCustom('SG description (en)', 'SGDescription', false),
        xmlCustom('SG common description (ja)', 'SG共通説明', false),
        xmlCustom('SG common description (en)', 'SGCommonDescription', false),
        xmlCustom('SG not-yet description (ja)', 'SG未入手説明', false),
        xmlCustom('SG not-yet description (en)', 'SGNotYetDescription', false),
        xmlCategoryTag('SG category (ja)', 'SGカテゴリ'),
        xmlCategoryTag('SG category (en)', 'SGCategory'),
        {
            description: 'Returns data from Glossary',
            type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
            bracket: TAG_BRACKET.SQUARE,
            tagSymbol: 'DATA',
            maskValue: true,
            requiredConsistency: true,
        },
        {
            description: 'Returns info from <CommonDescription>',
            type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
            bracket: TAG_BRACKET.SQUARE,
            tagSymbol: 'COMMON',
            requiredConsistency: true,
        },
        returnStatTag('Enemy Max HP(Zero padding 3)', 'MHP'),
        returnStatTag('Max MP', 'MMP'),
        returnStatTag('Atk', 'ATK'),
        returnStatTag('Def', 'DEF'),
        returnStatTag('Mag', 'MAG'),
        returnStatTag('Mdf', 'MDF'),
        returnStatTag('Agi', 'AGI'),
        returnStatTag('Luk', 'LUK'),
        returnStatTag('Exp', 'EXP'),
        returnStatTag('Gold', 'MONEY'),
        returnStatTag('Drop item N', 'DROP'),
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
            xmlCustom(`SG not-yet description page${index} (ja)`, `SG未入手説明${index}`, false),
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

function hasOwn(object, key) {
    if (!object || (typeof object !== 'object' && typeof object !== 'function')) {
        return false;
    }

    return typeof Object.getOwnPropertyDescriptor === 'function'
        ? !!Object.getOwnPropertyDescriptor(object, key)
        : HAS_OWN_PROPERTY.call(object, key);
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

function hasCjkCharacters(text) {
    return /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/.test(String(text || ''));
}

function isLikelyTranslatableNoteValue(value) {
    if (!(typeof value === 'string' && value.trim() !== '')) {
        return false;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return false;
    }

    if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
        return false;
    }

    if (/^<[^>]+>$/.test(trimmed)) {
        return false;
    }

    if (!hasCjkCharacters(trimmed) && /^[A-Za-z0-9_./:%+-]+$/.test(trimmed)) {
        return false;
    }

    return true;
}

function extractTagSymbolsFromRawValue(rawValue, outputSet) {
    const parsed = parseJsonSafely(rawValue, rawValue);

    if (Array.isArray(parsed)) {
        for (const item of parsed) {
            extractTagSymbolsFromRawValue(item, outputSet);
        }
        return;
    }

    if (parsed && typeof parsed === 'object') {
        for (const value of Object.values(parsed)) {
            extractTagSymbolsFromRawValue(value, outputSet);
        }
        return;
    }

    const source = typeof parsed === 'string' ? parsed : '';
    if (!source.trim()) {
        return;
    }

    const xmlTagRegex = /<\s*([A-Za-z_]\w*)\s*[:>]/g;
    let match = null;
    while ((match = xmlTagRegex.exec(source)) !== null) {
        outputSet.add(String(match[1] || '').trim().toLowerCase());
    }

    const tokenRegex = /(?:^|[,\s])([A-Za-z_]\w*)(?=$|[,\s])/g;
    while ((match = tokenRegex.exec(source)) !== null) {
        outputSet.add(String(match[1] || '').trim().toLowerCase());
    }
}

function collectConfiguredCustomTagSymbols(parameters) {
    const symbols = new Set();
    if (!parameters || typeof parameters !== 'object') {
        return symbols;
    }

    for (const [key, value] of Object.entries(parameters)) {
        if (!/tag/i.test(String(key || ''))) {
            continue;
        }

        extractTagSymbolsFromRawValue(value, symbols);
    }

    return symbols;
}

function isSceneGlossaryDefaultTagSymbol(symbol) {
    const text = String(symbol || '').trim();
    if (!text) {
        return false;
    }

    return (
        /^SG(?:説明|Description)\d*$/i.test(text) ||
        /^SG(?:共通説明|CommonDescription)\d*$/i.test(text) ||
        /^SG(?:未入手説明|NotYetDescription)\d*$/i.test(text) ||
        /^SG(?:カテゴリ|Category)$/i.test(text)
    );
}

function parseNoteTagEntries(noteText) {
    const result = [];
    const text = String(noteText || '');
    if (!text.trim()) {
        return result;
    }

    const regex = /<\s*([^:\s>]+)\s*:\s*([\s\S]*?)>/gi;
    let match = null;
    while ((match = regex.exec(text)) !== null) {
        const tag = String(match[1] || '').trim();
        const value = String(match[2] || '');
        if (!tag || !(typeof value === 'string' && value.trim() !== '')) {
            continue;
        }

        result.push({ tag, value });
    }

    return result;
}

function appendEntriesFromGlossaryDatabaseNoteRecord(
    record,
    sourceScope,
    dataId,
    allowedTags,
    output
) {
    const note = typeof record?.note === 'string' ? record.note : '';
    if (!note.trim()) {
        return;
    }

    const tagEntries = parseNoteTagEntries(note);
    for (const tagEntry of tagEntries) {
        const tagName = String(tagEntry.tag || '').trim();
        const normalizedTagName = tagName.toLowerCase();
        if (
            !isSceneGlossaryDefaultTagSymbol(tagName) &&
            !allowedTags.has(normalizedTagName)
        ) {
            continue;
        }

        const value = typeof tagEntry.value === 'string' ? tagEntry.value : '';
        if (!isLikelyTranslatableNoteValue(value)) {
            continue;
        }

        pushScanEntry(
            output,
            value,
            {
                scope: 'databaseNoteTag',
                dataset: sourceScope,
                dataId,
                tag: tagName,
            },
            'plugin_scene_glossary'
        );
    }
}

function appendEntriesFromGlossaryDatabaseNotes(customTagSymbols, output) {
    const allowedTags = new Set(
        Array.from(customTagSymbols || [])
            .map((tag) => String(tag || '').trim().toLowerCase())
            .filter(Boolean)
    );

    for (const source of NOTE_TAG_DATABASE_SOURCES) {
        const records = source.getter();
        if (!Array.isArray(records)) {
            continue;
        }

        for (let dataId = 0; dataId < records.length; dataId++) {
            appendEntriesFromGlossaryDatabaseNoteRecord(
                records[dataId],
                source.scope,
                dataId,
                allowedTags,
                output
            );
        }
    }
}

function buildCustomXmlTagConfigs(symbols) {
    const result = [];
    const seen = new Set();

    for (const symbol of symbols || []) {
        const normalized = String(symbol || '').trim();
        if (!normalized || seen.has(normalized.toLowerCase())) {
            continue;
        }

        seen.add(normalized.toLowerCase());
        result.push({
            description: `SceneGlossary custom tag: ${normalized}`,
            tagSymbol: normalized,
            style: TAG_STYLE.XML,
            type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
            bracket: TAG_BRACKET.NONE,
            maskValue: false,
            requiredConsistency: true,
            alwaysTranslate: true,
        });
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

function getOriginalItemNote(item) {
    if (!item || typeof item !== 'object') {
        return '';
    }

    const originalMap =
        item._translateOriginal && typeof item._translateOriginal === 'object'
            ? item._translateOriginal
            : null;

    if (originalMap && typeof originalMap.note === 'string' && originalMap.note.trim() !== '') {
        return originalMap.note;
    }

    return typeof item.note === 'string' && item.note.trim() !== '' ? item.note : '';
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
        if (
            !tagName.startsWith('SG') ||
            !(typeof tagEntry.value === 'string' && tagEntry.value.trim() !== '')
        ) {
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
    if (!translator.isUsableText(originalNote)) {
        item.meta = { ...originalMeta };
        return;
    }

    const cacheKey = runtime.getCacheKey(originalNote, NOTE_CACHE_TYPE);
    runtime.trackCacheKeyUsage(cacheKey);

    if (!runtime.hasUsableCacheValue(cacheKey)) {
        item.meta = { ...originalMeta };
        return;
    }

    const translatedNote = runtime.translationCache.get(cacheKey);
    if (!translator.isUsableText(translatedNote)) {
        item.meta = { ...originalMeta };
        return;
    }

    const patch = buildMetaPatchFromNoteText(translatedNote);
    item.meta = Object.keys(patch).length > 0 ? { ...originalMeta, ...patch } : { ...originalMeta };
}

function pushScanEntry(output, text, source, cacheType) {
    if (!Array.isArray(output) || !(typeof text === 'string' && text.trim() !== '')) {
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
    if (!(typeof noteText === 'string' && noteText.trim() !== '')) {
        return '';
    }

    const wanted = new Set(
        getGlossaryDescriptionTagCandidates(pageIndex).map((name) => name.toLowerCase())
    );
    const tagEntries = parseNoteTagEntries(noteText);
    for (const tagEntry of tagEntries) {
        const tagName = String(tagEntry.tag || '')
            .trim()
            .toLowerCase();
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

function appendEntryFromGlossaryInfoField(glossaryInfo, field, scope, glossaryIndex, output) {
    const text = typeof glossaryInfo[field] === 'string' ? glossaryInfo[field] : '';
    if (!(typeof text === 'string' && text.trim() !== '')) {
        return;
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
            appendEntryFromGlossaryInfoField(glossaryInfo, field, scope, glossaryIndex, output);
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

function resolveRuntimeTranslation(translator, text, cacheTypes) {
    return translator.resolveRuntimeTranslation(text, translator.getRuntime(), cacheTypes, {
        requireRuntimeTranslationActive: true,
    });
}

function installGlossaryDescriptionHooks(translator, glossaryWindowPrototype) {
    if (!glossaryWindowPrototype || typeof glossaryWindowPrototype.getDescription !== 'function') {
        return false;
    }

    if (glossaryWindowPrototype.__CHEAT_SCENE_GLOSSARY_DESCRIPTION_PATCHED__) {
        return true;
    }

    const originalGetDescription = glossaryWindowPrototype.getDescription;
    glossaryWindowPrototype.getDescription = function (index) {
        applyTranslatedGlossaryMeta(translator, this._itemData);
        const description = originalGetDescription.apply(this, arguments);

        try {
            return translator.isUsableText(description)
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

    if (typeof glossaryWindowPrototype.getMetaContents === 'function') {
        const originalGetMetaContents = glossaryWindowPrototype.getMetaContents;
        glossaryWindowPrototype.getMetaContents = function () {
            applyTranslatedGlossaryMeta(translator, this._itemData);
            return originalGetMetaContents.apply(this, arguments);
        };
    }

    glossaryWindowPrototype.__CHEAT_SCENE_GLOSSARY_DESCRIPTION_PATCHED__ = true;
    return true;
}

function patchGlossaryDescriptionViaSceneCreate(translator) {
    if (!window.Scene_Glossary?.prototype?.createGlossaryWindow) {
        return false;
    }

    const scenePrototype = window.Scene_Glossary.prototype;
    if (scenePrototype.__CHEAT_SCENE_GLOSSARY_CREATE_WINDOW_PATCHED__) {
        return true;
    }

    const originalCreateGlossaryWindow = scenePrototype.createGlossaryWindow;
    scenePrototype.createGlossaryWindow = function () {
        const result = originalCreateGlossaryWindow.apply(this, arguments);
        const glossaryWindowPrototype = Object.getPrototypeOf(this._glossaryWindow);
        installGlossaryDescriptionHooks(translator, glossaryWindowPrototype);
        return result;
    };

    scenePrototype.__CHEAT_SCENE_GLOSSARY_CREATE_WINDOW_PATCHED__ = true;
    return true;
}

function patchGlossaryDescription(translator) {
    if (window.Window_Glossary?.prototype) {
        return installGlossaryDescriptionHooks(translator, window.Window_Glossary.prototype);
    }

    return patchGlossaryDescriptionViaSceneCreate(translator);
}

function installGlossaryCategoryHooks(translator, categoryWindowPrototype) {
    if (!categoryWindowPrototype || typeof categoryWindowPrototype.drawItem !== 'function') {
        return false;
    }

    if (categoryWindowPrototype.__CHEAT_SCENE_GLOSSARY_CATEGORY_PATCHED__) {
        return true;
    }

    const originalDrawItem = categoryWindowPrototype.drawItem;
    categoryWindowPrototype.drawItem = function (index) {
        const hasData = Array.isArray(this._data) && index >= 0 && index < this._data.length;
        const originalText =
            hasData && typeof this._data[index] === 'string' ? this._data[index] : '';

        try {
            if (hasData && translator.isUsableText(originalText)) {
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

    categoryWindowPrototype.__CHEAT_SCENE_GLOSSARY_CATEGORY_PATCHED__ = true;
    return true;
}

function patchGlossaryCategoryViaSceneCreate(translator) {
    if (!window.Scene_Glossary?.prototype?.createGlossaryCategoryWindow) {
        return false;
    }

    const scenePrototype = window.Scene_Glossary.prototype;
    if (scenePrototype.__CHEAT_SCENE_GLOSSARY_CREATE_CATEGORY_PATCHED__) {
        return true;
    }

    const originalCreateGlossaryCategoryWindow = scenePrototype.createGlossaryCategoryWindow;
    scenePrototype.createGlossaryCategoryWindow = function () {
        const result = originalCreateGlossaryCategoryWindow.apply(this, arguments);
        const categoryWindowPrototype = Object.getPrototypeOf(this._glossaryCategoryWindow);
        installGlossaryCategoryHooks(translator, categoryWindowPrototype);
        return result;
    };

    scenePrototype.__CHEAT_SCENE_GLOSSARY_CREATE_CATEGORY_PATCHED__ = true;
    return true;
}

function patchGlossaryCategoryWindow(translator) {
    if (window.Window_GlossaryCategory?.prototype) {
        installGlossaryCategoryHooks(translator, window.Window_GlossaryCategory.prototype);
        return;
    }

    patchGlossaryCategoryViaSceneCreate(translator);
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
                if (
                    !command ||
                    !translator.isUsableText(command.symbol) ||
                    !translator.isUsableText(command.name)
                ) {
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
        this._customTagSymbols = new Set();
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
            return true;
        }

        if (!patchGlossaryDescription(this)) {
            return false;
        }
        patchGlossaryCategoryWindow(this);
        patchGlossaryPartyMessages(this);
        patchGlossaryMenuCommand(this);
        this.registerPluginCustomTags(SCENE_GLOSSARY_PLUGIN_TAGS);
        this.registerPluginCustomTags(
            buildCustomXmlTagConfigs(Array.from(this._customTagSymbols))
        );
        window[RUNTIME_HOOK_GUARD] = true;
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

        this._customTagSymbols = new Set();

        const pluginEntry = this.findPluginEntry();
        if (pluginEntry?.parameters) {
            appendEntriesFromParameters(pluginEntry.parameters, 'pluginEntryParameter', entries);
            const pluginCustomTagSymbols = collectConfiguredCustomTagSymbols(
                pluginEntry.parameters
            );
            for (const symbol of pluginCustomTagSymbols) {
                if (!isSceneGlossaryDefaultTagSymbol(symbol)) {
                    this._customTagSymbols.add(symbol);
                }
            }
        }

        if (window.PluginManager && typeof PluginManager.parameters === 'function') {
            const runtimeParameters = PluginManager.parameters(this.getPluginName());
            appendEntriesFromParameters(
                runtimeParameters,
                'runtimePluginManagerParameter',
                entries
            );
            const runtimeCustomTagSymbols = collectConfiguredCustomTagSymbols(runtimeParameters);
            for (const symbol of runtimeCustomTagSymbols) {
                if (!isSceneGlossaryDefaultTagSymbol(symbol)) {
                    this._customTagSymbols.add(symbol);
                }
            }
        }

        appendEntriesFromGlossaryDatabaseNotes(this._customTagSymbols, entries);

        return entries;
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheType = this.isUsableText(entry.cacheType)
                ? entry.cacheType
                : this.getCacheType();
            const cacheKey = runtime.getCacheKey(text, cacheType);
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

    manageKnowledgeBase(_query, response) {
        const successes = response?.successes;
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
