import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    getQuickTranslationState,
    quickTranslate,
} from '../cheat-engine/www/cheat/js/translation-runtime/QuickTranslation.js';
import {
    chooseNamePattern,
    getNameDetectionEvidence,
    getQuickTagConfigs,
    looksLikeDialogue,
} from '../cheat-engine/www/cheat/js/translation-runtime/QuickTranslationRules.js';
import { countNamesInCache } from '../cheat-engine/www/cheat/js/translation-runtime/TranslationNames.js';
import { TranslationSuspicionStore } from '../cheat-engine/www/cheat/js/TranslationSuspicionStore.js';
import { createTranslationBatchManager } from '../cheat-engine/www/cheat/translate-engines/batch-manager/TranslationBatchManagerFactory.js';

vi.mock(
    '../cheat-engine/www/cheat/translate-engines/batch-manager/TranslationBatchManagerFactory.js',
    () => ({
        createTranslationBatchManager: vi.fn(),
    })
);

afterEach(() => vi.unstubAllGlobals());

describe('Quick translation', () => {
    it('keeps a reliable pattern with one stray sentence ahead of a broad match', () => {
        const speakers = Array.from({ length: 20 }, (_, i) => ['Speaker ' + i, 3]);
        const reliable = {
            pattern: 'speaker',
            names: new Map([...speakers, ['A rare speaker', 1], ['This is narration!', 1]]),
        };
        const broad = {
            pattern: 'broad',
            names: new Map([
                ...speakers,
                ['Extra speaker', 2],
                ...Array.from({ length: 150 }, (_, i) => ['Unrelated ' + i, 1]),
            ]),
        };
        const selected = chooseNamePattern([broad, reliable]);
        expect(selected.pattern).toBe('speaker');
        expect(selected.names.has('A rare speaker')).toBe(true);
        expect(selected.names.has('This is narration!')).toBe(false);
    });

    it('adds escape extensions of alphanumeric commands, skips special extensions, and masks parameters', () => {
        const rows = ['\\FOOBAR[N]', '\\FOOBAR[…]', '\\{HERO', '\\<Line', '\\^', '<xml>'].map(
            (pattern) => ({ pattern })
        );
        const tags = getQuickTagConfigs(rows, new Set(['\\FOO', '\\{', '\\<']));
        expect(tags).toEqual([
            expect.objectContaining({ tagSymbol: 'FOOBAR', bracket: '[', maskValue: true }),
            expect.objectContaining({ tagSymbol: '^', maskValue: false }),
        ]);
    });

    it('chooses the strongest clean pattern even when another pattern has more matches', () => {
        const names = ['Mark William Twain', 'Girl 3', '????', '山田 太郎'];
        expect(names.some(looksLikeDialogue)).toBe(false);
        expect(looksLikeDialogue('これは私の本です')).toBe(true);
        const valid = { pattern: 'names', names: new Map(names.map((name) => [name, 1])) };
        const invalid = {
            pattern: 'dialogue',
            names: new Map(
                Array.from({ length: 1000 }, (_, i) => ['I want to see you again ' + i, 1])
            ),
        };
        expect(chooseNamePattern([invalid, valid])).toBe(valid);
        expect(chooseNamePattern([invalid, { names: new Map() }])).toBe(null);
    });

    it('prefers recurring speakers and retains rare names from the winning pattern', () => {
        const { dialogueKeys, skillNames } = getNameDetectionEvidence(
            [
                'message:ja-en-【Heal】\nRecover HP',
                'skill_name:ja-en-【Heal】',
                'skill_description:ja-en-This is a skill!\n「Guard」',
                'message:ja-en-Alice\n「Hello」',
                'message_portrait:ja-en-Alice\n「Hello」',
                'troop:ja-en-Alice\n「Watch out」',
                'message:ja-en-Bob\n「Hello」',
            ],
            'ja-en-'
        );
        const patterns = ['^【([^【】]+)】', '^([^\\[「]+)\\n「'];
        const candidates = patterns.map((pattern) => ({
            pattern,
            names: countNamesInCache(dialogueKeys, pattern, 'ja-en-'),
        }));
        expect(candidates[0].names).toEqual(new Map([['Heal', 1]]));
        expect(skillNames.has('Heal')).toBe(true);
        expect(candidates[1].names).toEqual(
            new Map([
                ['Alice', 2],
                ['Bob', 1],
            ])
        );
        expect(chooseNamePattern(candidates, skillNames)).toBe(candidates[1]);
    });

    it.each([
        [true, '', false, true],
        [false, ''],
        [true, '\\{\\}', true],
        [true, '\\{\\}', false],
        [false, '\\FS[40]', true],
    ])(
        'checks names (%s) and proceeds regardless of font size tags (%s) in manual mode (%s)',
        async (hasNames, sizeTag, manual, needsRepair) => {
            vi.stubGlobal('window', {});
            const scanForUnknownTagsAsync = vi.fn(async () => [{ pattern: '\\FOOBAR[N]' }]);
            const addAiCustomTag = vi.fn();
            const translationCache = new Map();
            const suspicionStore = new TranslationSuspicionStore({ existsSync: () => false }, '');
            translationCache.set('message:ja-fr-Old', 'Old translation');
            suspicionStore.set(
                'message:ja-fr-Old',
                [{ id: 'fewer-sentences', label: 'Fewer sentences' }],
                'Old translation'
            );
            suspicionStore.set(
                'message:ja-en-removed',
                [{ id: 'extra', label: 'Removed entry' }],
                'Removed'
            );
            const persistCache = vi.fn();
            const originalManager = {};
            const hud = {
                showSpinner: vi.fn(),
                hideSpinner: vi.fn(),
                hideProgressBox: vi.fn(),
                updateProgressBox: vi.fn(),
            };
            const runtime = {
                manuallySetTextWidths: manual,
                sourceLang: 'ja',
                targetLang: 'en',
                translationCache,
                getTranslationSuspicionStore: () => suspicionStore,
                engine: {
                    scanForUnknownTagsAsync,
                    tagManager: { getRegisteredDetectionPatterns: () => new Set() },
                },
                batchManager: originalManager,
                getProgressUiAdapter: () => hud,
                isEngineFullyConfigured: () => true,
                checkIfDataIsLoaded: () => false,
                beginNonOtfTranslationProcess: () => true,
                endNonOtfTranslationProcess: vi.fn(),
                isBatchQueueAbortRequested: () => false,
                getObjectTranslationTypeDefs: () =>
                    ['names', 'mapEvents', 'cacheEmptyStrings'].map((id) => ({ id })),
                getValidMapInfos: () => [{ id: 1 }, { id: 2 }],
                getCacheKey: (text, type) => type + ':ja-en-' + text,
                applyCachedTranslationsToData: vi.fn(),
                persistCache,
                notifyCacheRuntime: vi.fn(),
                saveSettings: vi.fn(),
                addAiCustomTag,
            };
            const runBatchedTranslation = vi.fn(async (requests, { dryRun }) => {
                const { progressUi } = vi.mocked(createTranslationBatchManager).mock.lastCall[1];
                progressUi.showSpinner();
                progressUi.updateProgressBox('Phase', 'Progress', 'Total');
                progressUi.hideSpinner();
                progressUi.hideProgressBox();
                if (dryRun) {
                    expect(hud.updateProgressBox).not.toHaveBeenCalled();
                    expect(requests.map(({ kind }) => kind)).toEqual(['names', 'mapEvents']);
                    expect(requests[1].mapIds).toEqual([1, 2]);
                    translationCache.set(
                        hasNames
                            ? 'message:ja-en-\\N<Girl 3>hello'
                            : 'message:ja-en-\\N<これは本です>hello',
                        ''
                    );
                    translationCache.set('message:ja-fr-\\N<Other Name>hello', '');
                    if (sizeTag) translationCache.set('choice:ja-en-' + sizeTag + 'Choice', '');
                } else {
                    expect(requests[0].kind).toBe('names');
                    expect(addAiCustomTag).toHaveBeenCalledWith(
                        expect.objectContaining({ maskValue: true })
                    );
                    expect(translationCache.get('actor_name:ja-en-Girl 3')).toBe('');
                    expect(translationCache.has('actor_name:ja-en-Other Name')).toBe(false);
                    translationCache.set('actor_name:ja-en-Girl 3', 'Third Girl');
                    translationCache.set(
                        'message:ja-en-\\N<Girl 3>hello',
                        needsRepair ? '\\N<Girl 3>Hello' : '\\N<Third Girl>Hello'
                    );
                }
                return { successes: [], failures: [] };
            });
            vi.mocked(createTranslationBatchManager).mockReturnValue({ runBatchedTranslation });

            await quickTranslate(runtime);

            expect(runBatchedTranslation).toHaveBeenCalledTimes(hasNames ? 2 : 1);
            expect(hud.updateProgressBox).toHaveBeenCalledTimes(hasNames ? 1 : 0);
            if (hasNames) {
                expect(hud.updateProgressBox).toHaveBeenCalledWith('Phase', 'Progress', 'Total');
                expect(hud.hideProgressBox).toHaveBeenCalledTimes(1);
            }
            const status = getQuickTranslationState();
            expect(status.suspicions).toEqual(
                hasNames
                    ? {
                          total: 1,
                          issues: [{ id: 'fewer-sentences', label: 'Fewer sentences', count: 1 }],
                      }
                    : null
            );
            expect(status.showWidthPreview).toBe(false);
            expect(status.message.includes('No reliable name pattern')).toBe(!hasNames);
            expect(status.message.includes('Font-size tags detected')).toBe(false);
            expect(scanForUnknownTagsAsync).toHaveBeenCalledTimes(1);
            expect(persistCache).toHaveBeenCalledTimes(Number(hasNames) + Number(!!needsRepair));
            if (needsRepair) {
                expect(translationCache.get('message:ja-en-\\N<Girl 3>hello')).toBe(
                    '\\N<Third Girl>Hello'
                );
                expect(status.message).toContain('Repaired names in 1 cache entries.');
            } else {
                expect(status.message).not.toContain('Repaired names');
            }
            expect(runtime.batchManager).toBe(originalManager);
            expect(runtime.endNonOtfTranslationProcess).toHaveBeenCalledTimes(1);
        }
    );
});
