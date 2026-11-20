import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { displayedMessageText, recordDisplayedMessage } from '../cheat-engine/www/cheat/js/DisplayedMessageText.js';
vi.hoisted(() => { globalThis.window = {}; });
import { MessageLogStore } from '../cheat-engine/www/cheat/js/MessageLogStore.js';
import TextLogPanel from '../cheat-engine/www/cheat/panels/TextLogPanel.js';
it('snapshots expanded names and variables, removes formatting, and keeps icon references readable', () => {
    let name = 'Alice', value = 42;
    const win = { convertEscapeCharacters(text) { return text.replace(/\\N\[1\]/g, name).replace(/\\V\[2\]/g, String(value)).replace(/\\/g, '\x1b'); } };
    const message = { allText: () => '\\C[2]\\N[1] has \\V[2] coins.\\.!', choices: () => ['Yes'], _speakerName: '\\N[1]' };
    const store = new MessageLogStore();
    recordDisplayedMessage(message, win, null, store);
    name = 'Bob'; value = 99;
    expect(store.getEntries()[0]).toMatchObject({ text: 'Alice has 42 coins.!', speakerName: 'Alice' });
    expect(displayedMessageText('\x1bI[4]Potion\x1bFS[20]', null, true)).toBe('[Icon 4]Potion');
});
it('updates the same message after translation and final choices, and marks the selected option', () => {
    const store = new MessageLogStore();
    const message = { allText: () => '質問', choices: () => ['はい', 'いいえ'] };
    const win = { _textState: { text: '質問' }, convertEscapeCharacters: x => x };
    recordDisplayedMessage(message, win, null, store);
    win._textState.text = 'Question?';
    recordDisplayedMessage(message, win, { commandName: i => ['Yes', 'No'][i], convertEscapeCharacters: x => x }, store);
    expect(store.getEntries()).toHaveLength(1);
    store.updateEntry(message.__cheatMessageLogId, { selectedChoice: 1 });
    const formatted = TextLogPanel.methods.formatMessageEntry(store.getEntries()[0]);
    expect(formatted).toContain('Question?\n[1] Yes\n▶ [2] No');
    expect(formatted).not.toContain('質問');
    message.__cheatMessageLogId = null; message.__cheatDisplayedLogBody = null;
    recordDisplayedMessage(message, win, null, store);
    expect(store.getEntries()).toHaveLength(2);
});
vi.mock('../cheat-engine/www/cheat/translate-engines/batch-manager/TranslationBatchManagerFactory.js', () => ({ createTranslationBatchManager: vi.fn() }));
it('updates a previously logged message when live translation replaces its text state', async () => {
    const { MESSAGE_LOG } = await import('../cheat-engine/www/cheat/js/MessageLogStore.js');
    const { translateOnTheFlyMessageMethods } = await import('../cheat-engine/www/cheat/js/translation-runtime/TranslateOnTheFlyMessageMethods.js');
    MESSAGE_LOG.clear();
    const message = { _texts: ['原文'], allText() { return this._texts.join('\n'); }, choices: () => [] };
    vi.stubGlobal('$gameMessage', message);
    const win = { _textState: { text: '原文' }, convertEscapeCharacters: text => text.replace(/\\N\[1\]/g, 'Alice') };
    recordDisplayedMessage(message, win, null, MESSAGE_LOG);
    translateOnTheFlyMessageMethods.replaceMessageText.call({ currentMessageWindow: win }, 'Hello \\N[1]');
    expect(MESSAGE_LOG.getEntries()).toHaveLength(1);
    expect(MESSAGE_LOG.getEntries()[0]).toMatchObject({ text: 'Hello Alice', translated: true });
    vi.unstubAllGlobals();
});
it('reads native and plugin name boxes without invoking message-level name parsing', async () => {
    const { displayedSpeakerName } = await import('../cheat-engine/www/cheat/js/DisplayedMessageText.js');
    class Base { convertEscapeCharacters(text) { return text.replace(/\\V\[1\]/g, 'Alice').replace(/\\/g, '\x1b'); } }
    vi.stubGlobal('Window_Base', Base);
    const window = { _nameWindow: { _text: '\\C[2]\\V[1]', active: true }, convertEscapeCharacters: vi.fn(() => { throw new Error('mutating parser'); }) };
    expect(displayedSpeakerName({ _speakerName: '' }, window)).toBe('Alice');
    expect(window._nameWindow._text).toBe('\\C[2]\\V[1]');
    expect(window.convertEscapeCharacters).not.toHaveBeenCalled();
    expect(displayedMessageText('', window)).toBe('');
    window._nameWindow.active = false;
    expect(displayedSpeakerName({ _speakerName: '' }, window)).toBe('');
    expect(displayedSpeakerName({ _speakerName: 'Native' }, { _nameBoxWindow: { _name: 'Native', visible: true } })).toBe('Native');
    vi.unstubAllGlobals();
});
