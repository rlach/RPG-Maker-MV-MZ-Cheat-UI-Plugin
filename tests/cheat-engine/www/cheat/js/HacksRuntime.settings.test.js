import { expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KeyValueStorage } from '../../../../../cheat-engine/www/cheat/js/KeyValueStorage.js';
import { GameTranslationSettings } from '../../../../../cheat-engine/www/cheat/js/GameTranslationSettings.js';

const state = vi.hoisted(() => ({ directory: '' }));
vi.mock(
    '../../../../../cheat-engine/www/cheat/js/GameTranslationSettings.js',
    async (importOriginal) => {
        const actual = await importOriginal();
        return {
            ...actual,
            GameTranslationSettings: class extends actual.GameTranslationSettings {
                constructor() {
                    super(state.directory);
                }
            },
        };
    }
);

it('migrates enabled hacks, preserves cache overrides and saves changes alongside translation settings', async () => {
    state.directory = mkdtempSync(join(tmpdir(), 'cheat-hacks-settings-'));
    vi.stubGlobal('window', {});
    const legacyRead = vi
        .spyOn(KeyValueStorage.prototype, 'getItem')
        .mockReturnValue(JSON.stringify({ bitmapGetPixelLongFix: true, mvLocalSavePathFix: true }));
    try {
        const store = new GameTranslationSettings();
        store.updateSection('hacks', { bitmapGetPixelLongFix: false });
        store.updateSection('translation', { maxLineWidth: 32 });
        const { HACKS_RUNTIME } =
            await import('../../../../../cheat-engine/www/cheat/js/HacksRuntime.js');
        expect(HACKS_RUNTIME.getState()).toEqual({
            improveFailedResourcesModal: false,
            bitmapGetPixelLongFix: false,
            mvLocalSavePathFix: true,
        });
        HACKS_RUNTIME.setBitmapGetPixelLongFixEnabled(true);
        expect(store.read().hacks).toEqual({
            improveFailedResourcesModal: false,
            bitmapGetPixelLongFix: true,
            mvLocalSavePathFix: true,
        });
        expect(store.read().translation.maxLineWidth).toBe(32);
        HACKS_RUNTIME.setImproveFailedResourcesModalEnabled(true);
        expect(store.read().hacks.improveFailedResourcesModal).toBe(true);
    } finally {
        legacyRead.mockRestore();
        vi.unstubAllGlobals();
        rmSync(state.directory, { recursive: true, force: true });
    }
});
