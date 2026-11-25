import { afterEach, expect, it, vi } from 'vitest';
import { ChangeSelectItemWindowMZTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/ChangeSelectItemWindowMZTranslator.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('collects help labels and formats embedded progress with one stable counter template', async () => {
    vi.stubGlobal('window', globalThis);
    const plugin = { name: 'ChangeSelectItemWindowMZ', status: true, parameters: {} };
    vi.stubGlobal('$plugins', [plugin]);
    const source =
        'const progress = remaining > 0 ? `読了まで：あと ${remaining} 回` : "読了済み";\n' +
        'const helpText = `${description}\\n対応能力：\\\\SET[${attribute}]　　${progress}`;';
    vi.stubGlobal('fetch', async () => ({ ok: true, text: async () => source }));
    const translator = new ChangeSelectItemWindowMZTranslator();
    await translator.precomputeCounts();
    const type = translator.getCacheType();
    const runtime = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        engine: { addPluginTags() {} },
        getCacheKey: (text, type) => `${type}:${text}`,
        translationCache: new Map([
            [type + ':対応能力：', 'Ability:'],
            [
                type + ':' + String.raw`読了まで：あと \COT[0] 回`,
                String.raw`Remaining: \COT[0] readings`,
            ],
        ]),
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    expect(translator.entries.has('対応能力：')).toBe(true);
    for (let count = 1; count < 10; count++) {
        const text = `Translated description\n対応能力：\\SET[13]　　読了まで：あと ${count} 回`;
        const translated = translator.resolveText(text, runtime);
        expect(translated).toBe(
            `Translated description\nAbility:\\SET[13]　　Remaining: ${count} readings`
        );
        expect(translator.resolveText(translated, runtime)).toBe(translated);
    }
    expect(runtime.trackCacheKeyUsage.mock.calls.every(([key]) => !/あと \d/.test(key))).toBe(true);
    runtime.enabled = false;
    expect(translator.resolveText('対応能力：', runtime)).toBe('対応能力：');
});
