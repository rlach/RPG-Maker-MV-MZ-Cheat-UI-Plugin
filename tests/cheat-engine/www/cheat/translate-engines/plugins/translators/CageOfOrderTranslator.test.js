import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CageOfOrderTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/CageOfOrderTranslator.js';
import { extractJavaScriptTextCatalog } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/JavaScriptTextCatalog.js';
import { loadMapDataById } from '../../../../../../../cheat-engine/www/cheat/js/translation-runtime/ObjectTranslationModalMethods.js';

vi.mock(
    '../../../../../../../cheat-engine/www/cheat/js/translation-runtime/ObjectTranslationModalMethods.js',
    () => ({ loadMapDataById: vi.fn() })
);

const source = [
    '// コメントは翻訳しない',
    'const data = { name: "冒険者", text: "最近のクエスト。\\n報酬が渋い。", description: "クエストの詳細", imageName: "画像は翻訳しない" };',
    'const IMAGE_FILES = ["背景画像"];',
    'console.log("デバッグは翻訳しない");',
    'ImageManager.loadPicture("画像パス");',
    'window.executed = true;',
    'function render() { this.drawText("現在の目標", 0, 0, 100, "left"); }',
    'function effect() { $gameMessage.add(`HPが${amount}回復した！`); }',
    'function changeJob() { $gameMessage.add(actor.name() + "は" + job.name + "に転職した！"); }',
].join('\n');

let runtime;
let translator;
beforeEach(() => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$plugins', [
        { name: 'CageOfOrder_RandomNPCDialogue', status: true, parameters: {} },
    ]);
    vi.stubGlobal('$dataCommonEvents', []);
    vi.stubGlobal('$dataMapInfos', []);
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: true, text: async () => source }))
    );
    runtime = {
        enabled: true,
        isTranslationEnabled: () => runtime.enabled,
        engine: { addPluginTags: vi.fn() },
        translationCache: new Map(),
        getCacheKey: (text, type) => `${type}:ja-en-${text}`,
        getMessageCacheKey: (text) => `message:ja-en-${text}`,
        hasUsableCacheValue(key) {
            return !!this.translationCache.get(key);
        },
        trackCacheKeyUsage: vi.fn(),
        setCacheValue(key, value) {
            this.translationCache.set(key, value);
        },
    };
    vi.stubGlobal('__TranslationRuntime', runtime);
    vi.stubGlobal('__ensureTranslationRuntime', undefined);
    translator = new CageOfOrderTranslator();
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
});
afterEach(() => vi.unstubAllGlobals());

function cache(source, translated) {
    runtime.translationCache.set(
        runtime.getCacheKey(source, translator.getCacheType()),
        translated
    );
}

describe('Cage of Order source catalogs', () => {
    it('reads event data when detection runs before the game database is ready', async () => {
        vi.stubGlobal('$dataMapInfos', undefined);
        vi.stubGlobal('$dataCommonEvents', undefined);
        fetch.mockImplementation(async (url) => ({
            ok: true,
            text: async () => {
                if (url === 'data/MapInfos.json') return '[null]';
                if (url === 'data/CommonEvents.json')
                    return JSON.stringify([
                        null,
                        {
                            list: [
                                {
                                    code: 357,
                                    parameters: [
                                        'CageOfOrder_MenuUI',
                                        'ShowCustomChoices',
                                        '',
                                        { choices: '["起動前の選択肢"]' },
                                    ],
                                },
                            ],
                        },
                    ]);
                return source;
            },
        }));
        await translator.precomputeCounts();
        expect(translator.collectUntranslated({ runtime }).map((item) => item.value)).toContain(
            '起動前の選択肢'
        );
    });

    it('registers protected dynamic parameters once for each selected engine', async () => {
        await translator.precomputeCounts();
        translator.collectUntranslated({ runtime });
        translator.collectUntranslated({ runtime });
        expect(runtime.engine.addPluginTags).toHaveBeenCalledOnce();
        runtime.engine = { addPluginTags: vi.fn() };
        translator.resolveText('冒険者', runtime);
        expect(runtime.engine.addPluginTags).toHaveBeenCalledOnce();
    });
    it('parses private tables and dynamic messages without executing code or collecting images/logs', () => {
        const catalog = extractJavaScriptTextCatalog(source);
        const texts = catalog.entries.map((e) => e.text);
        expect(texts).toContain('最近のクエスト。\n報酬が渋い。');
        expect(texts).toContain('報酬が渋い。');
        expect(texts).toContain('HPが\\COT[0]回復した！');
        expect(texts).toContain('\\COT[0]は\\COT[1]に転職した！');
        for (const text of [
            '画像は翻訳しない',
            '背景画像',
            '画像パス',
            'デバッグは翻訳しない',
            'コメントは翻訳しない',
            'left',
        ])
            expect(texts).not.toContain(text);
        expect(window.executed).toBeUndefined();
    });

    it('finds source, event-command choices, script effects and map labels before visiting a screen', async () => {
        vi.stubGlobal('$dataMapInfos', [null, { id: 1, name: '宿屋' }]);
        loadMapDataById.mockResolvedValue({
            displayName: '大聖堂',
            events: [
                null,
                {
                    pages: [
                        {
                            list: [
                                {
                                    code: 357,
                                    parameters: [
                                        'CageOfOrder_MenuUI',
                                        'ShowCustomChoices',
                                        '',
                                        { choices: '["会話","戻る"]', resultVariableId: '25' },
                                    ],
                                },
                                {
                                    code: 355,
                                    parameters: ['$gameMessage.add("回復量は" + heal + "です。");'],
                                },
                            ],
                        },
                    ],
                },
            ],
        });
        const first = translator.precomputeCounts();
        await Promise.all([first, translator.precomputeCounts()]);
        expect(fetch).toHaveBeenCalledOnce();
        const pending = translator.collectUntranslated({ runtime });
        expect(pending.map((item) => item.value)).toEqual(
            expect.arrayContaining(['会話', '戻る', '宿屋', '大聖堂', '回復量は\\COT[0]です。'])
        );
        expect(translator.getCachedCountsSync({ runtime }).total).toBe(pending.length);
        cache('冒険者', 'Adventurer');
        expect(translator.getCachedCountsSync({ runtime }).left).toBe(pending.length - 1);
        expect(
            translator.collectUntranslated({ runtime }).some((item) => item.value === '冒険者')
        ).toBe(false);
    });

    it('resolves exact text, split descriptions, decorated labels and dynamic values using canonical keys', async () => {
        await translator.precomputeCounts();
        cache('冒険者', 'Adventurer');
        cache('報酬が渋い。', 'The rewards are poor.');
        cache('HPが\\COT[0]回復した！', 'Recovered \\COT[0] HP!');
        cache('\\COT[0]は\\COT[1]に転職した！', '\\COT[0] became a \\COT[1]!');
        expect(translator.resolveText('◆ 冒険者', runtime)).toBe('◆ Adventurer');
        expect(translator.resolveText('HPが147回復した！', runtime)).toBe('Recovered 147 HP!');
        expect(translator.resolveText('Tiaは冒険者に転職した！', runtime)).toBe(
            'Tia became a Adventurer!'
        );
        expect(translator.resolveText('報酬が渋い。', runtime)).toBe('The rewards are poor.');
        expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith(
            runtime.getCacheKey('HPが\\COT[0]回復した！', translator.getCacheType()),
            expect.any(Object)
        );
        expect(
            runtime.trackCacheKeyUsage.mock.calls.some(([key]) => key.endsWith('HPが147回復した！'))
        ).toBe(false);
        runtime.enabled = false;
        expect(translator.resolveText('冒険者', runtime)).toBe('冒険者');
    });

    it('hooks render boundaries and custom-scene dialogue while preserving raw message buffers', async () => {
        class Bitmap {
            drawText(text) {
                this.drawn = text;
                return text;
            }
        }
        class WindowBase {
            constructor() {
                this.contents = new Bitmap();
            }
            drawText(text) {
                return this.contents.drawText(text);
            }
            drawTextEx(text) {
                for (const char of text) this.contents.drawText(char);
                return text;
            }
            flushTextState(state) {
                return this.contents.drawText(state.buffer);
            }
        }
        class Message {
            constructor() {
                this._texts = [];
            }
            add(text) {
                this._texts.push(text);
            }
            faceName() {
                return '';
            }
        }
        class MessageWindow {
            startMessage() {
                this.shown = $gameMessage._texts.join('\n');
            }
        }
        vi.stubGlobal('Bitmap', Bitmap);
        vi.stubGlobal('Window_Base', WindowBase);
        vi.stubGlobal('Game_Message', Message);
        vi.stubGlobal('Window_Message', MessageWindow);
        vi.stubGlobal('$gameMessage', new Message());
        await translator.precomputeCounts();
        cache('冒険者', 'Adventurer');
        cache('最近のクエスト。\n報酬が渋い。', 'Recent quests.\nPoor rewards.');
        expect(translator.enablePluginTranslation()).toBe(true);
        const win = new WindowBase();
        expect(win.drawText('冒険者')).toBe('Adventurer');
        cache('A', 'Wrong');
        translator.entries.set('A', { text: 'A' });
        expect(win.drawTextEx('冒険者')).toBe('Adventurer');
        expect(win.contents.drawn).toBe('r');
        expect(win.flushTextState({ buffer: 'A' })).toBe('A');
        expect(new Bitmap().drawText('冒険者')).toBe('Adventurer');
        const sourceText = '最近のクエスト。\n報酬が渋い。';
        $gameMessage.add(sourceText);
        expect($gameMessage._texts).toEqual([sourceText]);
        expect(runtime.translationCache.get(runtime.getMessageCacheKey(sourceText))).toBe(
            'Recent quests.\nPoor rewards.'
        );
        const messageWindow = new MessageWindow();
        messageWindow.startMessage();
        expect(messageWindow.shown).toBe('Recent quests.\nPoor rewards.');
        expect($gameMessage._texts).toEqual([sourceText]);
        expect(runtime.engine.addPluginTags).toHaveBeenCalledWith('CageOfOrder', [
            expect.objectContaining({
                tagSymbol: 'COT',
                maskValue: true,
                requiredConsistency: true,
            }),
        ]);
        const ordinaryStory = '未知の物語。冒険者が旅を続ける。';
        $gameMessage._texts = [];
        $gameMessage.add(ordinaryStory);
        expect(runtime.translationCache.has(runtime.getMessageCacheKey(ordinaryStory))).toBe(false);
        messageWindow.startMessage();
        expect(messageWindow.shown).toBe(ordinaryStory);
    });
});
