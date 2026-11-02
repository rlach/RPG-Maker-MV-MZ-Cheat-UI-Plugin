import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { TAG_TYPE, TAG_STYLE, TAG_BRACKET } from '../../ai-engine/constants.js';

/**
 * DKTools_Localization v1.1.2 (MZ, also supports its MV-compatible API).
 * Load the active locale's merged JSON dictionary through the plugin API, including
 * nested objects/arrays. Braces are localization references, not display text.
 * Never modify dictionary keys, saved locale, or the plugin's own lookup cache.
 */
export class DKToolsLocalizationTranslator extends SourceTextCatalogTranslator {
    constructor() {
        super();
        this.translatedSources = new Map();
        this.commandReferences = new Map();
        this.messageSourceDepth = 0;
    }

    getPluginName() {
        return 'DKTools_Localization';
    }

    getPluginLabel() {
        return 'DKTools Localization';
    }

    getCacheType() {
        return 'plugin_dktools_localization';
    }

    registerPluginCustomTags() {
        this.getRuntime().engine.addPluginTags(this.getPluginName(), [
            {
                tagSymbol: 'VAR',
                type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
                style: TAG_STYLE.ESCAPE,
                bracket: TAG_BRACKET.SQUARE,
                requiredConsistency: true,
                description: 'DKTools localized game variable value. Preserve the variable ID.',
            },
            {
                tagSymbol: 'LANGUAGE',
                type: TAG_TYPE.WITHOUT_PARAMETER,
                style: TAG_STYLE.ESCAPE,
                requiredConsistency: true,
                description: 'DKTools current language display name.',
            },
        ]);
    }

    localizeSource(text) {
        const localization = window.DKTools.Localization;
        const data = localization._data;
        if (!data) return String(text);
        const depth = Number(this.findPluginEntry()?.parameters?.['Parse Depth']) || 3;
        let result = String(text);
        // Expand only dictionary references, leaving \VAR IDs for the tag manager.
        // Use the same lodash path lookup as DKTools (nested objects and arrays).
        for (let index = 0; index < depth; index++) {
            // Wrapping a translated reference may introduce newlines. DKTools'
            // single-line regex misses those pairs and leaks braces on screen.
            const next = result.replace(/\{([^{}]*)\}/g, (_, key) => {
                const value = Object.prototype.hasOwnProperty.call(data, key)
                    ? data[key]
                    : window._.get(data, key);
                return typeof value === 'string' ? value : key;
            });
            if (next === result) break;
            result = next;
        }
        return result;
    }

    async buildCatalog() {
        const localization = window.DKTools.Localization;
        const locale = localization.locale;
        const data = localization._data || (await localization._loadData(locale));
        this.entries.clear();
        this.commandReferences.clear();
        const visit = (value, path = []) => {
            if (typeof value === 'string') {
                const text = this.localizeSource(value);
                if (this.isUsableText(text)) {
                    this.entries.set(text, { text });
                    if (!this.commandReferences.has(text))
                        this.commandReferences.set(text, new Set());
                    this.commandReferences.get(text).add(`{${path.join('.')}}`);
                }
            } else if (value && typeof value === 'object') {
                for (const [key, child] of Object.entries(value)) visit(child, [...path, key]);
            }
        };
        visit(data);
    }

    resolveMessageCacheSourceText({ text }) {
        const localization = window.DKTools?.Localization;
        if (!localization?._data) return null;
        const suffix = text.match(/\n+$/)?.[0] || '';
        const source =
            this.translatedSources.get(text) ??
            (suffix && this.translatedSources.has(text.slice(0, -suffix.length))
                ? this.translatedSources.get(text.slice(0, -suffix.length)) + suffix
                : text);
        return this.localizeSource(source);
    }

    enablePluginTranslation() {
        const localization = window.DKTools?.Localization;
        const runtime = this.getRuntime();
        if (
            typeof localization?.getText !== 'function' ||
            typeof localization?._loadData !== 'function' ||
            !localization._data ||
            !runtime
        )
            return false;

        const translator = this;
        this.originalGetText = localization.getText;
        const original = this.originalGetText;
        localization.getText = function (text) {
            // DK resolves each Game_Message.add line separately. Keep these lines
            // in the source language until the standard pipeline translates the
            // complete speaker + body, rather than harvesting a mixed message.
            if (translator.messageSourceDepth && translator.isRuntimeTranslationActive(runtime))
                return translator.localizeSource(text);
            const nativeText = original.call(this, text);
            if (!translator.isRuntimeTranslationActive(runtime)) return nativeText;
            // Plain already-translated output must not become another source entry.
            if (translator.translatedSources.has(String(text))) return nativeText;
            const source = translator.localizeSource(text);
            if (!translator.entries.has(source)) return original.call(this, source);
            const translated = translator.resolveRuntimeTranslation(source, runtime);
            // Apply the plugin's reference semantics to legacy cache translations too.
            const result = original.call(this, translator.localizeSource(translated));
            if (result !== source) translator.translatedSources.set(result, source);
            return result;
        };

        const messagePrototype = window.Game_Message?.prototype;
        if (typeof messagePrototype?.add === 'function') {
            const add = messagePrototype.add;
            messagePrototype.add = function (...args) {
                translator.messageSourceDepth++;
                try {
                    return add.apply(this, args);
                } finally {
                    translator.messageSourceDepth--;
                }
            };
        }
        const canonicalCommand = runtime.getCanonicalSystemCommandName;
        if (typeof canonicalCommand === 'function') {
            runtime.getCanonicalSystemCommandName = function (name) {
                const canonical = canonicalCommand.call(this, name);
                if (!translator.isRuntimeTranslationActive(this) || canonical !== name)
                    return canonical;
                const source = translator.translatedSources.get(name) ?? name;
                const references = translator.commandReferences.get(source);
                for (const reference of references || [])
                    if (this.hasUsableCacheValue(this.getCacheKey(reference, 'command')))
                        return reference;
                return references?.size === 1 ? [...references][0] : source;
            };
        }

        // Messages translated by getText still use their source key in Seen and
        // the foreground queue. Include the dictionary cache in normal lookup.
        const lookup = runtime.getMessageCacheLookupKeys;
        runtime.getMessageCacheLookupKeys = function (text, options) {
            const keys = lookup.call(this, text, options);
            if (!translator.isRuntimeTranslationActive(this)) return keys;
            return [...new Set([...keys, this.getCacheKey(text, translator.getCacheType())])];
        };
        const loadData = localization.loadData;
        if (typeof loadData === 'function') {
            localization.loadData = async function (...args) {
                const result = await loadData.apply(this, args);
                translator.scanPromise = null;
                translator.translatedSources.clear();
                await translator.precomputeCounts();
                return result;
            };
        }
        this.precomputeCounts().catch((error) =>
            console.error('[DKToolsLocalizationTranslator] Dictionary scan failed', error)
        );
        return true;
    }
}
