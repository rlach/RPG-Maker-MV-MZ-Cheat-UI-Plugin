import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/**
 * ekus XoMgrSentence v1.0 (MV), Japanese sentence table (RJ01554226).
 * SetSentenceList rotates scene text through variables starting at 501. Scan
 * the authored Japanese table and resolve variable references to its entries
 * at presentation/cache lookup time, preserving logic-owned variable values.
 * Also scans Xo character/UI tables and external .xos/.xoes scenarios. Scenario
 * actor macros follow cMgrEvent.SendLine and Common Event 123's line assembly.
 */
export class XoMgrSentenceTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'XoMgrSentence';
    }
    getPluginLabel() {
        return 'Xo sentence tables';
    }
    getCacheType() {
        return 'plugin_xo_sentence';
    }
    getSourcePluginNames() {
        return [
            ...new Set([
                'XoMgrSentence_J',
                'XoVar_J',
                '111_InputForm',
                ...(window.$plugins || [])
                    .filter(
                        (plugin) =>
                            plugin.status && /^(?:XoMgrWindow|XoWindow|XoUi)/.test(plugin.name)
                    )
                    .map((plugin) => plugin.name),
            ]),
        ];
    }
    shouldScanEventData() {
        return false;
    }

    collectScenarioText(source) {
        const actors = {
            主人公: 1,
            相手: 2,
            名前: 2,
            呼名: 3,
            男性器: 6,
            女性器: 9,
            精液: 12,
            私: 13,
        };
        for (const line of source.split(/\r?\n/)) {
            const parts = line.replace(/^\u3000+/, '').split('/');
            if (parts[0] !== '文章') continue;
            const text = parts
                .slice(2)
                .join('\n')
                .replace(/\[([^\]]+)\]/g, (match, name) =>
                    actors[name] ? `\\n[${actors[name]}]` : match
                );
            if (this.isUsableText(text)) this.entries.set(text, { text });
        }
    }

    async collectAdditionalTexts() {
        const fs = require('fs');
        const path = require('path');
        const root = path.join(path.dirname(process.mainModule.filename), 'sinario');
        const visit = async (directory) => {
            for (const entry of await fs.promises.readdir(directory, { withFileTypes: true })) {
                const filename = path.join(directory, entry.name);
                if (entry.isDirectory()) await visit(filename);
                else if (/\.xo(?:e)?s$/i.test(entry.name))
                    this.collectScenarioText(await fs.promises.readFile(filename, 'utf8'));
            }
        };
        await visit(root);
    }

    sourceText(text) {
        if (typeof text !== 'string') return text;
        return text.replace(/\\V\[(\d+)\]/gi, (reference, id) => {
            const value = window.$gameVariables?._data?.[Number(id)];
            return typeof value === 'string' && this.entries.has(value) ? value : reference;
        });
    }

    resolveMessageCacheSourceText(context = {}) {
        if (context.mode === 'collection' || !this.isRuntimeTranslationActive(context.runtime))
            return null;
        return this.sourceText(context.text);
    }

    resolveText(text, runtime, ...args) {
        if (!this.isRuntimeTranslationActive(runtime)) return text;
        return super.resolveText(this.sourceText(text), runtime, ...args);
    }

    cacheMessageTranslation(text, message, runtime = this.getRuntime()) {
        // Warm the concrete source key, never a rotating variable reference.
        return super.cacheMessageTranslation(this.sourceText(text), message, runtime);
    }

    enablePluginTranslation() {
        if (typeof window.Window_Base?.prototype.convertEscapeCharacters !== 'function')
            return false;
        if (!super.enablePluginTranslation()) return false;
        const translator = this;
        const runtime = this.getRuntime();
        // Variable expansion and DTextPicture happen inside conversion, after
        // drawTextEx has entered its per-glyph drawing guard.
        const convert = window.Window_Base.prototype.convertEscapeCharacters;
        window.Window_Base.prototype.convertEscapeCharacters = function (text) {
            return convert.call(this, translator.resolveText(text, translator.getRuntime()));
        };
        const interpreter = window.Game_Interpreter?.prototype;
        if (typeof interpreter?.pluginCommand === 'function') {
            const command = interpreter.pluginCommand;
            interpreter.pluginCommand = function (name, args) {
                if (name === 'D_TEXT')
                    args = args.map((text) =>
                        translator.resolveText(text, translator.getRuntime())
                    );
                return command.call(this, name, args);
            };
        }
        if (typeof interpreter?._inputForm === 'function') {
            const inputForm = interpreter._inputForm;
            interpreter._inputForm = function (...args) {
                const result = inputForm.apply(this, args);
                for (const button of document.querySelectorAll('input[id="_111_submit"]'))
                    button.value = translator.resolveText(button.value, translator.getRuntime());
                return result;
            };
        }
        const lookup = runtime.getMessageCacheLookupKeys;
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
        return true;
    }
}
