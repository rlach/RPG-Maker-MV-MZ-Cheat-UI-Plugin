import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { parseStructArraySafely } from './TranslatorHelpers.js';

/** Sakura_ShowChapterTitle v1.0.3 (MZ). Translate each line before title layout. */
export class SakuraShowChapterTitleTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'Sakura_ShowChapterTitle';
    }

    getCacheType() {
        return 'plugin_sakura_show_chapter_title';
    }

    collectSourceCatalog() {
        return { entries: [] };
    }

    collectMapTexts() {}

    collectCommandTexts(list = []) {
        for (const command of list || []) {
            const params = command.parameters;
            if (
                command.code !== 357 ||
                params[0]?.split('/').pop() !== this.getPluginName() ||
                params[1] !== 'showChapterTitle'
            )
                continue;
            for (const line of parseStructArraySafely(params[3]?.lines)) {
                if (this.isUsableText(line.text)) this.entries.set(line.text, { text: line.text });
            }
        }
    }

    enablePluginTranslation() {
        const manager = window.PluginManager;
        const key = `${this.getPluginName()}:showChapterTitle`;
        const original = manager?._commands?.[key];
        if (typeof original !== 'function') return false;
        const translator = this;
        manager._commands[key] = function (args, ...rest) {
            const runtime = translator.getRuntime();
            if (!translator.isRuntimeTranslationActive(runtime))
                return original.call(this, args, ...rest);
            const lines = parseStructArraySafely(args.lines).map((line) =>
                JSON.stringify({
                    ...line,
                    text: translator.resolveRuntimeTranslation(line.text, runtime),
                })
            );
            return original.call(this, { ...args, lines: JSON.stringify(lines) }, ...rest);
        };
        return true;
    }
}
