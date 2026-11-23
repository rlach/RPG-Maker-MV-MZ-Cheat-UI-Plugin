import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

async function loadModules() {
    vi.stubGlobal('window', {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    });
    const [{ translateOnTheFlyCoreMethods }, { ensureTranslationRuntime }, panelModule] =
        await Promise.all([
            import(
                '../../../../../cheat-engine/www/cheat/js/translation-runtime/TranslateOnTheFlyCoreMethods.js'
            ),
            import(
                '../../../../../cheat-engine/www/cheat/js/translation-runtime/TranslationRuntime.js'
            ),
            import('../../../../../cheat-engine/www/cheat/panels/TranslateNamesPanel.js'),
        ]);
    return {
        ensureTranslationRuntime,
        TranslateNamesPanel: panelModule.default,
    };
}

describe('TranslateNamesPanel', () => {
    it('persists empty translation when user clears the field and stays empty after refresh', async () => {
        const { ensureTranslationRuntime, TranslateNamesPanel } = await loadModules();
        const runtime = ensureTranslationRuntime();
        runtime.sourceLang = 'ja';
        runtime.targetLang = 'en';
        runtime.translationCache.clear();
        runtime.translationCache.set('actor_name:ja-en-太郎', 'BadName');
        runtime.nameProfilesByLangPair = {
            'ja-en': {
                太郎: { gender: 'male', translation: 'BadName' },
            },
        };
        vi.spyOn(runtime, 'persistCache').mockImplementation(() => {});
        vi.spyOn(runtime, 'saveSettings').mockImplementation(() => {});
        window.$dataActors = [null, { id: 1, name: '太郎' }];
        window.$gameActors = { _data: [null, { _name: 'BadName' }] };

        const vm = {
            ...TranslateNamesPanel.data(),
            ...TranslateNamesPanel.methods,
        };
        for (const [key, fn] of Object.entries(TranslateNamesPanel.methods)) {
            vm[key] = fn.bind(vm);
        }

        vm.refresh();
        expect(vm.entries).toHaveLength(1);
        expect(vm.entries[0].translation).toBe('BadName');

        // Simulate backspacing down to the last character and then clearing it completely.
        vm.onTranslationChange(vm.entries[0], 'B');
        expect(runtime.translationCache.get('actor_name:ja-en-太郎')).toBe('B');

        vm.onTranslationChange(vm.entries[0], '');
        expect(runtime.translationCache.get('actor_name:ja-en-太郎')).toBe('');
        expect(runtime.nameProfilesByLangPair['ja-en']['太郎']).toEqual({ gender: 'male' });
        expect(window.$gameActors._data[1]._name).toBe('太郎');

        // Simulate switching away and returning to the panel.
        vm.refresh();
        expect(vm.entries[0].translation).toBe('');
    });
});
