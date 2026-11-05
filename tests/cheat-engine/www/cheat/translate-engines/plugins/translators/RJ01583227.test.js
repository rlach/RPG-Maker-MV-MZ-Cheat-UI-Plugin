import { afterEach, expect, it, vi } from 'vitest';
import { NYAInfoMenuWindowTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/NYAInfoMenuWindowTranslator.js';
import { VitsunoDifficultyTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/VitsunoDifficultyTranslator.js';
import { AnimationMapNameTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/AnimationMapNameTranslator.js';

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

function runtimeFor(translator) {
    const runtime = {
        isTranslationEnabled: () => true,
        engine: { addPluginTags: vi.fn() },
        getCacheKey: (text, type) => `${type}:${text}`,
        translationCache: new Map(),
        trackCacheKeyUsage: vi.fn(),
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
    };
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    return runtime;
}

it('collects NYA dynamic statistics and translates private menu windows', async () => {
    vi.stubGlobal('window', globalThis);
    const translator = new NYAInfoMenuWindowTranslator();
    translator.findPluginEntry = () => ({
        name: 'NYA_InfoMenuWindow2',
        status: true,
        parameters: { Title_MapName: 'サブメニュー', Title_PlayTime: 'プレイ時間' },
    });
    vi.stubGlobal('fetch', async () => ({
        ok: true,
        text: async () => 'this.drawText(" スキルP：" + $gameActors.actor(1).stsSp(), 0, 0);',
    }));
    class Menu {
        createInformationWindow() {
            this._informationWindowMapName = { drawText: (text) => text };
        }
    }
    vi.stubGlobal('Scene_Menu', Menu);
    vi.stubGlobal('SceneManager', {});
    const runtime = runtimeFor(translator);
    expect(translator.enablePluginTranslation()).toBe(true);
    await translator.precomputeCounts();
    expect(translator.entries.has('サブメニュー')).toBe(true);
    expect(translator.entries.has('プレイ時間')).toBe(true);
    const item = translator.collectUntranslated({ runtime })[0];
    expect(item.value).toBe(' スキルP：\\COT[0]');
    runtime.translationCache.set(item.cacheKey, 'Skill points: \\COT[0]');
    const scene = new Menu();
    scene.createInformationWindow();
    expect(scene._informationWindowMapName.drawText(' スキルP：30')).toBe('Skill points: 30');
});

it('collects all difficulty labels and translates only option presentation', async () => {
    vi.stubGlobal('window', globalThis);
    const translator = new VitsunoDifficultyTranslator();
    translator.findPluginEntry = () => ({
        name: 'Vitsuno_Difficulty',
        status: true,
        parameters: {
            'Option Name': '難易度',
            '1 : Name': 'イージー',
            '3 : Name': 'ノーマル',
            '3 : Param Rate': '1.0',
        },
    });
    vi.stubGlobal('fetch', async () => ({ ok: true, text: async () => '' }));
    class Options {
        statusText() {
            return 'ノーマル';
        }
        commandSymbol() {
            return 'difficulty';
        }
        addDifficultyOptions() {}
        addCommand(text) {
            return text;
        }
    }
    vi.stubGlobal('Window_Options', Options);
    const runtime = runtimeFor(translator);
    expect(translator.enablePluginTranslation()).toBe(true);
    await translator.precomputeCounts();
    expect([...translator.entries.keys()]).toEqual(['難易度', 'イージー', 'ノーマル']);
    runtime.translationCache.set('plugin_vitsuno_difficulty:ノーマル', 'Normal');
    expect(new Options().statusText(0)).toBe('Normal');
});

it('translates map popup text before glyph splitting using existing map-name keys', () => {
    vi.stubGlobal('window', globalThis);
    class Interpreter {
        refreshMapName(params) {
            return params.text.split('');
        }
    }
    vi.stubGlobal('Game_Interpreter', Interpreter);
    vi.stubGlobal('$gameMap', { displayName: () => 'ダンジョン' });
    const translator = new AnimationMapNameTranslator();
    const runtime = runtimeFor(translator);
    runtime.translationCache.set('map_name:ダンジョン', 'Dungeon');
    expect(translator.enablePluginTranslation()).toBe(true);
    const params = { size: 30 };
    expect(new Interpreter().refreshMapName(params).join('')).toBe('Dungeon');
    expect(params).toEqual({ size: 30 });
});
