import { afterEach, expect, it, vi } from 'vitest';
import { CustomSaveLoadTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/CustomSaveLoadTranslator.js';

afterEach(() => vi.unstubAllGlobals());

it('scans save summary templates and translates evaluated bitmap lines without changing saved values', async () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$dataCommonEvents', []);
    vi.stubGlobal('$dataMapInfos', []);
    vi.stubGlobal('fetch', async () => ({ ok: true, text: async () => '' }));
    const translator = new CustomSaveLoadTranslator();
    translator.findPluginEntry = () => ({
        name: 'CustomSaveLoad',
        status: true,
        parameters: { SaveVariableText: 'プレイ時間：<time>\\n日数:8月<102>日\\n好感度:<222>\\n' },
    });
    await translator.precomputeCounts();
    expect([...translator.entries.keys()]).toEqual([
        'プレイ時間：\\COT[0]',
        '日数:8月\\COT[0]日',
        '好感度:\\COT[0]',
    ]);
    const translations = new Map([
        ['プレイ時間：\\COT[0]', 'Play time: \\COT[0]'],
        ['日数:8月\\COT[0]日', 'Date: August \\COT[0]'],
        ['好感度:\\COT[0]', 'Affection: \\COT[0]'],
    ]);
    translator.isRuntimeTranslationActive = () => true;
    translator.prepareDynamicValueTag = () => {};
    translator.resolveRuntimeTranslation = (text) => translations.get(text) || text;
    translator.getRuntime = () => ({});
    const draw = vi.fn();
    const bitmap = { drawText: draw };
    translator.hookDrawing(bitmap, 'drawText');
    bitmap.drawText('プレイ時間：01:24:51', 1, 2, 300, 40);
    expect(draw).toHaveBeenCalledWith('Play time: 01:24:51', 1, 2, 300, 40);
    expect(translator.resolveText('日数:8月10日', {})).toBe('Date: August 10');
    expect(translator.resolveText('好感度:71', {})).toBe('Affection: 71');
    translator.isRuntimeTranslationActive = () => false;
    expect(translator.resolveText('好感度:71', {})).toBe('好感度:71');
});
