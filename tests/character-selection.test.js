import { afterEach, expect, it, vi } from 'vitest';
import { CharacterSelectionTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/CharacterSelectionTranslator.js';
afterEach(() => vi.unstubAllGlobals());

it('harvests mission prompts and descriptions without harvesting portrait, audio or switch data', async () => {
    const parameters = {
        characterDescriptions: JSON.stringify([
            '柊アカネ:調査室 捜査一課所属',
            '哀川ミズキ:調査室 捜査一課所属',
        ]),
        characterUnavailableDescriptions: JSON.stringify(['現在欠勤中', '現在欠勤中']),
        characterImages: '["sentaku_aka_001"]',
        characterSwitches: '["234"]',
        selectionSE: 'Cursor1',
    };
    vi.stubGlobal('window', {
        $plugins: [{ name: 'CharacterSelection', status: true, parameters }],
    });
    const source = `this._titleWindow.drawText("誰を同行させますか", 0, 0, 400, 'left');
        this._confirmationWindow.drawText("彼女でいいですか？", 0, 0, 1024, 'center');
        this._confirmationWindow.drawText("Z:決定(左クリック)  X:キャンセル(右クリック)", 0, 36, 1024, 'center');`;
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: true, text: async () => source }))
    );
    const before = JSON.stringify(parameters);
    const translator = new CharacterSelectionTranslator();
    expect(translator.detectPlugin()).toBe(true);
    await translator.precomputeCounts();
    for (const text of [
        '誰を同行させますか',
        '彼女でいいですか？',
        'Z:決定(左クリック)  X:キャンセル(右クリック)',
        '柊アカネ:調査室 捜査一課所属',
        '哀川ミズキ:調査室 捜査一課所属',
        '現在欠勤中',
        '選択不可',
    ])
        expect(translator.entries.has(text), text).toBe(true);
    for (const text of ['sentaku_aka_001', '234', 'Cursor1'])
        expect(translator.entries.has(text)).toBe(false);
    expect(JSON.stringify(parameters)).toBe(before);
    const runtime = {
        isTranslationEnabled: () => true,
        getCacheKey: (text, type) => `${type}:${text}`,
        translationCache: new Map([
            ['plugin_character_selection:彼女でいいですか？', 'Choose her?'],
        ]),
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    class Base {
        drawText(text, ...args) {
            return [text, ...args];
        }
    }
    translator.getRuntime = () => runtime;
    translator.hookDrawing(Base.prototype, 'drawText');
    expect(new Base().drawText('彼女でいいですか？', 0, 36, 1024, 'center')).toEqual([
        'Choose her?',
        0,
        36,
        1024,
        'center',
    ]);
    runtime.isTranslationEnabled = () => false;
    expect(new Base().drawText('彼女でいいですか？')[0]).toBe('彼女でいいですか？');
});
