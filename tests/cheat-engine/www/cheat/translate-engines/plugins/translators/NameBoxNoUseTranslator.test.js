import { afterEach, describe, expect, it, vi } from 'vitest';
import { NameBoxNoUseTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/NameBoxNoUseTranslator.js';

describe('NameBoxNoUse message keys', () => {
    const text = '聖女フラーラ\n「で、ですねーっ。\n兵隊さんたちー、がんばってくださーい！」';

    function translator(parameters) {
        const instance = new NameBoxNoUseTranslator();
        vi.spyOn(instance, 'findPluginEntry').mockReturnValue({ status: true, parameters });
        return instance;
    }

    it('resolves the RJ01435532 runtime prefix to the scanned source even without a speaker', () => {
        const instance = translator({ speakerFormat: '　', wrap: 'false' });
        expect(
            instance.resolveMessageCacheSourceText({
                mode: 'collection',
                text,
                command: { parameters: ['', 0, 0, 2, '3'] },
            })
        ).toBeNull();
        expect(
            instance.resolveMessageCacheSourceText({
                text: '　' + text,
                gameMessage: { speakerName: () => '' },
            })
        ).toBe(text);
    });

    it('removes the formatted speaker and newline from runtime text', () => {
        const instance = translator({ speakerFormat: '\\c[2]【%1】\\c[0]', wrap: 'true' });
        expect(
            instance.resolveMessageCacheSourceText({
                text: '\\c[2]【Flara】\\c[0]\n' + text,
                gameMessage: { speakerName: () => 'Flara' },
            })
        ).toBe(text);
    });

    it('leaves narration without a speaker unchanged', () => {
        expect(
            translator({}).resolveMessageCacheSourceText({
                mode: 'collection',
                text,
                command: { parameters: ['', 0, 0, 2, ''] },
            })
        ).toBeNull();
    });
});
