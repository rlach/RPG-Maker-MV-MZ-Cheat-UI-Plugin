import { it, expect, vi } from 'vitest';
import { QuestListMenuTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/QuestListMenuTranslator.js';

it('collects nested quest display fields without switch identifiers', () => {
    const translator = new QuestListMenuTranslator();
    translator.collectParameterTexts({ MenuCommandName: 'Active requests', QuestList: JSON.stringify([JSON.stringify({ QuestName: 'Lost pin', QuestDetail: JSON.stringify('Find the pin.\nReturn it.'), QuestLocation: 'Courtyard', SwitchID: '42' })]) });
    expect([...translator.entries.keys()]).toEqual(expect.arrayContaining(['Active requests', 'Lost pin', 'Find the pin.\nReturn it.', 'Courtyard']));
    expect(translator.entries.has('42')).toBe(false);
});

it('matches runtime descriptions with doubled escape codes to decoded mass-translation keys', () => {
    const translator = new QuestListMenuTranslator();
    const canonical = '\n\nFind \\c[17]the pin\\c[0].';
    const parameter = JSON.stringify(canonical);
    translator.collectParameterTexts({ QuestDetail: parameter });
    const displayed = parameter.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
    expect(displayed).not.toBe(canonical);
    expect(translator.detailSources.get(displayed)).toBe(canonical);
    expect(translator.entries.has(canonical)).toBe(true);
    const resolve = vi.spyOn(translator, 'resolveRuntimeTranslation').mockReturnValue('Find the translated pin.');
    expect(translator.resolveText(displayed, { isTranslationEnabled: () => true })).toBe('Find the translated pin.');
    expect(resolve.mock.calls[0][0]).toBe(canonical);
});

