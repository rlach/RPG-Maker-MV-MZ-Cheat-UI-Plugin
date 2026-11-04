import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/**
 * TMCard 0.1.7b (MV), RJ312010.
 * Catalog display parameters, source UI literals, battle message templates and
 * opponent names from event commands. Shared drawing hooks leave card IDs,
 * costs, deck composition and picture filenames unchanged.
 */
export class TMCardTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'TMCard';
    }
    getPluginLabel() {
        return 'TM Card battles and decks';
    }
    getCacheType() {
        return 'plugin_tm_card';
    }

    collectParameterTexts(parameters) {
        for (const key of [
            'commandDeckEdit',
            'paramNames',
            'itemCardParamNames',
            'rareNames',
            'positionNames',
            'itemCardPositionName',
            'deckNames',
        ]) {
            const value = parameters?.[key];
            if (!this.isUsableText(value)) continue;
            const texts = key.endsWith('Names') ? value.split(' ') : [value];
            for (const text of texts) if (this.isUsableText(text)) this.entries.set(text, { text });
        }
    }

    collectSourceCatalog(source) {
        // Type 0 queues displayed text; other types queue numeric animations.
        // Adapt only the scanner input to its standard display-call grammar.
        return super.collectSourceCatalog(source.replace(/\.addMessage\(\s*0\s*,/g, '.setText('));
    }

    collectCommandTexts(list) {
        for (const command of list || []) {
            if (command?.code !== 356) continue;
            const parts = String(command.parameters?.[0] || '').split(' ');
            if (!['startCardBattle', 'startDeckSelect'].includes(parts[0])) continue;
            const text = parts[1];
            if (this.isUsableText(text)) this.entries.set(text, { text });
        }
    }
}
