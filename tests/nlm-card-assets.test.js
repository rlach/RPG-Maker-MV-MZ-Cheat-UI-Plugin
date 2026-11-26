import { afterEach, expect, it, vi } from 'vitest';
import { NlmCardItemSelectTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/NlmCardItemSelectTranslator.js';

afterEach(() => vi.unstubAllGlobals());

function setup() {
    const load = vi.fn(function (filename, hue) { return { filename, hue, receiver: this }; });
    const items = [null, {
        name: 'Drain', note: '<CIPic:Drain><CILayer:Common Layer><BILayer:Battle Layer>',
        meta: { CIPic: 'Drain', CILayer: 'Common Layer', BILayer: 'Battle Layer' },
        _translateOriginal: { name: 'ドレイン', note: '<CIPic:ドレイン><CILayer:共通><BILayer:戦闘>' },
    }];
    const skills = [null, { note: '<CSPic:Psychic Pulse><CSLayer:Skill Layer>',
        _translateOriginal: { note: '<CSPic:サイキックパルス><CSLayer:スキル>' } }];
    const root = { $plugins: [{ name: 'NLM_CardItemSelectMZ', status: true }],
        ImageManager: { loadPicture: load }, $dataItems: items, $dataSkills: skills };
    vi.stubGlobal('window', root);
    const translator = new NlmCardItemSelectTranslator();
    const runtime = { enabled: true, translationCache: new Map(), getCacheKey: (text, type) => `${type}:${text}` };
    translator.getRuntime = () => runtime;
    return { translator, root, runtime, items, skills, load };
}

it('only detects an enabled NLM card plugin and waits for ImageManager', () => {
    const { root, translator } = setup();
    expect(translator.detectPlugin()).toBe(true);
    root.$plugins[0].status = false;
    expect(translator.detectPlugin()).toBe(false);
    delete root.ImageManager;
    expect(translator.enablePluginTranslation()).toBe(false);
});

it('loads original card and layer filenames for list, preview and script callers without mutating data', () => {
    const { root, translator, runtime, items, skills, load } = setup();
    const before = JSON.stringify({ items, skills });
    expect(translator.enablePluginTranslation()).toBe(true);
    for (const [display, source] of [['Drain', 'ドレイン'], ['Common Layer', '共通'], ['Battle Layer', '戦闘'], ['Psychic Pulse', 'サイキックパルス'], ['Skill Layer', 'スキル']]) {
        expect(root.ImageManager.loadPicture(display, 32)).toEqual({ filename: source, hue: 32, receiver: root.ImageManager });
    }
    runtime.enabled = false;
    expect(root.ImageManager.loadPicture('Drain').filename).toBe('ドレイン');
    expect(root.ImageManager.loadPicture('ドレイン').filename).toBe('ドレイン');
    expect(root.ImageManager.loadPicture('unrelated').filename).toBe('unrelated');
    expect(root.ImageManager.loadPicture(undefined).filename).toBeUndefined();
    expect(JSON.stringify({ items, skills })).toBe(before);
    expect(runtime.translationCache.size).toBe(0);
    expect(load).toHaveBeenCalled();
    expect(translator.collectUntranslated()).toEqual([]);
});

it('uses cached translated note aliases but preserves actual authored English filenames and ambiguity', () => {
    const { translator, runtime, items } = setup();
    runtime.translationCache.set('item_note:<CIPic:別の画像>', '<CIPic:Cached Alias>');
    items.push({ note: '<CIPic:別の画像>', _translateOriginal: { note: '<CIPic:別の画像>' } });
    expect(translator.resolvePictureSource('Cached Alias')).toBe('別の画像');
    items.push({ note: '<CIPic:Drain>' });
    expect(translator.resolvePictureSource('Drain')).toBe('Drain');
    items.push({ note: '<CIPic:Cached Alias>', _translateOriginal: { note: '<CIPic:もう一つ>' } });
    expect(translator.resolvePictureSource('Cached Alias')).toBe('Cached Alias');
});
