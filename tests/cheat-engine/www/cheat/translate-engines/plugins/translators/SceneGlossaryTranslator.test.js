import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock KnowledgeBaseRuntime before importing the translator
vi.mock(
    '../../../../../../../cheat-engine/www/cheat/js/KnowledgeBaseRuntime.js',
    () => ({
        mergeKnowledgeEntries: vi.fn(),
    })
);

// Mock HookGuardHelper
vi.mock(
    '../../../../../../../cheat-engine/www/cheat/js/HookGuardHelper.js',
    () => ({
        shouldApplyHook: vi.fn(() => true),
    })
);

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
                successes: [
                    { value: 'plain text', translated: 'translated text' },
                ],
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
