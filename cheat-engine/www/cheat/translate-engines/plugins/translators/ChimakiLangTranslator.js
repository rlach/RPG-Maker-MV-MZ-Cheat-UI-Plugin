import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { parseCsvTable } from './TranslatorHelpers.js';
import { readJavaScriptLiteralData } from './JavaScriptTextCatalog.js';
import { TAG_TYPE, TAG_STYLE, TAG_BRACKET } from '../../ai-engine/constants.js';

/** Chimaki_Lang v1.2, MZ (RJ01610733). The CSV's default-language column
 * owns canonical text; its tw column contains Japanese in this game. Expand
 * references before collection/layout, never rewrite IDs, dictionaries or saves.
 */
export class ChimakiLangTranslator extends SourceTextCatalogTranslator {
    constructor() {
        super();
        this.dictionary = new Map();
        this.translatedSources = new Map();
    }
    getPluginName() {
        return 'Chimaki_Lang';
    }
    getPluginLabel() {
        return 'Chimaki CSV localization';
    }
    getCacheType() {
        return 'plugin_chimaki_lang';
    }
    getSourcePluginNames() {
        return ['Keke_MenuSkin'];
    }
    shouldScanEventData() {
        return false;
    }

    registerPluginCustomTags(tags = []) {
        return super.registerPluginCustomTags([
            ...tags,
            {
                tagSymbol: 'T',
                type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
                style: TAG_STYLE.ESCAPE,
                bracket: TAG_BRACKET.SQUARE,
                maskValue: true,
                requiredConsistency: true,
                description: 'Unresolved Chimaki CSV reference. Preserve the lookup ID exactly.',
            },
        ]);
    }

    sourceText(text) {
        if (typeof text !== 'string') return text;
        let result = this.translatedSources.get(text) ?? text;
        result = result.replaceAll(String.fromCharCode(27), '\\');
        for (let depth = 0; depth < 8; depth++) {
            const next = result.replace(
                /\\+T\[(\w+)\]/gi,
                (reference, id) => this.dictionary.get(id) ?? reference
            );
            if (next === result) break;
            result = next;
        }
        return result;
    }

    async collectAdditionalTexts() {
        const parameters = this.findPluginEntry(this.getPluginName()).parameters;
        const { bindings } = readJavaScriptLiteralData(
            `const files = ${parameters.loadfileName || "['UI']"};`,
            ['files']
        );
        if (!Array.isArray(bindings.files)) throw new Error('Invalid Chimaki CSV file list');
        for (const file of bindings.files) {
            const response = await fetch(`csv/${file}.csv`);
            if (!response.ok)
                throw new Error(`Cannot read Chimaki CSV ${file}: ${response.status}`);
            const rows = parseCsvTable((await response.text()).replace(/^\uFEFF/, ''));
            const column = rows[0]
                ?.map((value) => value.trim())
                .indexOf(parameters.defaultLang || 'tw');
            if (!(column >= 2)) throw new Error(`Missing Chimaki source language in ${file}`);
            for (const row of rows.slice(1))
                if (row[0]?.trim() && this.isUsableText(row[column]))
                    this.dictionary.set(row[0].trim(), row[column]);
        }
        for (const value of this.dictionary.values()) {
            const text = this.sourceText(value);
            this.entries.set(text, { text });
        }
        for (const [key, entry] of this.entries) {
            const text = this.sourceText(key);
            if (text === key) continue;
            this.entries.delete(key);
            this.entries.set(text, {
                ...entry,
                text,
                parts: entry.parts?.map((part) => this.sourceText(part)),
            });
        }
    }

    normalizeTranslationEntry(entry) {
        return { ...entry, value: this.sourceText(entry.value) };
    }
    resolveMessageCacheSourceText({ text }) {
        return this.sourceText(text);
    }

    resolveText(text, runtime, ...args) {
        if (!this.isUsableText(text) || !this.isRuntimeTranslationActive(runtime)) return text;
        const source = this.sourceText(text);
        const translated = super.resolveText(source, runtime, ...args);
        if (translated !== source) this.translatedSources.set(translated, source);
        return translated;
    }

    resolveRuntimeTranslation(text, runtime, cacheType = this.getCacheType(), options = {}) {
        // Names Manager and ordinary database phases can own these translations.
        for (const type of ['actor_name', 'enemy_name', 'command']) {
            const key = runtime.getCacheKey(text, type);
            if (runtime.hasUsableCacheValue(key)) {
                runtime.trackCacheKeyUsage(key, { harvestMissing: false });
                return runtime.translationCache.get(key);
            }
        }
        return super.resolveRuntimeTranslation(text, runtime, cacheType, options);
    }

    enablePluginTranslation() {
        if (typeof window.Game_Message?.prototype.processLangChange !== 'function') return false;
        if (!super.enablePluginTranslation()) return false;
        const translator = this;
        const convert = window.Window_Base.prototype.convertEscapeCharacters;
        if (typeof convert === 'function') {
            window.Window_Base.prototype.convertEscapeCharacters = function (text) {
                const result = convert.apply(this, arguments);
                // Actor/variable expansion can introduce another CSV reference.
                // Resolve it before the text state measures or draws characters.
                if (!translator.isRuntimeTranslationActive(translator.getRuntime())) return result;
                const translated = translator.resolveText(result, translator.getRuntime());
                return translated === result ? result : convert.call(this, translated);
            };
        }
        const process = window.Game_Message.prototype.processLangChange;
        window.Game_Message.prototype.processLangChange = function (text) {
            if (!translator.isRuntimeTranslationActive(translator.getRuntime()))
                return process.apply(this, arguments);
            return translator.sourceText(text);
        };
        for (const [prototype, method] of [
            [window.Window_Command?.prototype, 'commandName'],
            [window.Window_Help?.prototype, 'setText'],
            [window.Game_Message.prototype, 'setSpeakerName'],
        ]) {
            if (typeof prototype?.[method] !== 'function') continue;
            const original = prototype[method];
            if (method === 'commandName') {
                prototype[method] = function (...args) {
                    return translator.resolveText(
                        original.apply(this, args),
                        translator.getRuntime()
                    );
                };
            } else {
                prototype[method] = function (text, ...args) {
                    return original.call(
                        this,
                        translator.resolveText(text, translator.getRuntime()),
                        ...args
                    );
                };
            }
        }
        const lookup = this.getRuntime().getMessageCacheLookupKeys;
        const runtime = this.getRuntime();
        runtime.getMessageCacheLookupKeys = function (text, options) {
            const keys = lookup.call(this, text, options);
            if (!translator.isRuntimeTranslationActive(this)) return keys;
            return [
                ...new Set([
                    ...keys,
                    this.getCacheKey(translator.sourceText(text), translator.getCacheType()),
                ]),
            ];
        };
        const canonical = runtime.getCanonicalSystemCommandName;
        runtime.getCanonicalSystemCommandName = function (name) {
            return canonical.call(
                this,
                translator.isRuntimeTranslationActive(this) ? translator.sourceText(name) : name
            );
        };
        this.precomputeCounts()
            .then(() => {
                // The title scene may have drawn before the asynchronous CSV scan.
                for (const window of globalThis.SceneManager?._scene?._windowLayer?.children || [])
                    window.refresh?.();
            })
            .catch((error) =>
                console.error('[ChimakiLangTranslator] Cannot refresh localized windows', error)
            );
        return true;
    }
}
