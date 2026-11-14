import { expect, it, vi } from 'vitest';
import { StandPictureECTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/StandPictureECTranslator.js';
import { TagManager } from '../../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/TagManager.js';

it('registers standing-picture controls and protects nested formulas and signed parameters', () => {
    const translator = new StandPictureECTranslator();
    const register = vi.spyOn(translator, 'registerPluginCustomTags').mockImplementation(() => {});
    expect(translator.enablePluginTranslation()).toBe(true);
    const tags = register.mock.calls[0][0];
    const manager = new TagManager({});
    manager.setCustomTagConfigs(tags);
    const patterns = manager.getRegisteredDetectionPatterns();
    for (const symbol of ['OP', 'SP', 'WT', 'ZPC', 'HP', 'ZP', 'RMP', 'CFP', 'SFR']) {
        expect(patterns.has(`\\${symbol}[…]`)).toBe(true);
        expect(patterns.has(`\\${symbol}[N]`)).toBe(true);
    }
    expect(new Set(tags.map((tag) => tag.tagSymbol)).size).toBe(42);
    for (const symbol of [
        'TC',
        'RZC',
        'RC',
        'RRC',
        'RPC',
        'SM',
        'VI',
        'NNUM',
        'CALC',
        'PV',
        'BXW',
        'BXH',
        'MWW',
        'MWH',
        'MWX',
        'MWY',
    ]) {
        expect(tags.find((tag) => tag.tagSymbol === symbol)?.requiredConsistency).toBe(true);
    }
    const source =
        '\\SP[1,100,200]Hello\\OP[1,255,-30]\\WT[1]\\CALC[$gameVariables.value(1) + [2,3][0]]\\PV';
    const encoded = manager.preprocessTags(source);
    expect(encoded.preprocessedText).not.toContain('$gameVariables');
    expect(encoded.preprocessedText).not.toContain('255');
    expect(encoded.preprocessedText).toContain('Hello');
    expect(
        manager.postprocessTags(encoded.preprocessedText, encoded.tagCounts, encoded.caseMap).text
    ).toBe(source);
    expect(translator.collectUntranslated()).toEqual([]);
});
