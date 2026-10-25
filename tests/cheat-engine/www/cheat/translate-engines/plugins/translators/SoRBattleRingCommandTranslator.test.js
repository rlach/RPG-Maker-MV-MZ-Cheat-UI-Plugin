import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SoRBattleRingCommandTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/SoRBattleRingCommandTranslator.js';

let translator;
let runtime;
let load;
beforeEach(() => {
    vi.stubGlobal('window', globalThis);
    runtime = {
        enabled: true,
        isTranslationEnabled: () => runtime.enabled,
        getCacheKey: (text, type) => `${type}:ja-en-${text}`,
        translationCache: new Map([
            ['command:ja-en-攻撃', 'Attack'],
            ['command:ja-en-防御', 'Defend'],
            ['command:ja-en-逃げる', 'Run'],
            ['skillType:ja-en-魔法', 'Magic'],
            ['skillType:ja-en-必殺技', 'Special Move'],
        ]),
        trackCacheKeyUsage: vi.fn(),
    };
    load = vi.fn(function (filename, ...args) {
        return { receiver: this, filename, args };
    });
    vi.stubGlobal('ImageManager', { loadBattleCommandSprite: load });
    translator = new SoRBattleRingCommandTranslator();
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
});
afterEach(() => vi.unstubAllGlobals());

it.each([
    ['Attack', '攻撃'],
    ['Defend', '防御'],
    ['Run', '逃げる'],
    ['Magic', '魔法'],
    ['Special Move', '必殺技'],
])('restores %s for enabled and disabled icons', (translated, source) => {
    expect(translator.enablePluginTranslation()).toBe(true);
    for (const suffix of ['', '_disabled']) {
        expect(ImageManager.loadBattleCommandSprite(`Com_${translated}${suffix}`, 42)).toEqual({
            receiver: ImageManager,
            filename: `Com_${source}${suffix}`,
            args: [42],
        });
    }
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith(expect.any(String), {
        harvestMissing: false,
    });
});

it('chains the existing game filename patch without changing command labels', () => {
    ImageManager.loadBattleCommandSprite = function (filename) {
        return load.call(this, filename === 'Com_攻撃' ? 'Com_kougeki' : filename);
    };
    translator.enablePluginTranslation();
    expect(ImageManager.loadBattleCommandSprite('Com_Attack').filename).toBe('Com_kougeki');
});

it('leaves layouts, original names, unknown labels and other language pairs alone', () => {
    runtime.translationCache.set('command:ja-fr-別', 'Unknown');
    translator.enablePluginTranslation();
    for (const name of ['Layout', 'Com_攻撃', 'Com_Unknown', 'Com_kougeki']) {
        expect(ImageManager.loadBattleCommandSprite(name).filename).toBe(name);
    }
});

it('rejects ambiguous command and skill type translations', () => {
    runtime.translationCache.set('skillType:ja-en-別', 'Attack');
    translator.enablePluginTranslation();
    expect(ImageManager.loadBattleCommandSprite('Com_Attack').filename).toBe('Com_Attack');
    expect(runtime.trackCacheKeyUsage).not.toHaveBeenCalled();
});

it('supports cache-only mode and leaves the loader unchanged when translation is off', () => {
    translator.enablePluginTranslation();
    runtime.enabled = false;
    expect(ImageManager.loadBattleCommandSprite('Com_Attack').filename).toBe('Com_Attack');
    runtime.enableTranslation = true;
    expect(ImageManager.loadBattleCommandSprite('Com_Attack').filename).toBe('Com_攻撃');
});

it('retries when the game loader is not installed yet', () => {
    delete ImageManager.loadBattleCommandSprite;
    expect(translator.enablePluginTranslation()).toBe(false);
});
