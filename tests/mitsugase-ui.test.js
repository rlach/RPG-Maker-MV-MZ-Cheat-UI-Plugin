import { afterEach, expect, it, vi } from 'vitest';
import { MitsugaseUiTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/MitsugaseUiTranslator.js';
import { extractJavaScriptTextCatalog } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/JavaScriptTextCatalog.js';

it('collects text buttons inside the phone image viewer without collecting image names', () => {
    const t = new MitsugaseUiTranslator();
    t.extractCatalog = extractJavaScriptTextCatalog;
    const source = `Phone.prototype._drawImageView = function(ctx) { dT(ctx, '◀ 戻る', 0, 0); ImageManager.loadPicture('画像ファイル'); };`;
    const texts = t.collectSourceCatalog(source).entries.map((e) => e.text);
    expect(texts).toContain('◀ 戻る');
    expect(texts).not.toContain('画像ファイル');
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('translates complete saved feed posts and invoices before splitting, restoring phone state even on errors', () => {
    const t = new MitsugaseUiTranslator();
    const post = { text: '今日の映画よかったな\n静かな作品って好き', likes: 12, id: 'post1' };
    const invoice = { text: '家賃のご請求\nご請求金額: 38,000円\n支払期限: Day28' };
    const reply = { text: '確認しました。ありがとうございます。' };
    const state = { sn: [post], ct: [{ disp: [invoice, reply], convo: [invoice, reply] }] };
    const before = JSON.stringify(state);
    const cache = new Map([
        ['plugin_mitsugase_ui:' + post.text, 'Great movie today.\nI like quiet films.'],
        [
            'plugin_mitsugase_ui:' + invoice.text,
            'Rent invoice\nAmount due: 38,000 yen\nDeadline: Day28',
        ],
        ['plugin_mitsugase_ui:' + reply.text, 'Confirmed. Thank you.'],
    ]);
    const runtime = {
        isTranslationEnabled: () => true,
        getCacheKey: (s, type) => `${type}:${s}`,
        hasUsableCacheValue: (s) => cache.has(s),
        translationCache: cache,
        trackCacheKeyUsage: vi.fn(),
    };
    t.getRuntime = () => runtime;
    t.prepareDynamicValueTag = () => {};
    for (const { text } of [post, invoice, reply]) t.entries.set(text, { text });
    vi.stubGlobal('window', { DataManager: { makeSaveContents: () => ({ _sp: state }) } });
    t.withPhoneDisplayText(() => {
        expect(post.text.split('\n')).toEqual(['Great movie today.', 'I like quiet films.']);
        expect(invoice.text).toContain('Rent invoice');
        expect(reply.text).toBe('Confirmed. Thank you.');
        expect(post.id).toBe('post1');
    });
    expect(JSON.stringify(state)).toBe(before);
    expect(() =>
        t.withPhoneDisplayText(() => {
            throw new Error('render failure');
        })
    ).toThrow('render failure');
    expect(JSON.stringify(state)).toBe(before);
});

it('catalogs travel, friendship, phone, jobs and survey command text while excluding logic and images', async () => {
    vi.stubGlobal('window', {
        $plugins: [
            {
                name: 'SmartphoneUI',
                status: true,
                parameters: {
                    TextMessage: 'メッセージ',
                    TextOnline: 'オンライン',
                    ColorPrimary: '#fff',
                },
            },
        ],
        $dataCommonEvents: [
            {
                list: [
                    {
                        code: 357,
                        parameters: [
                            'SmartphoneUI',
                            'AddMessage',
                            '',
                            {
                                text: 'お支払いありがとうございます。',
                                contactId: 'water',
                                image: '請求書画像',
                            },
                        ],
                    },
                    {
                        code: 357,
                        parameters: [
                            'MiniGame_Survey',
                            'AddQuestion',
                            '',
                            {
                                question: '最も高額な買い物は？',
                                choice1: '1万円以下',
                                jump1: 'next',
                            },
                        ],
                    },
                    {
                        code: 357,
                        parameters: [
                            'FastTravel',
                            'AddLocation',
                            '',
                            { locationName: '教室', mapId: '5' },
                        ],
                    },
                    {
                        code: 357,
                        parameters: [
                            'ExtendedChoices',
                            'addChoice',
                            '',
                            { text: 'アンケートバイト', value: '2' },
                        ],
                    },
                    {
                        code: 357,
                        parameters: [
                            'SmartphoneUI',
                            'AddChoice',
                            '',
                            { reply1: '了解しました', replyImage1: '返信画像' },
                        ],
                    },
                ],
            },
        ],
        $dataMapInfos: [],
    });
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
            ok: true,
            text: async () =>
                `const T = { noMsg: 'メッセージはありません' }; ctx.fillText('戻る', 0, 0);`,
        }))
    );
    const t = new MitsugaseUiTranslator();
    await t.precomputeCounts();
    for (const text of [
        'メッセージ',
        'オンライン',
        'お支払いありがとうございます。',
        '最も高額な買い物は？',
        '1万円以下',
        '教室',
        'アンケートバイト',
        '了解しました',
        '戻る',
    ])
        expect(t.entries.has(text), text).toBe(true);
    for (const text of ['water', '請求書画像', 'next', '5', '2', '返信画像'])
        expect(t.entries.has(text)).toBe(false);
});

it('reuses actor names and translates only the phone canvas, including measurement and disabled mode', () => {
    const calls = [];
    const context = {
        fillText: (text, ...args) => calls.push([text, ...args]),
        measureText: (text) => ({ width: text.length * 10 }),
    };
    class Phone {
        constructor() {
            this.contents = { context };
        }
        _doRefresh() {
            this.width = context.measureText('水道局').width;
            context.fillText('水道局', 20, 30);
        }
    }
    vi.stubGlobal('window', { Window_PhoneDisplay: Phone });
    const t = new MitsugaseUiTranslator();
    let enabled = true;
    const cache = new Map([
        ['actor_name:ななせ', 'Nanase'],
        ['plugin_mitsugase_ui:水道局', 'Water Bureau'],
    ]);
    const runtime = {
        isTranslationEnabled: () => enabled,
        getCacheKey: (s, type) => `${type}:${s}`,
        hasUsableCacheValue: (key) => cache.has(key),
        translationCache: cache,
        trackCacheKeyUsage: vi.fn(),
        engine: {},
    };
    t.getRuntime = () => runtime;
    t.prepareDynamicValueTag = () => {};
    t.entries.set('水道局', { text: '水道局' });
    t.installPhoneCanvas();
    t.installPhoneCanvas();
    expect(t.resolveText('ななせ', runtime)).toBe('Nanase');
    const phone = new Phone();
    phone._doRefresh();
    expect(phone.width).toBe('Water Bureau'.length * 10);
    expect(calls).toEqual([['Water Bureau', 20, 30]]);
    enabled = false;
    phone._doRefresh();
    expect(calls[1]).toEqual(['水道局', 20, 30]);
    expect(phone.width).toBe(30);
});
