import { beforeAll, beforeEach, expect, it, vi } from 'vitest';

let NRP_MessageWindowTranslator;
let translator;

beforeAll(async () => {
    globalThis.window = globalThis;
    ({ NRP_MessageWindowTranslator } =
        await import('../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/NRP_MessageWindowTranslator.js'));
});

beforeEach(() => {
    globalThis.Window_Message = class {
        calcWindowHeight() {
            return 200;
        }
        lineHeight() {
            return 36;
        }
        fittingHeight(lines) {
            return lines * 36 + 24;
        }
        newPage(state) {
            state.y = 12;
        }
        processNewLine(state) {
            state.y += 36;
            if (this.needsNewPage(state)) this.startPause();
        }
        needsNewPage(state) {
            return !this.isEndOfText(state) && state.y > 180;
        }
        isEndOfText(state) {
            return state.index >= state.text.length;
        }
        startPause = vi.fn();
    };
    translator = new NRP_MessageWindowTranslator();
    vi.spyOn(translator, 'isRuntimeTranslationActive').mockReturnValue(true);
    vi.spyOn(translator, 'getPluginSettings').mockReturnValue({ maxLinesPerPage: 3 });
    translator.enablePluginTranslation();
});

it('pauses before the fourth line and resets the limit on the next page', () => {
    const message = new Window_Message();
    const state = { text: 'remaining text', index: 0, y: 0 };
    message.newPage(state);
    message.processNewLine(state);
    message.processNewLine(state);
    expect(message.startPause).not.toHaveBeenCalled();
    message.processNewLine(state);
    expect(message.startPause).toHaveBeenCalledOnce();
    message.newPage(state);
    expect(message.needsNewPage(state)).toBe(false);
    expect(state.text).toBe('remaining text');
});

it.each([false, true])(
    'preserves plugin pagination when disabled or using default (%s)',
    (active) => {
        translator.isRuntimeTranslationActive.mockReturnValue(active);
        translator.getPluginSettings.mockReturnValue({ maxLinesPerPage: 0 });
        const message = new Window_Message();
        const state = { text: 'text', index: 0, y: 0 };
        message.newPage(state);
        for (let i = 0; i < 4; i++) message.processNewLine(state);
        expect(message.startPause).not.toHaveBeenCalled();
        message.processNewLine(state);
        expect(message.startPause).toHaveBeenCalledOnce();
    }
);

it('does not add an empty final page or share counts between windows', () => {
    const message = new Window_Message();
    const state = { text: 'text', index: 4, y: 0 };
    message.newPage(state);
    for (let i = 0; i < 3; i++) message.processNewLine(state);
    expect(message.startPause).not.toHaveBeenCalled();
    const other = new Window_Message();
    state.index = 0;
    other.newPage(state);
    expect(other.needsNewPage(state)).toBe(false);
});
