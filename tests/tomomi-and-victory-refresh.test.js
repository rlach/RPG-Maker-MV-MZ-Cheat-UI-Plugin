import { afterEach, expect, it, vi } from 'vitest';
import { YepVictoryAftermathTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/YepVictoryAftermathTranslator.js';
import { TomomiUiTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/TomomiUiTranslator.js';
import { SourceTextCatalogTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/SourceTextCatalogTranslator.js';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('repaints current EXP after a late refresh without advancing ticks or granting rewards', () => {
    class Victory {
        refresh() { this.painted = ['portraits']; return 'native'; }
        drawAllGauges() { this.painted.push('gauge:' + this._tick); }
        updateTicks() { if (this._tick >= 15) return; this._tick++; this.drawAllGauges(); }
    }
    vi.stubGlobal('window', { Window_VictoryExp: Victory });
    vi.spyOn(SourceTextCatalogTranslator.prototype, 'enablePluginTranslation').mockReturnValue(true);
    const t = new YepVictoryAftermathTranslator();
    vi.spyOn(t, 'getRuntime').mockReturnValue({});
    let active = true;
    vi.spyOn(t, 'isRuntimeTranslationActive').mockImplementation(() => active);
    expect(t.enablePluginTranslation()).toBe(true);
    const w = new Victory();
    w.refresh(); expect(w.painted).toEqual(['portraits']); // Constructor: no tick exists yet.
    for (const tick of [0, 7, 15]) {
        w._tick = tick;
        expect(w.refresh()).toBe('native');
        expect(w.painted).toEqual(['portraits', 'gauge:' + tick]);
        expect(w._tick).toBe(tick);
    }
    w.updateTicks(); expect(w._tick).toBe(15);
    active = false; w.refresh(); expect(w.painted).toEqual(['portraits']);
});
it('collects only owned display-variable assignments, retaining conditions, values and identifiers', () => {
    const t = new TomomiUiTranslator();
    t.extractCatalog = () => ({ entries: [{ text: '処女' }] });
    const list = [
        { code: 122, parameters: [2, 2, 0, 0, '城で情報を集める'] },
        { code: 122, parameters: [4, 4, 0, 0, 'logic identifier'] },
        { code: 355, parameters: ['$gameVariables.setValue(69, "処女");'] },
        { code: 111, parameters: [1, 69, 0, '処女', 0] },
    ];
    const before = JSON.stringify(list);
    t.collectDisplayAssignments(list, new Set([2, 69, 75]));
    expect([...t.entries.keys()]).toEqual(['城で情報を集める', '処女']);
    expect(JSON.stringify(list)).toBe(before);
});
