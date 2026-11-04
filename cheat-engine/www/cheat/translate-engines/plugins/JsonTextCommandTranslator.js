import { SourceTextCatalogTranslator } from './SourceTextCatalogTranslator.js';
import { parseJsonSafely } from './translators/TranslatorHelpers.js';

/** Shared collection and pre-layout translation for JSON text command arguments. */
export class JsonTextCommandTranslator extends SourceTextCatalogTranslator {
    getSourcePluginNames() {
        // Text lives in event arguments, not the obfuscated implementation.
        return [];
    }

    collectCommandTexts(list = []) {
        for (const command of list) {
            const [plugin, name, , args] = command.parameters || [];
            if (
                command.code !== 357 ||
                plugin !== this.getPluginName() ||
                name !== this.getTextCommandName()
            )
                continue;
            const text = parseJsonSafely(args?.['text:json']);
            if (this.isUsableText(text)) this.entries.set(text, { text });
        }
    }

    enablePluginTranslation() {
        if (typeof window.PluginManager?.callCommand !== 'function') return false;
        const callCommand = window.PluginManager.callCommand;
        const translator = this;
        window.PluginManager.callCommand = function (self, plugin, command, args) {
            if (
                plugin === translator.getPluginName() &&
                command === translator.getTextCommandName()
            ) {
                const text = parseJsonSafely(args?.['text:json']);
                if (translator.isUsableText(text)) {
                    const translated = translator.resolveRuntimeTranslation(
                        text,
                        translator.getRuntime(),
                        translator.getCacheType(),
                        { requireRuntimeTranslationActive: true }
                    );
                    if (translated !== text)
                        args = { ...args, 'text:json': JSON.stringify(translated) };
                }
            }
            return callCommand.call(this, self, plugin, command, args);
        };
        return true;
    }
}
