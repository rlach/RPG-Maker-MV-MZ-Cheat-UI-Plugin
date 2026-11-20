import { afterEach, expect, it, vi } from 'vitest';
import { SceneCustomMenuTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/SceneCustomMenuTranslator.js';
afterEach(() => vi.unstubAllGlobals());
it('collects both toggle states from referenced display variables only', async () => {
    const translator = new SceneCustomMenuTranslator();
    translator.collectDisplayReferences('\\v[35]');
    translator.collectCommandTexts([
        { code: 122, parameters: [35, 35, 0, 4, '"汗 OFF"'] },
        { code: 122, parameters: [35, 35, 0, 4, '"汗 ON"'] },
        { code: 122, parameters: [99, 99, 0, 4, '"内部識別子"'] },
    ]);
    await translator.collectAdditionalTexts();
    expect([...translator.entries.keys()]).toEqual(['汗 OFF', '汗 ON']);
});
it('translates expanded text for drawing and measurement while keeping toggle values intact', () => {
    vi.stubGlobal('window', globalThis);
    const values = { 35: '汗 OFF' };
    const translator = new SceneCustomMenuTranslator();
    translator.getRuntime = () => ({});
    translator.resolveText = (text) => ({ '汗 OFF': 'Sweat OFF', '汗 ON': 'Sweat ON' })[text] || text;
    const target = {
        convertEscapeCharacters(text) { return text.replace(/\\v\[(\d+)\]/gi, (_, id) => values[id]); },
        drawTextEx(text) { return this.convertEscapeCharacters(text); },
        textSizeEx(text) { return { width: this.convertEscapeCharacters(text).length }; },
    };
    translator._installCommandWindowHooks(target);
    expect(target.drawTextEx('\\v[35]')).toBe('Sweat OFF');
    expect(target.textSizeEx('\\v[35]').width).toBe(9);
    expect(values[35]).toBe('汗 OFF');
    values[35] = '汗 ON';
    expect(target.drawTextEx('\\v[35]')).toBe('Sweat ON');
    expect(values[35]).toBe('汗 ON');
});
