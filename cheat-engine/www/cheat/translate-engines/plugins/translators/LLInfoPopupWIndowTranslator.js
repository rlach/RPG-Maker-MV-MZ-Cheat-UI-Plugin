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

/** LL_InfoPopupWIndow v1.1.1 (MZ). Scan showMessage payloads and translate before layout. */
export class LLInfoPopupWIndowTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'LL_InfoPopupWIndow';
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
