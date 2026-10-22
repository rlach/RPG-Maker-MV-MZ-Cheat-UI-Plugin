import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTableSessionState } from '../../../../../cheat-engine/www/cheat/js/TableSessionState.js';
import { getPinnedVariableIds, setVariablePinned } from '../../../../../cheat-engine/www/cheat/js/VariablePins.js';

const storage = vi.hoisted(() => ({ settings: {} }));
vi.mock('../../../../../cheat-engine/www/cheat/js/UnifiedSettings.js', () => ({
    getUnifiedSetting: (key, fallback) => storage.settings[key] ?? fallback,
    setUnifiedSetting: (key, value) => { storage.settings[key] = value; },
}));

beforeEach(() => {
    storage.settings = {};
    vi.stubGlobal('window', {});
});
afterEach(() => vi.unstubAllGlobals());

describe('overlay table session state', () => {
    it('retains filters, search and page independently for each table', () => {
        Object.assign(getTableSessionState('items'), { onlyOwnedItems: true, excludeNameless: true, page: 5, search: 'potion' });
        Object.assign(getTableSessionState('variables'), { onlyPinned: true, page: 3 });
        expect(getTableSessionState('items')).toMatchObject({ onlyOwnedItems: true, excludeNameless: true, page: 5, search: 'potion' });
        expect(getTableSessionState('variables')).toMatchObject({ onlyPinned: true, page: 3 });
        expect(getTableSessionState('armors')).toMatchObject({ onlyOwnedItems: false, page: 1 });
        expect(storage.settings).toEqual({});
    });

    it('survives a separate overlay window but resets with the game window', () => {
        const gameWindow = window;
        getTableSessionState('variables').page = 5;
        vi.stubGlobal('window', { __CHEAT_EXTERNAL_WINDOW__: true, opener: gameWindow });
        expect(getTableSessionState('variables').page).toBe(5);
        vi.stubGlobal('window', {});
        expect(getTableSessionState('variables').page).toBe(1);
    });
});

describe('variable pins', () => {
    it('persists pins in ordinary settings independently of session filters', () => {
        setVariablePinned(7, true);
        setVariablePinned(2, true);
        setVariablePinned(7, true);
        expect(storage.settings).toEqual({ pinnedVariableIds: [2, 7] });
        vi.stubGlobal('window', {});
        expect(getPinnedVariableIds()).toEqual([2, 7]);
        expect(getTableSessionState('variables').onlyPinned).toBe(false);
        setVariablePinned(7, false);
        expect(getPinnedVariableIds()).toEqual([2]);
    });

    it('ignores invalid IDs and keeps unrelated local settings', () => {
        storage.settings = { pinnedVariableIds: [0, -1, '4', 4, null], ui: { size: 200 } };
        expect(getPinnedVariableIds()).toEqual([4]);
        setVariablePinned(0, true);
        expect(storage.settings).toEqual({ pinnedVariableIds: [4], ui: { size: 200 } });
    });
});
