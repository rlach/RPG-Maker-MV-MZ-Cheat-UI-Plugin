import { afterEach, expect, it, vi } from 'vitest';
import {
    HaAdventureUiTranslator,
    haAlbumTitle,
} from '../cheat-engine/www/cheat/translate-engines/plugins/translators/HaAdventureUiTranslator.js';
import { extractJavaScriptTextCatalog } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/JavaScriptTextCatalog.js';
afterEach(() => vi.unstubAllGlobals());
function create() {
    const cache = new Map();
    const rt = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        engine: {},
        getCacheKey: (s) => s,
        hasUsableCacheValue: (k) => cache.has(k),
        translationCache: cache,
        trackCacheKeyUsage: vi.fn(),
    };
    const t = new HaAdventureUiTranslator();
    t.getRuntime = () => rt;
    t.registerPluginCustomTags = vi.fn();
    t.precomputeCounts = async () => {};
    return { t, rt, cache };
}
it('harvests the full HA family and nested display parameters while excluding asset and logic fields', () => {
    const { t, rt } = create();
    t.collectParameterTexts({
        pointLabel: '暗示Pt',
        timeNames: '["朝","昼","夕方","夜"]',
        commands: JSON.stringify([
            JSON.stringify({ name: 'スマホを見る', type: 'phone', nightName: 'スマホを開く' }),
        ]),
        orders: JSON.stringify([
            JSON.stringify({
                key: 'greet',
                successText: '三上さんが会釈した。',
                image: '日本語画像',
            }),
        ]),
        targetProfile: '学生です',
    });
    const texts = t.collectUntranslated({ runtime: rt }).map((i) => i.value);
    expect(texts).toEqual(
        expect.arrayContaining([
            '暗示Pt',
            '夕方',
            'スマホを見る',
            'スマホを開く',
            '三上さんが会釈した。',
            '学生です',
        ])
    );
    expect(texts).not.toContain('phone');
    expect(texts).not.toContain('greet');
    expect(texts).not.toContain('日本語画像');
    expect(t.getPluginAliases()).toEqual(
        expect.arrayContaining([
            'HA_Endings',
            'HA_MindTreeData',
            'HA_Message',
            'HA_Options',
            'HA_Album',
            'HA_SaveLoad',
        ])
    );
});
it('collects endings, mind-tree narratives and expanded name variants without evaluating game code', () => {
    const { t } = create();
    t.extractCatalog = extractJavaScriptTextCatalog;
    const source =
        'const ENDS=[{kind:"純愛エンド",sub:"最初の読者",line:"最後の一文",hint:"恋人として迎える",pic:"cg_end",id:29}]; const tree=[{title:"ざわめき",text:"{遥}の声。\\n記憶の中。",type:"memory"}]; this.drawText("残り " + count + " 回"); dangerous();';
    const entries = t.collectSourceCatalog(source).entries;
    expect(entries.map((e) => e.text)).toEqual(
        expect.arrayContaining([
            '純愛エンド',
            '最初の読者',
            '最後の一文',
            '恋人として迎える',
            'ざわめき',
            '遥の声。\n記憶の中。',
            '三上さんの声。\n記憶の中。',
        ])
    );
    expect(entries.find((e) => e.text === '残り \\COT[0] 回').parts).toEqual(['残り ', ' 回']);
    expect(entries.map((e) => e.text)).not.toContain('cg_end');
});
it('translates canvas, HUD, phone wrapping and private mind pages while preserving native data', () => {
    const { t, rt, cache } = create();
    class Base {
        initialize() {}
        drawText(text) {
            return text;
        }
        drawTextEx(text) {
            return text;
        }
    }
    class Bitmap {
        drawText(text) {
            return text;
        }
    }
    class GameMessage {
        add(text) {
            return text;
        }
    }
    class Message extends Base {
        startMessage() {}
    }
    class Canvas {
        fillText(text) {
            return text;
        }
        measureText(text) {
            return { width: text.length };
        }
    }
    class Phone {
        wrap(bitmap, text) {
            return text.match(/.{1,6}/g);
        }
    }
    class Window_MindText extends Base {
        constructor() {
            super();
            this.initialize();
        }
        start(text) {
            this.pages = text.split('\n\n');
            return this.pages;
        }
    }
    vi.stubGlobal('window', {
        Window_Base: Base,
        Bitmap,
        Game_Message: GameMessage,
        Window_Message: Message,
        CanvasRenderingContext2D: Canvas,
        Scene_HaMessage: Phone,
    });
    for (const [a, b] of [
        ['催眠アプリ', 'Hypnosis App'],
        ['廊下の記憶。\n\n次の記憶。', 'Hallway memory.\n\nNext memory.'],
        ['今日は図書館にいます。', 'At the library today.'],
    ]) {
        t.entries.set(a, { text: a });
        cache.set(a, b);
    }
    expect(t.enablePluginTranslation()).toBe(true);
    expect(new Canvas().fillText('催眠アプリ')).toBe('Hypnosis App');
    expect(new Canvas().measureText('催眠アプリ').width).toBe('Hypnosis App'.length);
    const log = { t: '今日は図書館にいます。' };
    expect(new Phone().wrap(new Bitmap(), log.t).join('')).toBe('At the library today.');
    expect(log.t).toBe('今日は図書館にいます。');
    expect(new Window_MindText().start('廊下の記憶。\n\n次の記憶。')).toEqual([
        'Hallway memory.',
        'Next memory.',
    ]);
    rt.enabled = false;
    expect(new Canvas().fillText('催眠アプリ')).toBe('催眠アプリ');
    expect(new Base().drawText('10')).toBe('10');
});

it('harvests parameter dialogue pages and bodies matching native speaker removal', () => {
    const { t } = create();
    t.collectParameterTexts({
        successText: '遥\n「……これ、私の連絡先、です」\n\nスマホに名前が増えた。',
    });
    expect(t.entries.has('「……これ、私の連絡先、です」')).toBe(true);
    expect(t.entries.has('遥\n「……これ、私の連絡先、です」')).toBe(true);
    expect(t.entries.has('スマホに名前が増えた。')).toBe(true);
});
it('harvests derived gallery captions for all categories without renaming source events', async () => {
    const events = [
        { id: 101, name: '本編：E1 拓真が遥に絡む' },
        { id: 200, name: '純愛：二人の時間' },
        { id: 29, name: '純愛エンド「最初の読者」' },
        { id: 220, name: 'Lv5命令：散歩：慣れ' },
        { id: 221, name: 'Lv5命令：散歩' },
        { id: 222, name: 'システムイベント' },
    ];
    vi.stubGlobal('window', { $dataCommonEvents: events });
    const { t } = create();
    await t.collectAdditionalTexts();
    for (const caption of ['拓真が遥に絡む', '二人の時間', '最初の読者', '散歩②', '散歩①'])
        expect(t.entries.has(caption)).toBe(true);
    expect(t.entries.has('システムイベント')).toBe(false);
    expect(events[0].name).toBe('本編：E1 拓真が遥に絡む');
    expect(haAlbumTitle({ id: 26, name: '金に換えるEND' })).toBe('金に換えるEND');
});

it('does not let identity-valued gallery captions hide existing command translations and retries untranslated captions', async () => {
    vi.stubGlobal('window', {
        $dataCommonEvents: [
            { id: 40, name: 'Lv2命令：キスをする' },
            { id: 108, name: '本編：E08 拓真が遥に絡む' },
        ],
    });
    const { t, rt, cache } = create();
    t.entries.set('キスをする', { text: 'キスをする' });
    cache.set('キスをする', 'Kiss');
    cache.set('キスをする①', 'キスをする①');
    cache.set('拓真が遥に絡む', '拓真が遥に絡む');
    await t.collectAdditionalTexts();
    expect(t.resolveText('キスをする①', rt)).toBe('Kiss①');
    expect(t.collectUntranslated({ runtime: rt }).map((item) => item.value)).toEqual(
        expect.arrayContaining(['キスをする①', '拓真が遥に絡む'])
    );
    cache.set('キスをする①', 'Share a kiss');
    expect(t.resolveText('キスをする①', rt)).toBe('Share a kiss');
    expect(t.collectUntranslated({ runtime: rt }).map((item) => item.value)).not.toContain(
        'キスをする①'
    );
    rt.enabled = false;
    expect(t.resolveText('キスをする①', rt)).toBe('キスをする①');
});
