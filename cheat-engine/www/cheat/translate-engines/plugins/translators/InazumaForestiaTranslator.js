import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';
import { TAG_TYPE, TAG_BRACKET } from '../../ai-engine/constants.js';
import {
    withTranslatedNotification,
    rememberDisplayTranslation,
    isKnownDisplayTranslation,
} from '../NotificationTranslationContext.js';

const TABLES = {
    Text: ['value'],
    QuestContent: ['title', 'desc'],
    QuestConditionTarget: ['display_name'],
    DairyShed: ['name'],
    DairyLivestock: ['name'],
    DairyLivestockGroup: ['name'],
    Group: ['name'],
    Indicator: ['display_name'],
    CharacterLabel: ['value'],
    PlaceGroup: ['name'],
    FishingArea: ['name'],
    GlobalMapInfo: ['name'],
    Location: ['name'],
    TipsText: ['text'],
    Dialog: ['title', 'text', 'yes_text', 'no_text'],
    Calendar: ['name'],
};
const normalize = (text) => text.replace(/\r\n/g, '\n').replace(/\\n(?!\[|[A-Za-z0-9_])/g, '\n');
const CUSTOM_TAGS = [
    ...['TRN', 'IL', 'FSET'].map((tagSymbol) => ({
        tagSymbol,
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        bracket: TAG_BRACKET.SQUARE,
        maskValue: true,
        requiredConsistency: true,
        description: 'Forestia localization, image-list or font key; preserve the exact argument.',
    })),
    ...['NE', 'SHOPTIME', 'FACTIME', 'Item', 'ItemNum', 'GMname'].map((tagSymbol) => ({
        tagSymbol,
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        requiredConsistency: true,
        description: 'Forestia dynamic display value identified by its database ID.',
    })),
    ...['DAIRY_EGG', 'FRESET', 'QPlace'].map((tagSymbol) => ({
        tagSymbol,
        type: TAG_TYPE.WITHOUT_PARAMETER,
        requiredConsistency: true,
        description: 'Forestia dynamic livestock value or font reset.',
    })),
];

/**
 * Inazuma/Forestia MZ plugin family shipped with Forestia v1.4.4 + DLC.
 * The official i18nScriptDatabase defines which custom database fields are text.
 * Read those exact fields plus enabled non-debug Inazuma source display literals.
 * Iz.Text.get supplies labels/templates; Sprite_Text/Ex render the custom UI.
 * Formatting slots and actor/variable macros use protected COT transport values.
 * Never translate table IDs, asset paths, quest conditions or persistent records.
 */
export class InazumaForestiaTranslator extends SourceTextCatalogTranslator {
    constructor() {
        super();
        this.rawTemplates = new Map();
        this.shortFragments = new Set();
    }
    getPluginName() {
        return 'InazumaForestia';
    }
    getPluginLabel() {
        return 'Forestia / Inazuma custom interfaces';
    }
    getCacheType() {
        return 'plugin_inazuma_forestia';
    }
    detectPlugin() {
        return (window.$plugins || []).some(
            (p) => p.status && /^inazuma\/core\/text\/Text$/i.test(p.name)
        );
    }
    getSourcePluginNames() {
        return [];
    }
    shouldScanEventData() {
        return false;
    }

    isDisplayFragment(text) {
        return super.isDisplayFragment(text) || this.shortFragments.has(text);
    }

    addDisplayText(value) {
        if (!this.isUsableText(value)) return;
        const text = normalize(value);
        const slots = [];
        const parts = [];
        let cursor = 0;
        const pattern = /\{\d+\}|\\(?:N|P|V|GMname)\[\d+\]|\\Qplace\b/gi;
        for (const match of text.matchAll(pattern)) {
            parts.push(text.slice(cursor, match.index));
            slots.push(match[0]);
            cursor = match.index + match[0].length;
        }
        parts.push(text.slice(cursor));
        if (slots.length) {
            // Adjacent placeholders do not have an unambiguous expanded match.
            const canonical = parts
                .map((part, index) => part + (index < slots.length ? `\\COT[${index}]` : ''))
                .join('');
            const entry = {
                text: canonical,
                parts: parts.join('').trim() && parts.slice(1, -1).every(Boolean) ? parts : null,
            };
            this.entries.set(canonical, entry);
            this.rawTemplates.set(text, { ...entry, slots });
        } else this.entries.set(text, { text });
    }

    async collectAdditionalTexts() {
        await Promise.all(
            Object.entries(TABLES).map(async ([table, fields]) => {
                const response = await fetch(`data/${table}.json`);
                if (!response.ok)
                    throw new Error(`Cannot read Forestia ${table}: ${response.status}`);
                const list = parseJsonSafely(await response.text());
                if (!Array.isArray(list)) throw new Error(`Invalid Forestia ${table} data`);
                for (const row of list)
                    for (const field of fields) {
                        this.addDisplayText(row?.[field]);
                        if (table === 'FishingArea' && row?.[field]?.length === 1)
                            this.shortFragments.add(row[field]);
                    }
            })
        );
        const plugins = (window.$plugins || []).filter(
            (p) => p.status && /^inazuma\//i.test(p.name) && !/\/debug\//i.test(p.name)
        );
        await Promise.all(
            plugins.map(async (plugin) => {
                const response = await fetch(`js/plugins/${plugin.name}.js`);
                if (!response.ok) throw new Error(`Cannot read ${plugin.name}: ${response.status}`);
                const catalog = this.extractCatalog(await response.text());
                for (const entry of catalog.entries) {
                    if (entry.parts) this.entries.set(entry.text, entry);
                    else this.addDisplayText(entry.text);
                }
            })
        );
    }

    prepareDynamicValueTag(runtime) {
        super.prepareDynamicValueTag(runtime);
        if (this.forestiaTagEngine === runtime.engine) return;
        this.registerPluginCustomTags(CUSTOM_TAGS);
        this.forestiaTagEngine = runtime.engine;
    }

    resolveText(text, runtime, depth = 0, allowFragments = true) {
        if (!this.isUsableText(text) || !this.isRuntimeTranslationActive(runtime)) return text;
        this.prepareDynamicValueTag(runtime);
        const source = normalize(text);
        const template = this.rawTemplates.get(source);
        if (template) {
            const translated = this.resolveRuntimeTranslation(template.text, runtime);
            const result =
                translated === template.text
                    ? text
                    : translated.replace(
                          /\\COT\[(\d+)\]/g,
                          (_, index) => template.slots[Number(index)] ?? ''
                      );
            if (result !== text) rememberDisplayTranslation(runtime, result);
            return result;
        }
        const translated = super.resolveText(source, runtime, depth, allowFragments);
        if (translated !== source) rememberDisplayTranslation(runtime, translated);
        return translated === source ? text : translated;
    }

    enablePluginTranslation() {
        if (
            typeof window.Iz?.Text?.get !== 'function' ||
            typeof Sprite_Text === 'undefined' ||
            typeof Sprite_TextEx === 'undefined'
        )
            return false;
        if (!super.enablePluginTranslation()) return false;
        const translator = this;
        const get = window.Iz.Text.get;
        window.Iz.Text.get = function (...args) {
            return translator.resolveText(get.apply(this, args), translator.getRuntime());
        };
        for (const Class of [Sprite_Text, Sprite_TextEx])
            this.hookDrawing(Class.prototype, 'setText');
        const quest = window.Iz.Life?.Quest;
        if (quest?.convertEscapeCharacterQuest) {
            const convert = quest.convertEscapeCharacterQuest;
            quest.convertEscapeCharacterQuest = function (place, text, ...args) {
                return convert.call(
                    this,
                    place,
                    translator.resolveText(text, translator.getRuntime()),
                    ...args
                );
            };
        }
        // Formatter arguments can themselves be untranslated quest titles or names.
        const strings = window.Iz.String;
        if (strings?.format) {
            const format = strings.format;
            strings.format = function (template, ...values) {
                const runtime = translator.getRuntime();
                const translatedTemplate = translator.resolveText(template, runtime);
                const translatedValues = values.map((value) =>
                    typeof value === 'string' ? translator.resolveText(value, runtime) : value
                );
                const result = format.call(this, translatedTemplate, ...translatedValues);
                // Some producers call a private notify function, bypassing Iz.System.notify.
                // Retain provenance across formatting so Torigoya does not harvest its output.
                if (
                    translator.isRuntimeTranslationActive(runtime) &&
                    typeof result === 'string' &&
                    (translatedTemplate !== template ||
                        isKnownDisplayTranslation(runtime, template) ||
                        translatedValues.some((value, index) => value !== values[index]))
                )
                    rememberDisplayTranslation(runtime, result);
                return result;
            };
        }
        const system = window.Iz.System;
        if (system?.notify) {
            const notify = system.notify;
            system.notify = function (text, ...args) {
                return withTranslatedNotification(() =>
                    notify.call(
                        this,
                        translator.resolveText(text, translator.getRuntime()),
                        ...args
                    )
                );
            };
        }
        return true;
    }
}
