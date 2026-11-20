import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { ManoQuestTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/ManoQuestTranslator.js';
beforeEach(() => vi.stubGlobal('window', globalThis));
afterEach(() => vi.unstubAllGlobals());
it('collects quest prose and UI labels while preserving IDs, conditions and rewards', async () => {
    const quests = [{ id: 54, name: '悪に裁きを２', requester: '依頼者', cond_s: 12,
        message: { displayed: ['進捗： \\V[21]/10 達成'], finished: ['ありがとう'] }, reward: [{ type: 'gold', value: 2000 }] }];
    const original = structuredClone(quests);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => quests })));
    const t = new ManoQuestTranslator();
    t.findPluginEntry = () => ({ parameters: { goldText: '報酬金', filterList: JSON.stringify([JSON.stringify({ name: '全部', filter: '0' })]) } });
    await t.collectAdditionalTexts();
    expect([...t.entries.keys()]).toEqual(['悪に裁きを２', '依頼者', '進捗： \\V[21]/10 達成', 'ありがとう', '報酬金', '全部']);
    expect(quests).toEqual(original);
});
it('hooks private quest windows before escape expansion without changing quest data', () => {
    class QuestWindow { drawText(text) { return text; } drawTextEx(text) { return text; } }
    vi.stubGlobal('Mano_QuestSystem', { Widnow_QuestList: QuestWindow });
    const t = new ManoQuestTranslator();
    t.getRuntime = () => ({}); t.precomputeCounts = async () => {};
    t.resolveText = text => text.replace('悪に裁きを２', 'Punish Evil 2');
    expect(t.enablePluginTranslation()).toBe(true);
    expect(new QuestWindow().drawText('054:悪に裁きを２')).toBe('054:Punish Evil 2');
});
function descriptionWindow(translator) {
    class Description {
        constructor() { this._message = ['first', 'second', 'progress']; this.drawn = []; this._scrollY = 0; this.visible = true; }
        lineHeight() { return 20; }
        textPadding() { return 4; }
        topRow() { return this._scrollY / 20; }
        maxItems() { return this._message.length; }
        drawAllItems() { this.nativeDraw = true; }
        processCharacter(state) {
            const c = state.text[state.index++];
            if (c === '\n' || state.column === 12) { state.y += state.height; state.column = 0; }
            if (c !== '\n') state.column++;
        }
        drawTextEx(text, x, y) {
            const state = { text: text.replace(/\\V\[21\]/g, '1'), index: 0, y, height: 20, column: 0 };
            while (state.index < state.text.length) this.processCharacter(state);
            this.drawn.push({ text: state.text, y, bottom: state.y + state.height });
        }
        setMassage(lines) { this._message = lines; }
        resetScroll() { this._scrollY = 0; }
        update() {}
        isOpen() { return true; }
        isTouchedInsideFrame() { return true; }
        scrollDown() { this._scrollY += 20; }
    }
    translator.installMessageLayout(Description.prototype);
    return new Description();
}
it('stacks wrapped and multiline translations by actual rendered height and keeps source keys intact', () => {
    const translator = new ManoQuestTranslator();
    translator.getRuntime = () => ({});
    translator.isRuntimeTranslationActive = () => true;
    translator.resolveText = vi.fn(text => ({ first: 'The location of the wilderness boss has been revealed.', second: 'Defeat them\nand expose the organization.', progress: 'Progress: \\V[21]/1 Achieved' })[text] || text);
    const win = descriptionWindow(translator);
    const sources = [...win._message];
    win.drawAllItems();
    expect(win.drawn[1].y).toBe(win.drawn[0].bottom);
    expect(win.drawn[2].y).toBe(win.drawn[1].bottom);
    expect(win.maxItems()).toBeGreaterThan(sources.length);
    expect(win.drawn[2].text).toContain('Progress: 1/1 Achieved');
    expect(win._message).toEqual(sources);
    expect(Object.hasOwn(win, 'processCharacter')).toBe(false);
    win.drawn = []; win._scrollY = 20; win.drawAllItems();
    expect(win.drawn[0].y).toBe(-20);
    expect(win.drawn[1].y).toBe(win.drawn[0].bottom);
});
it('restores native rendering when disabled and resets scroll when the quest changes', () => {
    const translator = new ManoQuestTranslator();
    translator.getRuntime = () => ({});
    translator.isRuntimeTranslationActive = () => false;
    const win = descriptionWindow(translator);
    win._cheatQuestVisualRows = 20;
    win.drawAllItems();
    expect(win.nativeDraw).toBe(true);
    expect(win.maxItems()).toBe(3);
    win._scrollY = 40; win.setMassage(['new quest']);
    expect(win._scrollY).toBe(0);
    vi.stubGlobal('TouchInput', { wheelY: 40 }); win.update();
    expect(win._scrollY).toBe(20);
});
it('restores the renderer and translation guard when a native drawing plugin throws', () => {
    const translator = new ManoQuestTranslator();
    translator.getRuntime = () => ({});
    translator.isRuntimeTranslationActive = () => true;
    translator.resolveText = text => text;
    const win = descriptionWindow(translator);
    win.drawTextEx = () => { throw new Error('draw failed'); };
    expect(() => win.drawAllItems()).toThrow('draw failed');
    expect(translator.drawing).toBe(0);
    expect(Object.hasOwn(win, 'processCharacter')).toBe(false);
});
