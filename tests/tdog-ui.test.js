import { it, expect, vi, afterEach } from 'vitest';
import { TDogUiTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/TDogUiTranslator.js';
import { extractJavaScriptTextCatalog } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/JavaScriptTextCatalog.js';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
it('scans authored UI scripts, variable templates and recall dialogue using stable cache types', async () => {
    vi.stubGlobal('window', globalThis);
    const recall = '涼音先輩は相変わらずお堅い……。\nでも、期待されている。';
    const plugin = {
        name: 'TDog_LatestChatMemory',
        status: true,
        parameters: {
            groups: JSON.stringify([JSON.stringify({ defaultRecallText: recall })]),
        },
    };
    const sourcePlugin = {
        name: 'SceneCustomMenu',
        status: true,
        parameters: {
            Scene1: JSON.stringify({
                ItemDrawScript: JSON.stringify([
                    'this.drawText("強靭");',
                    'this.drawText("予定");',
                ]),
            }),
        },
    };
    const files = {
        'js/plugins.js': 'var $plugins=' + JSON.stringify([plugin, sourcePlugin]) + ';',
        'js/plugins/TDog_LatestChatMemory.js': 'const LABEL="記録";',
        'data/CommonEvents.json': [
            null,
            {
                list: [
                    { code: 122, parameters: [28, 28, 0, 4, 'month + "月" + day + "日"'] },
                    { code: 122, parameters: [248, 248, 0, 4, '"幼馴染"'] },
                    { code: 355, parameters: ['const status={2:"新学期も気を引き締めて。"};'] },
                    {
                        code: 357,
                        parameters: [
                            'TDog_LatestChatMemory',
                            'setLatest',
                            '',
                            {
                                pictureName: 'pine/acc1/0',
                                recallText: '先輩は相変わらずお堅い……。',
                            },
                        ],
                    },
                ],
            },
        ],
        'data/MapInfos.json': [],
        'data/Actors.json': [null, { name: '果穂' }],
    };
    vi.stubGlobal('$plugins', [plugin, sourcePlugin]);
    vi.stubGlobal('fetch', async (url) => {
        if (!(url in files)) throw Error(url);
        return { ok: true, text: async () => files[url], json: async () => files[url] };
    });
    const t = new TDogUiTranslator();
    await t.precomputeCounts();
    expect(t.entries.has('強靭')).toBe(true);
    expect(t.getPendingSourceEntries()).toContainEqual({ type: 'message', value: recall });
    expect(t.entries.has('新学期も気を引き締めて。')).toBe(true);
    expect(t.entries.has('pine/acc1/0')).toBe(false);
    expect(t.getPendingSourceEntries()).toContainEqual({
        type: 'message',
        value: '先輩は相変わらずお堅い……。',
    });
    expect(t.getPendingSourceEntries()).toContainEqual({ type: 'actor_name', value: '果穂' });
    const rt = {
        isTranslationEnabled: () => true,
        engine: { addPluginTags() {} },
        getCacheKey: (text, type) => type + ':' + text,
        translationCache: new Map([
            ['plugin_tdog_ui:' + String.raw`\COT[0]月\COT[1]日`, String.raw`\COT[0]/\COT[1]`],
        ]),
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    for (let day = 1; day <= 31; day++)
        expect(t.resolveText('4月' + day + '日', rt)).toBe('4/' + day);
    expect(new Set(rt.trackCacheKeyUsage.mock.calls.map(([key]) => key))).toEqual(
        new Set(['plugin_tdog_ui:' + String.raw`\COT[0]月\COT[1]日`])
    );
});
it('localizes string variables through both the base renderer and MPP captured message converter without changing game state', () => {
    vi.stubGlobal('window', globalThis);
    const recall = '涼音先輩は相変わらずお堅い……。\n期待されている。';
    const values = { 248: '幼馴染', 29: '月曜日(MON)', 21: recall };
    class Bitmap {
        drawText(text) {
            return text;
        }
    }
    class Base {
        drawText(text) {
            return text;
        }
        drawTextEx(text) {
            return text;
        }
        convertEscapeCharacters(text) {
            return text
                .replace(/(?:\\|\x1b)V\[(\d+)\]/gi, (_, id) => values[id])
                .replace(/\\/g, '\x1b');
        }
    }
    const captured = Base.prototype.convertEscapeCharacters;
    class MessageWindow extends Base {
        startMessage() {}
        convertEscapeCharacters(text) {
            return captured.call(this, text);
        }
    }
    class Message {
        add() {}
        faceName() {
            return '';
        }
    }
    vi.stubGlobal('Bitmap', Bitmap);
    vi.stubGlobal('Window_Base', Base);
    vi.stubGlobal('Window_Message', MessageWindow);
    vi.stubGlobal('Game_Message', Message);
    vi.stubGlobal('$gameVariables', { value: (id) => values[id] });
    const t = new TDogUiTranslator();
    t.entries.set('幼馴染', { text: '幼馴染' });
    t.entries.set('月曜日(MON)', { text: '月曜日(MON)' });
    t.entries.set(recall, { text: recall, cacheType: 'message' });
    const rt = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        engine: { addPluginTags() {} },
        getCacheKey: (text, type) => type + ':' + text,
        translationCache: new Map([
            ['plugin_tdog_ui:幼馴染', 'childhood friend'],
            ['plugin_tdog_ui:月曜日(MON)', 'Monday (MON)'],
            ['message:' + recall, 'Suzune is as strict as ever.\nShe expects much of me.'],
        ]),
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    vi.spyOn(t, 'getRuntime').mockReturnValue(rt);
    vi.spyOn(t, 'precomputeCounts').mockResolvedValue();
    expect(t.enablePluginTranslation()).toBe(true);
    for (const view of [new Base(), new MessageWindow()])
        for (let i = 0; i < 2; i++) {
            expect(view.convertEscapeCharacters(String.raw`Kaho is my \V[248].`)).toBe(
                'Kaho is my childhood friend.'
            );
            expect(view.convertEscapeCharacters('\x1bV[29]')).toBe('Monday (MON)');
            expect(view.convertEscapeCharacters('\\V[21]')).toBe(
                'Suzune is as strict as ever.\nShe expects much of me.'
            );
        }
    expect(values).toEqual({ 248: '幼馴染', 29: '月曜日(MON)', 21: recall });
    expect(
        rt.trackCacheKeyUsage.mock.calls.every(([key]) => !key.includes('childhood friend'))
    ).toBe(true);
    rt.enabled = false;
    expect(new MessageWindow().convertEscapeCharacters(String.raw`\V[248]`)).toBe('幼馴染');
});
