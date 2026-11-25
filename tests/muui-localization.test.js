import {
    resolveDisplayI18nSource,
    setNativeTextSourceResolver,
} from '../cheat-engine/www/cheat/js/translation-runtime/NativeI18nSource.js';
import { afterEach, it, expect, vi } from 'vitest';
import {
    MuuiLocalizationTranslator,
    normalizeMuuiText,
} from '../cheat-engine/www/cheat/translate-engines/plugins/translators/MuuiLocalizationTranslator.js';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
async function fixture() {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$plugins', [
        { name: 'MUUI_Localization', status: true, parameters: { DefaultLocale: 'zh' } },
    ]);
    const t = new MuuiLocalizationTranslator();
    vi.spyOn(t, 'getSourcePluginNames').mockReturnValue([]);
    vi.spyOn(t, 'readSourceFiles').mockResolvedValue([
        { file: 'data/locales/zh.json', data: { button_id: '确定' } },
        {
            file: 'data/locales/ja.json',
            data: { button_id: '決定', 取消: 'キャンセル', 体力: '体力' },
        },
        {
            file: 'data/MUUI/panel.json',
            data: {
                children: [
                    { type: 'text', content: '#取消#' },
                    { type: 'text', content: '第$V(10)天' },
                    { type: 'text', content: '$V(21)' },
                    { type: 'text', content: '100/100' },
                    { type: 'image', src: 'img/menus/取消.png' },
                ],
            },
        },
        {
            file: 'data/CommonEvents.json',
            data: [
                null,
                {
                    list: [
                        { code: 101, parameters: ['', 0, 0, 2] },
                        { code: 401, parameters: ['#现在怎么办？#'] },
                        { code: 102, parameters: [['#离开#', '#留下#']] },
                    ],
                },
            ],
        },
    ]);
    await t.precomputeCounts();
    const rt = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        engine: { addPluginTags() {} },
        getCacheKey: (s, c) => c + ':' + s,
        translationCache: new Map([
            ['plugin_muui:确定', 'Confirm'],
            ['plugin_muui:取消', 'Cancel'],
            ['plugin_muui:' + String.raw`第\COT[0]天`, String.raw`Day \COT[0]`],
        ]),
        hasUsableCacheValue(k) {
            return this.translationCache.has(k);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    return { t, rt };
}
it('collects source values and typed dialogue/choices, preserving rich colors and excluding identifiers and graphics', async () => {
    const { t } = await fixture();
    expect(t.entries.has('确定')).toBe(true);
    expect(t.entries.has('button_id')).toBe(false);
    expect(t.entries.has('100/100')).toBe(false);
    expect(t.entries.has('$V(21)')).toBe(false);
    expect(t.entries.has('img/menus/取消.png')).toBe(false);
    expect(t.entries.get('现在怎么办？').cacheType).toBe('message');
    expect(t.entries.get('离开').cacheType).toBe('choice');
    expect(normalizeMuuiText('[c=#ff00ff]#取消#[/c]')).toBe('[c=#ff00ff]取消[/c]');
});
it('uses one day template, maps native locale variants and translated redraws to original source keys', async () => {
    const { t, rt } = await fixture();
    for (let day = 1; day <= 30; day++)
        expect(t.resolveText('第' + day + '天', rt)).toBe('Day ' + day);
    expect(new Set(rt.trackCacheKeyUsage.mock.calls.map(([key]) => key))).toEqual(
        new Set(['plugin_muui:' + String.raw`第\COT[0]天`])
    );
    expect(t.resolveText('#button_id#', rt)).toBe('Confirm');
    expect(t.resolveText('決定', rt)).toBe('Confirm');
    expect(t.resolveText('Confirm', rt)).toBe('Confirm');
    expect(t.resolveMessageCacheSourceText({ text: 'Confirm' })).toBe('确定');
    rt.enabled = false;
    expect(t.resolveText('#取消#', rt)).toBe('#取消#');
});
it('translates native MUUI getText output without modifying its cache, resource paths or raw message data', async () => {
    const { t, rt } = await fixture();
    class Base {
        drawText(t) {
            return t;
        }
        drawTextEx(t) {
            return t;
        }
    }
    class Bitmap {
        drawText(t) {
            return t;
        }
    }
    class Message {
        add(t) {
            this._texts = [t];
        }
        faceName() {
            return '';
        }
    }
    class MessageWindow {
        startMessage() {}
    }
    vi.stubGlobal('Window_Base', Base);
    vi.stubGlobal('Bitmap', Bitmap);
    vi.stubGlobal('Game_Message', Message);
    vi.stubGlobal('Window_Message', MessageWindow);
    const nativeCache = new Map();
    const locale = {
        getText(text) {
            const result = normalizeMuuiText(text);
            nativeCache.set(text, result);
            return result;
        },
    };
    vi.stubGlobal('MUUI_Localization', locale);
    vi.spyOn(t, 'getRuntime').mockReturnValue(rt);
    expect(t.enablePluginTranslation()).toBe(true);
    expect(locale.getText('#取消#')).toBe('Cancel');
    expect(locale.getText('Cancel')).toBe('Cancel');
    expect(nativeCache.get('#取消#')).toBe('取消');
    expect(locale.getText('img/menus/取消.png')).toBe('img/menus/取消.png');
    expect(rt.trackCacheKeyUsage.mock.calls.every(([key]) => key === 'plugin_muui:取消')).toBe(
        true
    );
    rt.enabled = false;
    expect(locale.getText('#取消#')).toBe('取消');
});

it('protects MUUI rich-text formatting as dynamic tokens instead of sending markup to translation', async () => {
    const { t, rt } = await fixture();
    t.addSource('[c=#ff00ff]#取消#[/c]');
    await t.buildCatalog();
    const key = String.raw`\COT[0]取消\COT[1]`;
    expect(t.entries.has(key)).toBe(true);
    rt.translationCache.set('plugin_muui:' + key, String.raw`\COT[0]Cancel\COT[1]`);
    expect(t.resolveText('[c=#ff00ff]#取消#[/c]', rt)).toBe('[c=#ff00ff]Cancel[/c]');
});

it('uses standard message keys for the author thought table', () => {
    const t = new MuuiLocalizationTranslator();
    t.extractCatalog = () => ({ entries: [{ text: '今天怎么办？' }, { text: '研究' }] });
    const catalog = t.collectSourceCatalog(
        'const data={1:{text:"今天怎么办？"},2:{title:"研究"}};',
        'BY_GTMM'
    );
    expect(catalog.entries.find((e) => e.text === '今天怎么办？').cacheType).toBe('message');
    expect(catalog.entries.find((e) => e.text === '研究').cacheType).toBeUndefined();
});
it('aliases configured alternate common-event dialogue to its canonical source event', async () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$plugins', [
        { name: 'MUUI_Localization', status: true, parameters: {} },
        {
            name: 'BY/BY_CommonEventLocale',
            status: true,
            parameters: {
                Rules: JSON.stringify([
                    {
                        SourceEvent: '1',
                        Replacements: JSON.stringify([{ LocaleTag: 'ja', ReplacementEvent: '2' }]),
                    },
                ]),
            },
        },
    ]);
    const list = (text) => [
        { code: 101, parameters: ['', 0, 0, 2] },
        { code: 401, parameters: [text] },
    ];
    const t = new MuuiLocalizationTranslator();
    vi.spyOn(t, 'getSourcePluginNames').mockReturnValue([]);
    vi.spyOn(t, 'readSourceFiles').mockResolvedValue([
        {
            file: 'data/CommonEvents.json',
            data: [null, { list: list('现在怎么办？') }, { list: list('どうしよう？') }],
        },
    ]);
    await t.precomputeCounts();
    expect(t.entries.has('现在怎么办？')).toBe(true);
    expect(t.entries.has('どうしよう？')).toBe(false);
    expect(t.normalizeTranslationEntry({ type: 'message', value: 'どうしよう？' })).toEqual({
        type: 'message',
        value: '现在怎么办？',
    });
});

it('normalizes choice and speaker cache inputs through the shared native source boundary', async () => {
    const { t, rt } = await fixture();
    expect(resolveDisplayI18nSource('#button_id#', rt)).toBe('确定');
    t.resolveText('#button_id#', rt);
    expect(resolveDisplayI18nSource('Confirm', rt)).toBe('确定');
    expect(resolveDisplayI18nSource('img/menus/example.png', rt)).toBe('img/menus/example.png');
});
it('shares native source normalization with the separate UI window', () => {
    const root = { $plugins: [{ name: 'MUUI_Localization', status: true }] };
    vi.stubGlobal('window', root);
    setNativeTextSourceResolver('MUUI_Localization', (text) =>
        text === '#confirm#' ? '确定' : text
    );
    vi.stubGlobal('window', { __CHEAT_EXTERNAL_WINDOW__: true, opener: root });
    expect(resolveDisplayI18nSource('#confirm#', {})).toBe('确定');
    root.$plugins[0].status = false;
    expect(resolveDisplayI18nSource('#confirm#', {})).toBe('#confirm#');
});
