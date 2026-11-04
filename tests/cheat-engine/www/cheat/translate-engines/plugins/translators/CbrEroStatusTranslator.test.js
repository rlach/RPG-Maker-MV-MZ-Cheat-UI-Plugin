import { afterEach, expect, it, vi } from 'vitest';
import { CbrEroStatusTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/CbrEroStatusTranslator.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('collects script-generated impressions and translates their measured/rendered segments without changing state', async () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$dataMapInfos', []);
    vi.stubGlobal('$dataTroops', []);
    vi.stubGlobal('$dataCommonEvents', [
        {
            list: [
                { code: 355, parameters: ['CBR-エロステータス'] },
                { code: 655, parameters: ['テキスト-名前：キャナリィ'] },
                { code: 655, parameters: ['画像-portrait.png'] },
                {
                    code: 355,
                    parameters: [
                        'const oji = (label, a) => ({ title: "オジサンへの想い：" + label, line1: a });',
                    ],
                },
                {
                    code: 655,
                    parameters: [
                        'oji("優しい人", "見てくれて嬉しかった"); const tag = "【恋人】";',
                    ],
                },
            ],
        },
    ]);
    const translator = new CbrEroStatusTranslator();
    vi.spyOn(translator, 'ensureDetection').mockReturnValue(true);
    await translator.precomputeCounts();
    expect(translator.entries.has('オジサンへの想い：')).toBe(true);
    expect(translator.entries.has('見てくれて嬉しかった')).toBe(true);
    expect(translator.entries.has('【恋人】')).toBe(true);
    expect(translator.entries.has('portrait.png')).toBe(false);
    const runtime = {
        isTranslationEnabled: () => true,
        engine: {},
        getCacheKey: (text) => text,
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
        translationCache: new Map([
            ['オジサンへの想い：', 'Impression of Uncle:'],
            ['見てくれて嬉しかった', 'I was happy you noticed.'],
            ['【恋人】', '【Lover】'],
        ]),
        trackCacheKeyUsage: vi.fn(),
    };
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    translator.tagEngine = runtime.engine;
    const pending = translator.buildUniquePendingItems(runtime);
    expect(pending.some((item) => item.value === '名前：キャナリィ')).toBe(true);
    expect(pending.some((item) => item.value === '【恋人】')).toBe(true);
    const measured = [];
    class Status {
        constructor() {
            this.contents = {
                measureTextWidth: (text) => {
                    measured.push(text);
                    return text.length;
                },
            };
        }
        drawText(text) {
            return text;
        }
        refresh() {
            this.width = this.contents.measureTextWidth('オジサンへの想い：');
            return ['オジサンへの想い：', '「見てくれて嬉しかった」', '【恋人】'].map((text) =>
                this.drawText(text)
            );
        }
    }
    const command = vi.fn();
    vi.stubGlobal('CBR', { エロステータス: command });
    vi.stubGlobal('Window_EroStatus', Status);
    const state = { title: 'オジサンへの想い：', tag: '【恋人】' };
    expect(translator.enablePluginTranslation()).toBe(true);
    expect(new Status().refresh()).toEqual([
        'Impression of Uncle:',
        '「I was happy you noticed.」',
        '【Lover】',
    ]);
    expect(measured).toEqual(['Impression of Uncle:']);
    expect(state.tag).toBe('【恋人】');
    runtime.isTranslationEnabled = () => false;
    expect(new Status().refresh()[2]).toBe('【恋人】');
});
