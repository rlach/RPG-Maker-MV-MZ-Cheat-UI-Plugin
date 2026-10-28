import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/** SoR GabWindow MZ Right v1.32. Translate PushGab lines before layout. */
export class SoRGabWindowTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'SoR_GabWindow_MZ_Right';
    }
    getCacheType() {
        return 'plugin_sor_gab_window';
    }
    collectSourceCatalog() {
        return { entries: [] };
    }
    collectParameterTexts() {}
    collectCommandTexts(list = []) {
        for (const command of list) {
            const [plugin, name, , args] = command.parameters || [];
            if (command.code !== 357 || plugin !== this.getPluginName() || name !== 'PushGab')
                continue;
            for (const text of (args?.arg1 || '').split('|')) {
                if (this.isUsableText(text)) this.entries.set(text, { text });
            }
        }
    }
    enablePluginTranslation() {
        if (typeof window.PluginManager?.callCommand !== 'function') return false;
        const original = window.PluginManager.callCommand;
        const translator = this;
        window.PluginManager.callCommand = function (self, plugin, command, args) {
            if (
                plugin === translator.getPluginName() &&
                command === 'PushGab' &&
                typeof args?.arg1 === 'string'
            ) {
                args = {
                    ...args,
                    arg1: args.arg1
                        .split('|')
                        .map((text) =>
                            translator.resolveRuntimeTranslation(
                                text,
                                translator.getRuntime(),
                                translator.getCacheType(),
                                { requireRuntimeTranslationActive: true }
                            )
                        )
                        .join('|'),
                };
            }
            return original.call(this, self, plugin, command, args);
        };
        return true;
    }
}
