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

        // Inject mock scan entries directly
        translator._scanEntries = [
            { text: '武器', meta: { tagName: 'SGカテゴリ' } },
            { text: '防具', meta: { tagName: 'SGCategory' } },
            { text: 'Long description text here', meta: { tagName: 'SG説明' } },
        ];
    });

    it('extracts category pairs from successes and merges into knowledge', () => {
        translator.manageKnowledgeBase(
            {},
            {
                successes: [
                    { value: '武器', translated: 'Weapons' },
                    { value: '防具', translated: 'Armor' },
                    { value: 'Long description text here', translated: 'Long description translated' },
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

    it('does nothing when successes is empty', () => {
        translator.manageKnowledgeBase({}, { successes: [] });
        expect(mergeKnowledgeEntries).not.toHaveBeenCalled();
    });

    it('does nothing when no category scan entries exist', () => {
        translator._scanEntries = [
            { text: 'description only', meta: { tagName: 'SG説明' } },
        ];

        translator.manageKnowledgeBase(
            {},
            { successes: [{ value: 'description only', translated: 'translated' }] }
        );

        expect(mergeKnowledgeEntries).not.toHaveBeenCalled();
    });

    it('skips successes without matching category values', () => {
        translator.manageKnowledgeBase(
            {},
            {
                successes: [
                    { value: 'unknown text', translated: 'something' },
                ],
            }
        );

        expect(mergeKnowledgeEntries).not.toHaveBeenCalled();
    });

    it('handles null response gracefully', () => {
        translator.manageKnowledgeBase({}, null);
        expect(mergeKnowledgeEntries).not.toHaveBeenCalled();
    });
});
