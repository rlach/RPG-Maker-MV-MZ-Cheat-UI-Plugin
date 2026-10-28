import { afterEach, expect, it, vi } from 'vitest';
import { GraphicalDesignModeTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/GraphicalDesignModeTranslator.js';
import { CombineCharacterECTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/CombineCharacterECTranslator.js';
import AIEngine from '../cheat-engine/www/cheat/translate-engines/ai-engine/AIEngine.js';

afterEach(() => vi.unstubAllGlobals());
const source = String.raw`(function () {
    var settings = {
        Scene_Title: {pictures:[{file:'background',switchId:0}],windows:[]},
        Scene_Menu: {windows:[
            {lines:['感度','絶頂回数','回'],switchId:0},
            {lines:['\\C[27]\\UL[ステータス]'],switchId:85},
            {lines:['\\al[center]処女'],switchId:91},
            {lines:['\\V[2] \\C[8]/9999'],switchId:0}
        ]}
    };
    var unrelated = 'Do not harvest implementation strings';
})();`;

it('scans only custom display lines, including switch-conditional labels and units', () => {
    const translator = new GraphicalDesignModeTranslator();
    expect(translator.collectSourceCatalog(source).entries.map((entry) => entry.text)).toEqual([
        '感度',
        '絶頂回数',
        '回',
        '\\C[27]\\UL[ステータス]',
        '処女',
    ]);
});

it('translates and tracks rendered labels without changing window lines or source configuration', async () => {
    class WindowBase {
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
    class WindowMessage {
        startMessage() {}
    }
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('Window_Base', WindowBase);
    vi.stubGlobal('Bitmap', Bitmap);
    vi.stubGlobal('Game_Message', Message);
    vi.stubGlobal('Window_Message', WindowMessage);
    vi.stubGlobal('$plugins', [{ name: 'GraphicalDesignMode', status: true, parameters: {} }]);
    vi.stubGlobal('fetch', async () => ({ ok: true, text: async () => source }));
    const engine = new AIEngine({ sourceLang: 'ja', targetLang: 'en' });
    const cache = new Map([
        ['感度', 'Sensitivity'],
        ['\\C[27]\\UL[ステータス]', '\\C[27]\\UL[Status]'],
    ]);
    const runtime = {
        engine,
        getCacheKey: (value) => value,
        translationCache: cache,
        hasUsableCacheValue: (key) => cache.has(key),
        trackCacheKeyUsage: vi.fn(),
    };
    vi.stubGlobal('__TranslationRuntime', runtime);
    const translator = new GraphicalDesignModeTranslator();
    translator.getRuntime = () => runtime;
    translator.isRuntimeTranslationActive = () => true;
    await translator.precomputeCounts();
    expect(translator.enablePluginTranslation()).toBe(true);
    const lines = ['感度', '\\C[27]\\UL[ステータス]'];
    const win = new WindowBase();
    expect(win.drawTextEx(lines[0])).toBe('Sensitivity');
    expect(win.drawTextEx(lines[1])).toBe('\\C[27]\\UL[Status]');
    expect(lines[0]).toBe('感度');
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith('感度', expect.anything());
});

it('keeps decorated text translatable while protecting the CombineCharacterEC command', () => {
    vi.stubGlobal('window', globalThis);
    const engine = new AIEngine({ sourceLang: 'ja', targetLang: 'en' });
    vi.stubGlobal('__TranslationRuntime', { engine });
    expect(new CombineCharacterECTranslator().enablePluginTranslation()).toBe(true);
    const encoded = engine.tagManager.preprocessTags('\\UL[ステータス]');
    expect(encoded.preprocessedText).toContain('ステータス');
    expect(encoded.preprocessedText).not.toContain('\\UL[');
    const result = engine.tagManager.postprocessTags(
        encoded.preprocessedText.replace('ステータス', 'Status'),
        encoded.tagCounts,
        encoded.caseMap
    );
    expect(result.valid).toBe(true);
    expect(result.text).toBe('\\UL[Status]');
});
