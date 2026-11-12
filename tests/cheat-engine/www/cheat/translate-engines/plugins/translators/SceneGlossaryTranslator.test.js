import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock KnowledgeBaseRuntime before importing the translator
vi.mock('../../../../../../../cheat-engine/www/cheat/js/KnowledgeBaseRuntime.js', () => ({
    mergeKnowledgeEntries: vi.fn(),
}));

// Mock HookGuardHelper
vi.mock('../../../../../../../cheat-engine/www/cheat/js/HookGuardHelper.js', () => ({
    shouldApplyHook: vi.fn(() => true),
}));

import { SceneGlossaryTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/SceneGlossaryTranslator.js';
import { mergeKnowledgeEntries } from '../../../../../../../cheat-engine/www/cheat/js/KnowledgeBaseRuntime.js';

describe('SceneGlossaryTranslator.manageKnowledgeBase', () => {
    let translator;

    beforeEach(() => {
        vi.clearAllMocks();
        translator = new SceneGlossaryTranslator();
    });

    it('extracts category pairs from decoded tag text in batch successes', () => {
        translator.manageKnowledgeBase(
            {},
            {
                successes: [
                    {
                        value: '<SGカテゴリ:魔物図鑑>モンスターの説明文',
                        translated: '<SGカテゴリ:Monster Manual>Monster description text',
                    },
                ],
            }
        );

        expect(mergeKnowledgeEntries).toHaveBeenCalledOnce();
        const entries = mergeKnowledgeEntries.mock.calls[0][0];
        expect(entries).toHaveLength(1);
        expect(entries[0]).toEqual({
            key: '魔物図鑑',
            translation: 'Monster Manual',
            info: 'SceneGlossary category',
            plugin: 'SceneGlossary',
        });
    });

    it('extracts comma-separated category values positionally', () => {
        translator.manageKnowledgeBase(
            {},
            {
                successes: [
                    {
                        value: '<SGカテゴリ:武器,防具>',
                        translated: '<SGCategory:Weapons,Armor>',
                    },
                ],
            }
        );

        expect(mergeKnowledgeEntries).toHaveBeenCalledOnce();
        const entries = mergeKnowledgeEntries.mock.calls[0][0];
        expect(entries).toHaveLength(2);
        expect(entries[0]).toEqual({
            key: '武器',
            translation: 'Weapons',
            info: 'SceneGlossary category',
            plugin: 'SceneGlossary',
        });
        expect(entries[1]).toEqual({
            key: '防具',
            translation: 'Armor',
            info: 'SceneGlossary category',
            plugin: 'SceneGlossary',
        });
    });

    it('ignores non-category SG tags', () => {
        translator.manageKnowledgeBase(
            {},
            {
                successes: [
                    {
                        value: '<SG説明:長い説明文テスト>',
                        translated: '<SG説明:Long description test>',
                    },
                ],
            }
        );

        expect(mergeKnowledgeEntries).not.toHaveBeenCalled();
    });

    it('does nothing when successes contain no SG tags', () => {
        translator.manageKnowledgeBase(
            {},
            {
                successes: [{ value: 'plain text', translated: 'translated text' }],
            }
        );

        expect(mergeKnowledgeEntries).not.toHaveBeenCalled();
    });

    it('does nothing when successes is empty', () => {
        translator.manageKnowledgeBase({}, { successes: [] });
        expect(mergeKnowledgeEntries).not.toHaveBeenCalled();
    });

    it('handles null response gracefully', () => {
        translator.manageKnowledgeBase({}, null);
        expect(mergeKnowledgeEntries).not.toHaveBeenCalled();
    });

    it('skips identical original and translated category values', () => {
        translator.manageKnowledgeBase(
            {},
            {
                successes: [
                    {
                        value: '<SGカテゴリ:ABC>',
                        translated: '<SGカテゴリ:ABC>',
                    },
                ],
            }
        );

        expect(mergeKnowledgeEntries).not.toHaveBeenCalled();
    });

    it('handles multiple successes with tags across different items', () => {
        translator.manageKnowledgeBase(
            {},
            {
                successes: [
                    {
                        value: 'text <SGカテゴリ:武器> more text',
                        translated: 'text <SGカテゴリ:Weapons> more text',
                    },
                    {
                        value: '<SGCategory:防具>',
                        translated: '<SGCategory:Armor>',
                    },
                ],
            }
        );

        expect(mergeKnowledgeEntries).toHaveBeenCalledOnce();
        const entries = mergeKnowledgeEntries.mock.calls[0][0];
        expect(entries).toHaveLength(2);
        expect(entries[0].key).toBe('武器');
        expect(entries[0].translation).toBe('Weapons');
        expect(entries[1].key).toBe('防具');
        expect(entries[1].translation).toBe('Armor');
    });
});

it('harvests the original description when item notes already translated metadata', () => {
    const translator = new SceneGlossaryTranslator();
    const source = 'Original glossary description';
    const translated = 'Translated glossary description';
    const note = `<SG説明:${source}>`;
    const runtime = {
        enableTranslation: true,
        isTranslationEnabled: () => true,
        getCacheKey: (text, type) => `${type}:${text}`,
        trackCacheKeyUsage: vi.fn(),
        translationCache: new Map([[`item_note:${note}`, `<SG説明:${translated}>`]]),
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
    };
    const previousWindow = globalThis.window;
    class GlossaryWindow {
        getDescription() {
            return this._itemData.meta.SG説明;
        }
    }
    globalThis.window = { Window_Glossary: GlossaryWindow };
    translator.getRuntime = () => runtime;
    translator.registerPluginCustomTags = vi.fn();
    try {
        translator.enablePluginTranslation();
        const view = new GlossaryWindow();
        view._itemData = { note, meta: { SG説明: source } };
        expect(view.getDescription(0)).toBe(translated);
        expect(view.getDescription(0)).toBe(translated);
        const harvested = runtime.trackCacheKeyUsage.mock.calls.map(([key]) => key);
        expect(harvested).toContain(`plugin_scene_glossary:${source}`);
        expect(harvested).not.toContain(`plugin_scene_glossary:${translated}`);
    } finally {
        globalThis.window = previousWindow;
    }
});

it('resolves descriptions from original notes even if metadata was translated before initialization', () => {
    const translator = new SceneGlossaryTranslator();
    const source = 'Original complete biography';
    const translated = 'Translated complete biography';
    const runtime = {
        enableTranslation: true,
        isTranslationEnabled: () => true,
        getCacheKey: (text, type) => `${type}:${text}`,
        trackCacheKeyUsage: vi.fn(),
        translationCache: new Map([[`plugin_scene_glossary:${source}`, translated]]),
        hasUsableCacheValue(key) { return this.translationCache.has(key); },
    };
    const previousWindow = globalThis.window;
    class GlossaryWindow { getDescription() { return this._itemData.meta.SG説明; } }
    globalThis.window = { Window_Glossary: GlossaryWindow };
    translator.getRuntime = () => runtime;
    translator.registerPluginCustomTags = vi.fn();
    try {
        translator.enablePluginTranslation();
        const view = new GlossaryWindow();
        view._itemData = { note: 'Translated note', _translateOriginal: { note: `<SG説明:${source}>` }, meta: { SG説明: 'Mixed translated fragments' } };
        expect(view.getDescription(0)).toBe(translated);
        expect(runtime.trackCacheKeyUsage.mock.calls.map(([key]) => key)).not.toContain('plugin_scene_glossary:Mixed translated fragments');
    } finally { globalThis.window = previousWindow; }
});
