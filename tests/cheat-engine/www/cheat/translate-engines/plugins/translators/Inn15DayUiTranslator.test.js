import { afterEach, expect, it, vi } from 'vitest';
import { Inn15DayUiTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/Inn15DayUiTranslator.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('collects calendar/report/replay templates and translates diary prose before wrapping', async () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$dataMapInfos', []);
    vi.stubGlobal('$dataCommonEvents', []);
    vi.stubGlobal(
        '$plugins',
        ['Inn15DayCore', 'InnDiaryScene'].map((name) => ({ name, status: true, parameters: {} }))
    );
    vi.stubGlobal(
        'fetch',
        vi.fn(async (path) => ({
            ok: true,
            text: async () => {
                if (path === 'js/plugins/Inn15DayCore.js')
                    return 'this.drawText("十五日間の予約帳",0,0); this.drawText(`${day}日目`,0,0); this.drawText("【本日の出来事】",0,0); const label = `${route}　回想 ${stage}`;';
                if (path === 'js/plugins/InnDiaryScene.js') return '';
                if (path === 'data/DiaryContent.json')
                    return JSON.stringify({
                        portrait: { image: 'img/日本語.png' },
                        pages: [
                            {
                                title: '予約相手',
                                entries: [{ lines: ['街道を行き来する旅商人たち。'] }],
                            },
                        ],
                        statusRows: [{ value: '{day}日目' }],
                    });
                if (path === 'data/DiaryLayout.json')
                    return JSON.stringify({ elements: [{ text: 'ロイドの手帳' }] });
                return '{}';
            },
        }))
    );
    const translator = new Inn15DayUiTranslator();
    await translator.precomputeCounts();
    for (const text of [
        '十五日間の予約帳',
        '【本日の出来事】',
        '予約相手',
        'ロイドの手帳',
        '\\COT[0]日目',
        '\\COT[0]　回想 \\COT[1]',
    ])
        expect(translator.entries.has(text), text).toBe(true);
    expect(translator.entries.has('img/日本語.png')).toBe(false);
    const runtime = {
        isTranslationEnabled: () => true,
        engine: {},
        getCacheKey: (text) => text,
        translationCache: new Map([
            ['\\COT[0]日目', 'Day \\COT[0]'],
            ['\\COT[0]　回想 \\COT[1]', '\\COT[0]: Flashback \\COT[1]'],
            ['街道を行き来する旅商人たち。', 'Traveling merchants on the highway.'],
        ]),
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    translator.tagEngine = runtime.engine;
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    expect(translator.resolveText('15日目', runtime)).toBe('Day 15');
    expect(translator.resolveText('レオン　回想 2', runtime)).toBe('レオン: Flashback 2');
    class Base {
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
    class Message {
        add() {}
    }
    class MessageWindow {
        startMessage() {}
    }
    const wrapped = [];
    class Diary extends Base {
        wrapText(text) {
            wrapped.push(text);
            return [text];
        }
        refresh() {
            this.lines = this.wrapText('街道を行き来する旅商人たち。').map((text) =>
                this.drawText(text)
            );
        }
    }
    class Scene {
        constructor() {
            this._dynamicWindows = [];
        }
        createTextElement() {
            const win = new Diary();
            win.refresh();
            this._dynamicWindows.push(win);
        }
    }
    vi.stubGlobal('Window_Base', Base);
    vi.stubGlobal('Bitmap', Bitmap);
    vi.stubGlobal('Game_Message', Message);
    vi.stubGlobal('Window_Message', MessageWindow);
    vi.stubGlobal('Scene_InnDiary', Scene);
    expect(translator.enablePluginTranslation()).toBe(true);
    const scene = new Scene();
    scene.createTextElement();
    expect(wrapped[wrapped.length - 1]).toBe('Traveling merchants on the highway.');
    expect(scene._dynamicWindows[0].lines).toEqual(['Traveling merchants on the highway.']);
    runtime.isTranslationEnabled = () => false;
    scene._dynamicWindows[0].refresh();
    expect(wrapped[wrapped.length - 1]).toBe('街道を行き来する旅商人たち。');
});
