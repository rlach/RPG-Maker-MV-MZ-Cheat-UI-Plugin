import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { extractJavaScriptTextCatalog } from './JavaScriptTextCatalog.js';

/** HB case interfaces; source data and SNS routing names stay authoritative. */
export class HbCaseUiTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'HB_SNS';
    }
    getPluginLabel() {
        return 'HB menus, stats, SNS and result overlays';
    }
    getPluginAliases() {
        return [
            'HB_SNS',
            'HB_SceneMenu',
            'HB_HStatus',
            'HB_HparamWindows',
            'HB_HresultWindow',
            'HB_MapPlayerStatusWindow',
            'HB_WindowRelationshipGauge',
            'HB_Variables',
            'HB_Notifier',
            'HB_ChoiceUI',
        ];
    }
    getCacheType() {
        return 'plugin_hb_case_ui';
    }
    getCatalogCacheTypes() {
        return [this.getCacheType(), 'message'];
    }
    collectMapTexts() {}
    addText(text) {
        if (!this.isUsableText(text)) return;
        this.entries.set(text, { text });
        for (const line of text.split('\n'))
            if (line.trim()) this.entries.set(line, { text: line });
        if (/^[月火水木金土日]$/.test(text)) this.addText(text + '曜日');
    }
    collectCommandTexts(list = []) {
        super.collectCommandTexts(list);
        for (let i = 0; i < list.length; i++) {
            const command = list[i],
                p = command.parameters;
            if (command.code === 122 && p[3] === 4) {
                try {
                    for (const entry of extractJavaScriptTextCatalog(`const value = ${p[4]};`)
                        .entries) {
                        this.entries.set(entry.text, entry);
                        if (!entry.parts) this.addText(entry.text);
                    }
                } catch {
                    /* Ignore nonstandard event expressions without evaluating them. */
                }
            }
            if (command.code === 101) {
                const lines = [];
                while (list[i + 1]?.code === 401) lines.push(list[++i].parameters[0]);
                this.addText(lines.join('\n'));
            }
        }
    }
    async collectAdditionalTexts() {
        for (const entry of [...this.entries.values()]) if (!entry.parts) this.addText(entry.text);
    }
    resolveText(text, runtime, depth = 0, allowFragments = true) {
        if (!this.isUsableText(text) || !this.isRuntimeTranslationActive(runtime)) return text;
        // SNS posts can already have a standard message translation.
        const cached = this.resolveRuntimeTranslation(
            text,
            runtime,
            ['message', 'actor_name', 'map_name'],
            { harvestMissing: false }
        );
        if (cached !== text) return cached;
        return super.resolveText(text, runtime, depth, allowFragments);
    }
    enablePluginTranslation() {
        if (!super.enablePluginTranslation()) return false;
        const translator = this;
        const base = window.Window_Base.prototype;
        if (typeof base.convertEscapeCharacters === 'function') {
            const convert = base.convertEscapeCharacters;
            base.convertEscapeCharacters = function (text, ...args) {
                const converted = convert.call(this, text, ...args);
                if (typeof converted !== 'string') return converted;
                // HB uses temporary variables to supply display strings. Resolve
                // them after native expansion; no variable values are rewritten.
                const source = converted.split(String.fromCharCode(27)).join('\\');
                const result = translator.resolveText(source, translator.getRuntime());
                return result === source
                    ? converted
                    : result.split('\\').join(String.fromCharCode(27));
            };
        }
        const phone = window.Scene_SNS?.prototype;
        if (typeof phone?.loadSnsContents === 'function') {
            const load = phone.loadSnsContents;
            phone.loadSnsContents = function (topic, ...args) {
                const runtime = translator.getRuntime();
                if (
                    !translator.isRuntimeTranslationActive(runtime) ||
                    !Array.isArray(topic?._posts)
                )
                    return load.call(this, topic, ...args);
                const copy = Object.assign(Object.create(Object.getPrototypeOf(topic)), topic);
                copy._posts = topic._posts.map((post) => {
                    if (post.type !== 'text' || !Array.isArray(post.content?.texts)) return post;
                    const source = post.content.texts.join('\n');
                    const translated = translator.resolveText(source, runtime, 0, false);
                    if (translated === source) return post;
                    const texts = translated.split('\n');
                    return Object.assign(Object.create(Object.getPrototypeOf(post)), post, {
                        content: { ...post.content, texts },
                        height: 50 + 20 * texts.length,
                    });
                });
                return load.call(this, copy, ...args);
            };
        }
        return true;
    }
}
