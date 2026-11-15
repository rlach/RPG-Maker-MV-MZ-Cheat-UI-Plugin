import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

export class RtkCompositeTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'RTK1_Composite';
    }
    getCacheType() {
        return 'plugin_rtk_composite';
    }
    getSourcePluginNames() {
        return [];
    }
    collectMapTexts() {}
    getTitleIndex(args) {
        if (args[0] === 'open') return 1;
        if (/^(?:shop|workroom)(?:-safe)?$/.test(args[0])) return 2;
        return -1;
    }
    getSourceTitle(args) {
        const index = this.getTitleIndex(args);
        if (index < 0) return '';
        return (args[index + 1] || args[index] || '').replace('%20', ' ');
    }
    collectCommandTexts(list = []) {
        const name =
            this.findPluginEntry(this.getPluginName())?.parameters?.['plugin command'] ||
            this.getPluginName();
        for (const command of list || []) {
            if (command.code !== 356) continue;
            const [plugin, ...args] = String(command.parameters[0]).split(' ');
            if (plugin !== name) continue;
            const text = this.getSourceTitle(args);
            if (this.isUsableText(text)) this.entries.set(text, { text });
        }
    }
    enablePluginTranslation() {
        const plugin = window.RTK?.CP;
        if (typeof plugin?.command !== 'function') return false;
        const translator = this;
        const wrap = (original) =>
            function (args, ...rest) {
                const runtime = translator.getRuntime();
                const text = translator.getSourceTitle(args);
                if (!text || !translator.isRuntimeTranslationActive(runtime))
                    return original.call(this, args, ...rest);
                const translated = translator.resolveRuntimeTranslation(
                    text,
                    runtime,
                    translator.getCacheType()
                );
                const index = translator.getTitleIndex(args);
                const displayArgs = [...args];
                displayArgs[index] = translated;
                displayArgs[index + 1] = translated;
                return original.call(this, displayArgs, ...rest);
            };
        const command = plugin._command || this.getPluginName();
        if (typeof window.RTK._calls?.[command] !== 'function') return false;
        window.RTK._calls[command] = wrap(window.RTK._calls[command]);
        plugin.command = wrap(plugin.command);
        return true;
    }
}
