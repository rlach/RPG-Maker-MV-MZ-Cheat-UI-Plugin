import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { parseJsonSafely, parseStructArraySafely } from './TranslatorHelpers.js';
import { collectEventCommandEntries } from '../../../js/EventCommandTraversal.js';
import { isOriginalTextResourceRequired } from '../TextResourceTranslationContext.js';
import { readJavaScriptLiteralData } from './JavaScriptTextCatalog.js';
import { setNativeTextSourceResolver } from '../../../js/translation-runtime/NativeI18nSource.js';

export function normalizeMuuiText(text) {
    return typeof text === 'string'
        ? text.replace(/(\[c=#[0-9a-f]+\])|#([^#$\n]+)#/gi, (_, color, value) => color || value)
        : text;
}

/** BY MUUI 2.1 / MUUI_Localization (MZ): original UI JSON, locale keys and
 * author event display scripts. Images and identifiers are never translated.
 */
export class MuuiLocalizationTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'MUUI_Localization';
    }
    getCacheType() {
        return 'plugin_muui';
    }
    getSourcePluginNames() {
        return [
            'BY_GTMenus',
            'BY_GTMM',
            'BY_Toast',
            'BY_Choice',
            'BY_MoreInfo',
            'BY_MessageWindow',
        ];
    }
    shouldScanEventData() {
        return false;
    }
    collectParameterTexts() {}
    constructor() {
        super();
        this.sourceAliases = new Map();
        this.displayOrigins = new Map();
        this.primarySources = {};
    }
    addSource(text, cacheType = this.getCacheType()) {
        text = this.normalizeSource(text);
        if (!this.isUsableText(text) || !/\p{L}/u.test(text) || /^(?:img|audio)\//.test(text))
            return;
        const parts = text.split(
            /\$[VSAGCJ](?:\([^)]*\))?(?:\.[\w]+)?|\{\$\w+\}|\[(?:c=#[0-9a-f]+|c=\d+|\/c|size=\d+|\/size|img=[^\]]+|br)\]/gi
        );
        if (parts.length > 1) {
            // Pure bindings and numbers have no independent translation identity.
            if (!parts.join('').trim()) return;
            text = parts
                .map((part, index) => part + (index < parts.length - 1 ? `\\COT[${index}]` : ''))
                .join('');
        }
        if (!this.entries.has(text) || cacheType !== this.getCacheType())
            this.entries.set(text, { text, cacheType, ...(parts.length > 1 ? { parts } : {}) });
    }
    collectSourceCatalog(source, pluginName) {
        const catalog = super.collectSourceCatalog(source);
        const thoughts = new Set(
            pluginName === 'BY_GTMM'
                ? readJavaScriptLiteralData(source, [])
                      .objects.filter(
                          (object) =>
                              object &&
                              Object.keys(object).length === 1 &&
                              typeof object.text === 'string'
                      )
                      .map((object) => normalizeMuuiText(object.text))
                : []
        );
        return {
            entries: catalog.entries.map((entry) => ({
                ...entry,
                text: normalizeMuuiText(entry.text),
                parts: entry.parts?.map(normalizeMuuiText),
                ...(thoughts.has(normalizeMuuiText(entry.text)) ? { cacheType: 'message' } : {}),
            })),
        };
    }
    collectSourceData(value, file = '') {
        if (!value || typeof value !== 'object') return;
        if (file.startsWith('data/locales/')) {
            for (const [key, translated] of Object.entries(value)) {
                const canonical = normalizeMuuiText(this.primarySources[key] || key);
                this.addSource(canonical);
                this.sourceAliases.set(normalizeMuuiText(key), canonical);
                if (
                    typeof translated === 'string' &&
                    translated &&
                    !this.sourceAliases.has(translated)
                )
                    this.sourceAliases.set(normalizeMuuiText(translated), canonical);
            }
            return;
        }
        if (Array.isArray(value)) {
            for (const row of value) this.collectSourceData(row, file);
            return;
        }
        if (['text', 'rich-text'].includes(value.type)) this.addSource(value.content);
        if (Array.isArray(value.list)) {
            for (const entry of collectEventCommandEntries(value.list))
                this.addSource(entry.value, entry.type === 'speaker' ? 'actor_name' : entry.type);
            for (let index = 0; index < value.list.length; index++) {
                const command = value.list[index];
                if (command.code !== 355) continue;
                let script = command.parameters[0];
                while (value.list[index + 1]?.code === 655)
                    script += '\n' + value.list[++index].parameters[0];
                for (const entry of this.extractCatalog(script).entries)
                    this.entries.has(normalizeMuuiText(entry.text)) ||
                        this.entries.set(normalizeMuuiText(entry.text), {
                            ...entry,
                            text: normalizeMuuiText(entry.text),
                            parts: entry.parts?.map(normalizeMuuiText),
                        });
            }
        }
        for (const [key, child] of Object.entries(value)) {
            if (key === 'list') continue;
            if (['script', 'code'].includes(key) && typeof child === 'string') {
                for (const entry of this.extractCatalog(child).entries)
                    this.entries.has(normalizeMuuiText(entry.text)) ||
                        this.entries.set(normalizeMuuiText(entry.text), {
                            ...entry,
                            text: normalizeMuuiText(entry.text),
                            parts: entry.parts?.map(normalizeMuuiText),
                        });
            } else if (child && typeof child === 'object') this.collectSourceData(child, file);
        }
    }
    async readSourceFiles() {
        const fs = require('fs');
        const path = require('path');
        const roots = [path.dirname(process.mainModule.filename), process.cwd()];
        const root = roots
            .flatMap((base) => [base, path.join(base, 'www')])
            .find((base) => fs.existsSync(path.join(base, 'data/MUUI')));
        if (!root) throw new Error('Cannot locate original MUUI data');
        const files = [];
        const walk = async (directory) => {
            for (const entry of await fs.promises.readdir(path.join(root, directory), {
                withFileTypes: true,
            })) {
                const file = directory + '/' + entry.name;
                if (entry.isDirectory()) await walk(file);
                else if (entry.name.endsWith('.json'))
                    files.push({
                        file,
                        data: parseJsonSafely(
                            await fs.promises.readFile(path.join(root, file), 'utf8')
                        ),
                    });
            }
        };
        await walk('data/MUUI');
        await walk('data/locales');
        if (fs.existsSync(path.join(root, 'data/quicklist_configs')))
            await walk('data/quicklist_configs');
        for (const file of await fs.promises.readdir(path.join(root, 'data'))) {
            if (/^(?:CommonEvents|Map\d+|Items|Actors|BY_Toast|MUUI_liv)\.json$/.test(file))
                files.push({
                    file: 'data/' + file,
                    data: parseJsonSafely(
                        await fs.promises.readFile(path.join(root, 'data', file), 'utf8')
                    ),
                });
        }
        return files;
    }
    async collectAdditionalTexts() {
        const files = await this.readSourceFiles();
        const locale =
            this.findPluginEntry(this.getPluginName())?.parameters?.DefaultLocale || 'zh';
        this.primarySources =
            files.find(({ file }) => file === `data/locales/${locale}.json`)?.data || {};
        const events = files.find(({ file }) => file === 'data/CommonEvents.json')?.data || [];
        const variants = new Set();
        const rules = this.findPluginEntry('BY_CommonEventLocale')?.parameters;
        if (rules?.Enabled !== 'false')
            for (const rule of parseStructArraySafely(rules?.Rules)) {
                const source = collectEventCommandEntries(
                    events[Number(rule.SourceEvent)]?.list || []
                );
                for (const replacement of parseStructArraySafely(rule.Replacements)) {
                    const id = Number(replacement.ReplacementEvent);
                    variants.add(id);
                    const target = collectEventCommandEntries(events[id]?.list || []);
                    if (
                        source.length !== target.length ||
                        source.some((entry, index) => entry.type !== target[index].type)
                    )
                        continue;
                    target.forEach((entry, index) => {
                        const value = normalizeMuuiText(entry.value);
                        if (!this.sourceAliases.has(value))
                            this.sourceAliases.set(value, normalizeMuuiText(source[index].value));
                    });
                }
            }
        for (const { file, data } of files)
            this.collectSourceData(
                file === 'data/CommonEvents.json'
                    ? data.filter((event, index) => !variants.has(index))
                    : data,
                file
            );
        setNativeTextSourceResolver(this.getPluginName(), (text) => this.normalizeSource(text));
    }
    normalizeSource(text) {
        const source = normalizeMuuiText(text);
        return this.displayOrigins.get(source) || this.sourceAliases.get(source) || source;
    }
    normalizeTranslationEntry(entry) {
        return { ...entry, value: this.normalizeSource(entry.value) };
    }
    resolveMessageCacheSourceText({ text }) {
        return this.normalizeSource(text);
    }
    resolveText(text, runtime, depth = 0, allowFragments = true) {
        if (!this.isRuntimeTranslationActive(runtime)) return text;
        const source = this.normalizeSource(text);
        const translated = super.resolveText(source, runtime, depth, allowFragments);
        if (translated !== source) {
            this.displayOrigins.set(translated, source);
            if (this.displayOrigins.size > 4096)
                this.displayOrigins.delete(this.displayOrigins.keys().next().value);
        }
        return translated;
    }
    cacheMessageTranslation(text, message, runtime = this.getRuntime()) {
        const source = this.normalizeSource(text);
        if (!['message', 'message_portrait'].includes(this.entries.get(source)?.cacheType)) return;
        super.cacheMessageTranslation(source, message, runtime);
    }
    enablePluginTranslation() {
        const localization = window.MUUI_Localization;
        if (typeof localization?.getText !== 'function') return false;
        if (!super.enablePluginTranslation()) return false;
        const translator = this;
        const getText = localization.getText;
        localization.getText = function (text, ...args) {
            const native = getText.call(this, text, ...args);
            const runtime = translator.getRuntime();
            if (
                isOriginalTextResourceRequired() ||
                !translator.isRuntimeTranslationActive(runtime) ||
                typeof native !== 'string' ||
                /^(?:img|audio)\//.test(native)
            )
                return native;
            const source = translator.normalizeSource(text);
            const translated = translator.resolveText(source, runtime);
            return translated !== source ? translated : translator.resolveText(native, runtime);
        };
        return true;
    }
}
