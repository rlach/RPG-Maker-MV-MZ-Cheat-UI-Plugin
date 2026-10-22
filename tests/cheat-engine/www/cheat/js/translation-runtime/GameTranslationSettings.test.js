import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GameTranslationSettings } from '../../../../../../cheat-engine/www/cheat/js/GameTranslationSettings.js';
import { translateOnTheFlySettingsMethods } from '../../../../../../cheat-engine/www/cheat/js/translation-runtime/TranslateOnTheFlySettingsMethods.js';
import { createEngine } from '../../../../../../cheat-engine/www/cheat/translate-engines/index.js';

vi.mock('../../../../../../cheat-engine/www/cheat/js/TranslateOnTheFlyState.js', () => ({
    TranslateOnTheFlyState: { isEnabled: () => false, setEnabled() {} },
}));

let directory;
beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'cheat-game-settings-'));
    vi.stubGlobal('window', {});
});
afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
    vi.unstubAllGlobals();
});

function runtimeWith(settings = {}) {
    let saved = structuredClone(settings);
    return {
        ...translateOnTheFlySettingsMethods,
        kvStorage: { getAll: () => structuredClone(saved), setAll: (data) => { saved = structuredClone(data); } },
        getSplitCacheDirectoryPath: () => directory,
        $set: (target, key, value) => { target[key] = value; },
        loadAiApiKeyFromSecureStore: async () => '',
    };
}

describe('portable game translation settings', () => {
    it('migrates old widths, name settings, plugin choices and tags only once', () => {
        const legacy = {
            maxLineWidth: 39, maxLineWidthWithPortrait: 28, descriptionMaxRows: 3,
            enableTextWrapping: false, enableImageReplacement: false,
            enabledPluginTranslators: { test: false }, namePatternForEnforcing: 'custom',
            engineSettings: { openApi: { aiCustomTags: [{ tagSymbol: 'NAME', description: 'Name tag', type: 'withoutParameter' }], aiTagOverrides: { test: { maskValue: false } }, aiHost: 'http://localhost:8081' } },
        };
        const runtime = runtimeWith(legacy);
        runtime.loadSettings();
        const store = new GameTranslationSettings(directory);
        expect(store.read().translation).toMatchObject({ maxLineWidth: 39, descriptionMaxRows: 3, enableTextWrapping: false });
        expect(store.read().tags).toEqual({ customTags: [{ tagSymbol: 'NAME', description: 'Name tag', type: 'withoutParameter' }], tagOverrides: { test: { maskValue: false } } });
        store.updateSection('translation', { maxLineWidth: 21, enableImageReplacement: true });
        store.updateSection('tags', { customTags: [], tagOverrides: {} });
        const next = runtimeWith(legacy);
        next.loadSettings();
        expect(next.maxLineWidth).toBe(21);
        expect(next.enableImageReplacement).toBe(true);
        expect(store.read().tags.customTags).toEqual([]);
    });

    it('saves game settings to cache and leaves engine settings without portable fields', () => {
        const runtime = runtimeWith({ translationEngine: 'openApi', engineSettings: { openApi: { aiCustomTags: [{ tagSymbol: 'NAME', description: 'Name tag', type: 'withoutParameter' }], aiTagOverrides: {} } } });
        runtime.loadSettings();
        runtime.engine = createEngine('openApi', runtime);
        runtime.applyGameTranslationEngineSettings();
        runtime.engine.host = 'http://localhost:8081';
        runtime.maxLineWidth = 31;
        runtime.saveSettings();
        expect(new GameTranslationSettings(directory).read().translation.maxLineWidth).toBe(31);
        const local = runtime.kvStorage.getAll();
        expect(local).not.toHaveProperty('maxLineWidth');
        expect(local).not.toHaveProperty('enabledPluginTranslators');
        expect(local.engineSettings.openApi).not.toHaveProperty('aiCustomTags');
        expect(local.engineSettings.openApi).not.toHaveProperty('aiTagOverrides');
        expect(local.engineSettings.openApi.aiHost).toBe('http://localhost:8081');
        expect(JSON.stringify(new GameTranslationSettings(directory).read())).not.toContain('aiHost');
    });

    it('keeps tags and overrides through engine switches and recipient defaults', () => {
        const store = new GameTranslationSettings(directory);
        store.updateSection('translation', { maxLineWidth: 27, descriptionMaxRows: 4 });
        store.updateSection('tags', { customTags: [{ tagSymbol: 'PORTABLE', description: 'Portable tag', type: 'withoutParameter' }], tagOverrides: { 'default:x': { reservedWidth: 5 } } });
        const runtime = runtimeWith({ translationEngine: 'dummy', maxLineWidth: 999, engineSettings: { openApi: { aiCustomTags: [{ tagSymbol: 'LOCAL' }] } } });
        runtime.loadSettings();
        runtime.engine = createEngine('dummy', runtime);
        runtime.translationEngine = 'openApi';
        runtime.onChangeTranslationEngine();
        expect(runtime.engine.customTags[0].tagSymbol).toBe('PORTABLE');
        expect(runtime.engine.tagOverrides['default:x'].reservedWidth).toBe(5);
        expect(runtime.maxLineWidth).toBe(27);
        runtime.translationEngine = 'dummy';
        runtime.onChangeTranslationEngine();
        runtime.translationEngine = 'openApi';
        runtime.onChangeTranslationEngine();
        expect(runtime.engine.customTags[0].tagSymbol).toBe('PORTABLE');
    });

    it('merges independent sections without losing hacks or unknown metadata', () => {
        const store = new GameTranslationSettings(directory);
        store.updateSection('hacks', { bitmapGetPixelLongFix: true });
        const runtime = runtimeWith();
        runtime.loadSettings();
        runtime.maxLineWidth = 23;
        runtime.saveSettings();
        expect(store.read().hacks.bitmapGetPixelLongFix).toBe(true);
        store.updateSection('hacks', { bitmapGetPixelLongFix: false });
        expect(store.read().translation.maxLineWidth).toBe(23);
    });

    it('does not overwrite malformed cache settings with local defaults', () => {
        const path = join(directory, 'game-settings.json');
        writeFileSync(path, '{broken');
        expect(() => runtimeWith().loadSettings()).toThrow();
        expect(readFileSync(path, 'utf8')).toBe('{broken');
    });
});
