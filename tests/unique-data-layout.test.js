import { it, expect, vi, afterEach } from 'vitest';
vi.hoisted(() => {
    globalThis.window = {};
});
import { UniqueDataLoaderTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/UniqueDataLoaderTranslator.js';

import { BOXING_SERVICE } from '../cheat-engine/www/cheat/components/BoxingModal.js';
import { DescriptionsCleanup } from '../cheat-engine/www/cheat/translate-engines/translation-phases/DescriptionsCleanup.js';
import BaseTranslationEngine from '../cheat-engine/www/cheat/translate-engines/BaseTranslationEngine.js';
import { wrapTextByVisibleWidth } from '../cheat-engine/www/cheat/js/translation-runtime/TextWrap.js';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
function setup() {
    vi.stubGlobal('window', globalThis);
    const translator = new UniqueDataLoaderTranslator();
    translator.collectRows([
        {
            text: '未表示の台詞',
            textName: '語り手',
            choicesText: 'イージー',
            helpText: '敗北しても継続',
        },
    ]);

    const runtime = {
        sourceLang: 'ja',
        targetLang: 'en',
        maxLineWidth: 63,
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        engine: { addPluginTags: vi.fn() },
        getCacheKey: (text, type) => `${type}:ja-en-${text}`,
        trackCacheKeyUsage: vi.fn(),
        cleanTranslatedText: (text) => text,
        wrapText: wrapTextByVisibleWidth,
        translationCache: new Map(),
        hasUsableCacheValue(key) {
            return !!this.translationCache.get(key);
        },
        setCacheValue(key, value) {
            this.translationCache.set(key, value);
        },
        applyCachedTranslationsToData: vi.fn(),
        persistCache: vi.fn(),
        notifyCacheRuntime: vi.fn(),
        notify: vi.fn(),
    };
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);

    return { translator, runtime };
}
it('collects all unseen messages with standard types and applies normal message wrapping', () => {
    const { translator, runtime } = setup();
    const items = translator.collectUntranslated({ runtime });
    expect(items.map((x) => x.type)).toEqual(['message', 'speaker', 'choice', 'message']);
    const message = items[0];
    const value =
        'We were threatened that if we did not regularly offer men and food as sacrifices, she would completely destroy the village and kill all the villagers.';
    const engine = new BaseTranslationEngine(runtime);
    expect(
        engine
            .postprocessTranslatedItem(message, value)
            .split('\n')
            .every((line) => line.length <= 63)
    ).toBe(true);
});
it('boxes all standard messages before any message has been seen', () => {
    const { runtime, translator } = setup();
    for (const item of translator.buildPendingItems(runtime))
        runtime.translationCache.set(item.cacheKey, 'word '.repeat(40));
    const phase = new DescriptionsCleanup();
    phase.configure(['message'], '');
    expect(phase.collectUntranslated({ runtime })).toHaveLength(2);
    expect(
        BOXING_SERVICE._buildTypeStats(runtime, true).find((x) => x.type === 'message')
            .translatedCount
    ).toBe(2);
    BOXING_SERVICE.runLocalReformat(runtime, ['message'], {
        descriptionMaxLineWidth: 63,
        removeNewlinesBeforeWrappingMaxCount: 0,
    });
    for (const item of translator.buildPendingItems(runtime).filter((x) => x.type === 'message'))
        expect(
            runtime.translationCache
                .get(item.cacheKey)
                .split('\n')
                .every((line) => line.length <= 63)
        ).toBe(true);
    expect([...runtime.translationCache.keys()].every((key) => !key.startsWith('plugin_'))).toBe(
        true
    );
});
it('translates variable-backed choices and help after expansion without changing variables or source keys', () => {
    const { translator, runtime } = setup();
    const values = { 121: 'イージー', 131: '敗北しても継続' };
    vi.stubGlobal('$gameVariables', { value: (id) => values[id] ?? 0 });
    class Base {
        convertEscapeCharacters(text) {
            return text
                .replace(/\\V\[(\d+)\]/gi, (_, id) => values[id] ?? 0)
                .replace(/\\/g, '\x1b');
        }
    }
    class Message {
        constructor() {
            this._texts = [];
        }
        add(text) {
            this._texts.push(text);
        }
    }
    vi.stubGlobal('Window_Base', Base);
    vi.stubGlobal('Game_Message', Message);
    vi.spyOn(translator, 'precomputeCounts').mockResolvedValue();
    runtime.translationCache.set('choice:ja-en-イージー', 'Easy');
    runtime.translationCache.set('message:ja-en-敗北しても継続', 'Continue after defeat');
    translator.enablePluginTranslation();
    const message = new Message();
    message.add('未表示の台詞\r\n続き');
    expect(message._texts).toEqual(['未表示の台詞\n続き']);
    const win = new Base();
    for (let i = 0; i < 2; i++) {
        expect(win.convertEscapeCharacters(String.raw`\I[0]\V[121]`)).toBe('\x1bI[0]Easy');
        expect(win.convertEscapeCharacters(String.raw`\V[131]`)).toBe('Continue after defeat');
    }
    expect(values).toEqual({ 121: 'イージー', 131: '敗北しても継続' });
    expect(
        runtime.trackCacheKeyUsage.mock.calls.every(
            ([key]) => !key.includes('Easy') && !key.includes('Continue')
        )
    ).toBe(true);
    runtime.enabled = false;
    expect(win.convertEscapeCharacters(String.raw`\V[121]`)).toBe('イージー');
});
