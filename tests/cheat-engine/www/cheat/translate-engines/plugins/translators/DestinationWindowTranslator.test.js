import { describe, it, expect, beforeAll } from 'vitest';

let DestinationWindowTranslator;

beforeAll(async () => {
    if (!globalThis.window) {
        globalThis.window = globalThis;
    }

    const module =
        await import('../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/DestinationWindowTranslator.js');
    DestinationWindowTranslator = module.DestinationWindowTranslator;
});

describe('DestinationWindowTranslator', () => {
    it('extracts MV command356 destination text', () => {
        const translator = new DestinationWindowTranslator();
        const output = [];

        translator.collectDestinationCommandsFromList(
            [
                {
                    code: 356,
                    parameters: ['DW_SET_DESTINATION Quest objective text'],
                },
            ],
            { scope: 'test' },
            output
        );

        expect(output).toHaveLength(1);
        expect(output[0].text).toBe('Quest objective text');
    });

    it('extracts MZ command357 SET_DESTINATION text', () => {
        const translator = new DestinationWindowTranslator();
        const output = [];

        translator.collectDestinationCommandsFromList(
            [
                {
                    code: 357,
                    parameters: [
                        'DestinationWindow',
                        'SET_DESTINATION',
                        '',
                        { destination: 'Find the hidden key', icon: '64' },
                    ],
                },
            ],
            { scope: 'test' },
            output
        );

        expect(output).toHaveLength(1);
        expect(output[0].text).toBe('Find the hidden key');
    });

    it('translates MZ command357 destination arg from cache', () => {
        const translator = new DestinationWindowTranslator();
        const cacheKey = 'plugin_destination_window::find-key';

        const runtime = {
            translationCache: new Map([[cacheKey, 'Znajdz ukryty klucz']]),
            getCacheKey: (text, type) => `${type}::${String(text || '').toLowerCase()}`,
            trackCacheKeyUsage: () => {},
            hasUsableCacheValue: (key) => key === cacheKey,
        };

        const params = [
            'DestinationWindow',
            'SET_DESTINATION',
            '',
            { destination: 'Find-Key', icon: '64' },
        ];

        const translated = translator.buildTranslatedMZCommandParams(params, runtime);

        expect(Array.isArray(translated)).toBe(true);
        expect(translated[3].destination).toBe('Znajdz ukryty klucz');
        expect(translated[3].icon).toBe('64');
    });
});
