import { TAG_TYPE } from '../../ai-engine/constants.js';
import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

const PLUGIN_TAGS = [
    {
        description: 'Change font size',
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'FS',
        requiredConsistency: true,
    },
];

/**
 * LL_InfoPopupWIndow v1.1.1 (MZ): showMessage.messageText.
 * LL_InfoPopupWIndowMV v1.0.0 (MV): showWindow text in the second argument.
 * Scans map/common event commands and translates before popup width calculation.
 */
export class LLInfoPopupWIndowTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'LL_InfoPopupWIndow';
    }

    getPluginAliases() {
        return [this.getPluginName(), 'LL_InfoPopupWIndowMV'];
    }

    getPluginLabel() {
        return 'LL Info Popup Window';
    }

    getCacheType() {
        return 'plugin_ll_info_popup_window';
    }

    collectSourceCatalog() {
        return { entries: [] };
    }

    collectMapTexts() {
        // Map names are already handled by the standard map translation phase.
    }

    collectCommandTexts(list = []) {
        for (const command of list || []) {
            const args = command.parameters;
            if (command.code === 356) {
                const [name, action, text] = String(args[0] || '').split(' ');
                if (
                    name === 'LL_InfoPopupWIndowMV' &&
                    action === 'showWindow' &&
                    this.isUsableText(text)
                )
                    this.entries.set(text, { text });
                continue;
            }
            if (
                command.code !== 357 ||
                args[0]?.split('/').pop() !== this.getPluginName() ||
                args[1] !== 'showMessage'
            )
                continue;
            const text = args[3]?.messageText;
            if (this.isUsableText(text)) this.entries.set(text, { text });
        }
    }

    enablePluginTranslation() {
        if (this.findPluginEntry('LL_InfoPopupWIndowMV')?.status) {
            const prototype = window.Game_Interpreter?.prototype;
            if (typeof prototype?.pluginCommand !== 'function') return false;
            const original = prototype.pluginCommand;
            const translator = this;
            prototype.pluginCommand = function (command, args) {
                if (command !== 'LL_InfoPopupWIndowMV' || args[0] !== 'showWindow')
                    return original.apply(this, arguments);
                const runtime = translator.getRuntime();
                if (!translator.isRuntimeTranslationActive(runtime))
                    return original.apply(this, arguments);
                const translated = translator.resolveRuntimeTranslation(args[1], runtime);
                const translatedArgs = [...args];
                translatedArgs[1] = translated;
                return original.call(this, command, translatedArgs);
            };
            return true;
        }
        const manager = window.PluginManager;
        const key = `${this.getPluginName()}:showMessage`;
        const original = manager?._commands?.[key];
        if (typeof original !== 'function') return false;
        this.registerPluginCustomTags(PLUGIN_TAGS);
        const translator = this;
        manager._commands[key] = function (args) {
            const runtime = translator.getRuntime();
            const messageText = translator.isRuntimeTranslationActive(runtime)
                ? translator.resolveRuntimeTranslation(args.messageText, runtime)
                : args.messageText;
            return original.call(this, { ...args, messageText });
        };
        this.precomputeCounts().catch((error) =>
            console.error('[LLInfoPopupWIndowTranslator] Catalog scan failed', error)
        );
        return true;
    }
}
