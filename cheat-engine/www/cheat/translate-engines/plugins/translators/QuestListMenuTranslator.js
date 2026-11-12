import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { parseJsonSafely, walkNestedJsonLike } from './TranslatorHelpers.js';

/** Display-only support for QuestListMenu v9; quest switches stay unchanged. */
export class QuestListMenuTranslator extends SourceTextCatalogTranslator {
    constructor() {
        super();
        this.detailSources = new Map();
    }

    resolveText(text, runtime, ...args) {
        return super.resolveText(this.detailSources.get(text) ?? text, runtime, ...args);
    }

    getPluginName() {
        return 'QuestListMenu_v9';
    }
    getPluginLabel() {
        return 'Quest List Menu';
    }
    getCacheType() {
        return 'plugin_quest_list_menu';
    }
    shouldScanEventData() {
        return false;
    }
    collectParameterTexts(parameters) {
        walkNestedJsonLike(parameters, (value, { path }) => {
            if (typeof value !== 'string' || !value.trim()) return;
            const field = [...path].reverse().find((part) => !/^\d+$/.test(part));
            if (!['QuestName', 'QuestDetail', 'QuestLocation', 'MenuCommandName'].includes(field))
                return;
            const parsed = parseJsonSafely(value, value);
            if (parsed !== value) {
                if (field === 'QuestDetail' && typeof parsed === 'string') {
                    // The plugin strips the note quotes without JSON-decoding its
                    // doubled backslashes. Scan the decoded note, then map the
                    // actual drawTextEx argument back to that same cache key.
                    const displayed = value.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
                    const canonical = parsed.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
                    this.detailSources.set(displayed, canonical);
                    this.entries.set(canonical, { text: canonical });
                }
                return;
            }
            const text =
                field === 'QuestDetail'
                    ? value.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n')
                    : value;
            this.entries.set(text, { text });
        });
    }
}
