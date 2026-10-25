import { BasePluginTranslator } from './BasePluginTranslator.js';
import { parseJsonSafely, walkNestedJsonLike } from './translators/TranslatorHelpers.js';
import { loadMapDataById } from '../../js/translation-runtime/ObjectTranslationModalMethods.js';
import { TAG_TYPE, TAG_STYLE, TAG_BRACKET } from '../ai-engine/constants.js';

const DYNAMIC_VALUE_TAG = {
    description: 'Dynamic source text value',
    tagSymbol: 'COT',
    type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
    style: TAG_STYLE.ESCAPE,
    bracket: TAG_BRACKET.SQUARE,
    maskValue: true,
    requiredConsistency: true,
};

/** Shared source-catalog scanner and presentation hooks for custom plugin families. */
export class SourceTextCatalogTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this.entries = new Map();
        this.templates = [];
        this.drawing = 0;
    }

    getSourcePluginNames() {
        return this.getPluginAliases();
    }

    async precomputeCounts() {
        if (this.scanPromise) return this.scanPromise;
        this.scanPromise = this.buildCatalog();
        return this.scanPromise;
    }

    async buildCatalog() {
        const { extractJavaScriptTextCatalog, escapeCatalogPattern } =
            await import('./translators/JavaScriptTextCatalog.js');
        this.extractCatalog = extractJavaScriptTextCatalog;
        await Promise.all(
            this.getSourcePluginNames().map(async (name) => {
                const plugin = this.findPluginEntry(name);
                if (!plugin?.status) return;
                const response = await fetch(`js/plugins/${plugin.name}.js`);
                if (!response.ok) throw new Error(`Cannot read ${plugin.name}: ${response.status}`);
                const catalog = extractJavaScriptTextCatalog(await response.text());
                for (const entry of catalog.entries)
                    if (!this.entries.has(entry.text))
                        this.entries.set(entry.text, { ...entry, plugin: name });
                this.collectParameterTexts(plugin.parameters);
            })
        );
        // Detection can precede database initialization. Read source files in
        // that case instead of permanently caching an empty event scan.
        const [commonEvents, mapInfos] = await Promise.all(
            [
                ['CommonEvents', window.$dataCommonEvents],
                ['MapInfos', window.$dataMapInfos],
            ].map(async ([name, existing]) => {
                if (Array.isArray(existing)) return existing;
                const response = await fetch(`data/${name}.json`);
                if (!response.ok) throw new Error(`Cannot read ${name}: ${response.status}`);
                const data = parseJsonSafely(await response.text());
                if (!Array.isArray(data)) throw new Error(`Invalid ${name} data`);
                return data;
            })
        );
        for (const event of commonEvents) this.collectCommandTexts(event?.list);
        for (const mapInfo of mapInfos) {
            if (!mapInfo?.id) continue;
            const map = await loadMapDataById(mapInfo.id);
            for (const text of [mapInfo.name, map.displayName]) {
                if (this.isUsableText(text)) this.entries.set(text, { text });
            }
            for (const event of map.events || [])
                for (const page of event?.pages || []) this.collectCommandTexts(page.list);
        }
        await this.collectAdditionalTexts();
        this.templates = [...this.entries.values()]
            .filter((entry) => entry.parts)
            .map((entry) => ({
                ...entry,
                pattern: new RegExp(
                    '^' + entry.parts.map(escapeCatalogPattern).join('([\\s\\S]*?)') + '$'
                ),
                fixedLength: entry.parts.join('').length,
            }))
            .sort((a, b) => b.fixedLength - a.fixedLength);
        const fragments = [...this.entries.keys()].filter(
            (text) => !text.includes('\n') && !text.includes('\\COT[') && text.length >= 2
        );
        fragments.sort((a, b) => b.length - a.length);
        this.fragmentPattern = fragments.length
            ? new RegExp(fragments.map(escapeCatalogPattern).join('|'), 'g')
            : null;
    }

    collectParameterTexts(parameters) {
        walkNestedJsonLike(parameters, (value, { path }) => {
            if (typeof value !== 'string' || !value.trim()) return;
            const field = [...path].reverse().find((part) => !/^\d+$/.test(part)) || '';
            if (
                !/^(?:choices|speakerName|name|text|message|title|label|description|helpText|commandName)$/i.test(
                    field
                )
            )
                return;
            if (parseJsonSafely(value, value) !== value) return;
            this.entries.set(value, { text: value });
        });
    }

    async collectAdditionalTexts() {
        // Optional source tables beyond plugin parameters and event scripts.
    }

    collectCommandTexts(list = []) {
        for (let index = 0; index < (list || []).length; index++) {
            const command = list[index];
            if (
                command.code === 357 &&
                this.getSourcePluginNames().includes(command.parameters[0]?.split('/').pop())
            ) {
                this.collectParameterTexts(command.parameters[3]);
            }
            if (command.code === 355) {
                let script = command.parameters[0];
                while (list[index + 1]?.code === 655) script += '\n' + list[++index].parameters[0];
                if (!/["'`]/.test(script) || /^\s*CBR-/.test(script)) continue;
                try {
                    const catalog = this.extractCatalog(script);
                    for (const entry of catalog.entries)
                        if (!this.entries.has(entry.text)) this.entries.set(entry.text, entry);
                } catch (error) {
                    // Some shipped event branches contain incomplete scripts.
                    // One invalid branch must not suppress all other UI strings.
                    console.warn(`[${this.getPluginName()}] Cannot parse event script`, {
                        script,
                        error,
                    });
                }
            }
        }
    }

    buildPendingItems(runtime) {
        return [...this.entries.keys()].map((value, index) => ({
            type: this.getCacheType(),
            id: `cage_${index}`,
            value,
            cacheKey: runtime.getCacheKey(value, this.getCacheType()),
        }));
    }

    collectUntranslated({ runtime }) {
        this.prepareDynamicValueTag(runtime);
        return this.buildPendingItems(runtime).filter(
            (item) => !runtime.hasUsableCacheValue(item.cacheKey)
        );
    }

    getCachedCountsSync({ runtime }) {
        const total = this.entries.size;
        const left = this.collectUntranslated({ runtime }).length;
        return { total, left, totalStrings: total, leftStrings: left };
    }

    resolveText(text, runtime, depth = 0, allowFragments = true) {
        if (!this.isUsableText(text) || !this.isRuntimeTranslationActive(runtime)) return text;
        this.prepareDynamicValueTag(runtime);
        if (this.entries.has(text)) return this.resolveRuntimeTranslation(text, runtime);
        if (depth < 2)
            for (const entry of this.templates) {
                const match = entry.pattern.exec(text);
                if (!match) continue;
                const translated = this.resolveRuntimeTranslation(entry.text, runtime);
                if (translated === entry.text) continue;
                return translated.replace(/\\COT\[(\d+)\]/g, (_, index) =>
                    this.resolveText(match[Number(index) + 1] ?? '', runtime, depth + 1)
                );
            }
        if (allowFragments && this.fragmentPattern)
            return text.replace(this.fragmentPattern, (source) =>
                this.resolveRuntimeTranslation(source, runtime)
            );
        return text;
    }

    hookDrawing(prototype, name) {
        const original = prototype[name];
        const translator = this;
        prototype[name] = function (text, ...args) {
            if (translator.drawing) return original.call(this, text, ...args);
            const translated = translator.resolveText(text, translator.getRuntime());
            translator.drawing++;
            try {
                return original.call(this, translated, ...args);
            } finally {
                translator.drawing--;
            }
        };
    }

    prepareDynamicValueTag(runtime) {
        if (this.tagEngine === runtime.engine) return;
        this.registerPluginCustomTags([DYNAMIC_VALUE_TAG]);
        this.tagEngine = runtime.engine;
    }

    enablePluginTranslation() {
        if (
            typeof window.Window_Base?.prototype.drawText !== 'function' ||
            typeof window.Window_Base?.prototype.drawTextEx !== 'function' ||
            typeof window.Bitmap?.prototype.drawText !== 'function' ||
            typeof window.Game_Message?.prototype.add !== 'function' ||
            typeof window.Window_Message?.prototype.startMessage !== 'function'
        )
            return false;
        this.prepareDynamicValueTag(this.getRuntime());
        // Core drawTextEx uses Bitmap.drawText for individual glyphs. The shared
        // drawing guard prevents translating those glyphs a second time.
        this.hookDrawing(window.Window_Base.prototype, 'drawText');
        this.hookDrawing(window.Window_Base.prototype, 'drawTextEx');
        this.hookDrawing(window.Bitmap.prototype, 'drawText');
        const translator = this;
        for (const method of ['flushTextState', 'processNormalCharacter']) {
            const original = window.Window_Base.prototype[method];
            if (typeof original !== 'function') continue;
            window.Window_Base.prototype[method] = function (...args) {
                // Message rendering also flushes glyph buffers asynchronously,
                // outside drawTextEx. They already belong to the translated text.
                translator.drawing++;
                try {
                    return original.apply(this, args);
                } finally {
                    translator.drawing--;
                }
            };
        }
        const add = window.Game_Message.prototype.add;
        window.Game_Message.prototype.add = function (text) {
            const runtime = translator.getRuntime();
            const translated = translator.resolveText(text, runtime, 0, false);
            if (translated !== text) {
                // Feed the standard message pipeline without replacing source
                // buffers or letting translated dialogue become a new source key.
                const key = runtime.getMessageCacheKey(text, { hasPortrait: !!this.faceName() });
                runtime.setCacheValue(key, translated, { persist: false, notify: false });
            }
            return add.apply(this, arguments);
        };
        const start = window.Window_Message.prototype.startMessage;
        window.Window_Message.prototype.startMessage = function (...args) {
            const message = window.$gameMessage;
            const sourceTexts = message._texts;
            const source = sourceTexts.join('\n');
            const translated = translator.resolveText(source, translator.getRuntime(), 0, false);
            if (translated !== source) message._texts = translated.split('\n');
            try {
                return start.apply(this, args);
            } finally {
                message._texts = sourceTexts;
            }
        };
        this.precomputeCounts().catch((error) =>
            console.error(`[${this.getPluginName()}] Catalog scan failed`, error)
        );
        return true;
    }
}
