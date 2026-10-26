import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InazumaForestiaTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/InazumaForestiaTranslator.js';
import { TRPSkitTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/TrpSkitTranslator.js';
import { TagManager } from '../../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/TagManager.js';
import { isKnownDisplayTranslation } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/NotificationTranslationContext.js';
let runtime;
beforeEach(() => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$plugins', [{ name: 'inazuma/core/text/Text', status: true, parameters: {} }]);
    runtime = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        engine: { addPluginTags: vi.fn() },
        translationCache: new Map(),
        getCacheKey: (s, t) => t + ':' + s,
        hasUsableCacheValue(k) {
            return this.translationCache.has(k);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    vi.stubGlobal('__TranslationRuntime', runtime);
    vi.stubGlobal('__ensureTranslationRuntime', undefined);
});
afterEach(() => vi.unstubAllGlobals());
async function prepare() {
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url) => ({
            ok: true,
            text: async () =>
                url === 'data/QuestContent.json'
                    ? JSON.stringify([
                          null,
                          {
                              id: 1,
                              title: '\\n[3]との出会い',
                              desc: 'カブを育てよう！\\n\\N[1]に教わった。',
                              asset: '画像ファイル',
                          },
                          {
                              id: 302,
                              desc: '町の住人に引越しの挨拶をしよう\\n日中の時間帯に牧場の南東にある\\QPlaceへいこう！',
                          },
                      ])
                    : url === 'data/Text.json'
                      ? JSON.stringify([
                            null,
                            { id: 'PRICE', value: '売値は {0}\\Gになります' },
                            { id: 'LABEL', value: '進行中' },
                        ])
                      : url === 'data/FishingArea.json'
                        ? JSON.stringify([
                              { id: 1, name: '川' },
                              { id: 4, name: '泉' },
                              { id: 5, name: '地底湖' },
                          ])
                        : '[]',
        }))
    );
    const translator = new InazumaForestiaTranslator();
    await translator.precomputeCounts();
    return translator;
}
function cache(translator, text, translated) {
    runtime.translationCache.set(runtime.getCacheKey(text, translator.getCacheType()), translated);
}

it('translates short fishing-area names and preserves longer newline-prefixed controls', async () => {
    const translator = await prepare();
    for (const [source, target] of [
        ['川', 'River'],
        ['泉', 'Spring'],
        ['地底湖', 'Underground Lake'],
    ])
        cache(translator, source, target);
    expect(translator.resolveText('川、泉、地底湖', runtime)).toBe(
        'River、Spring、Underground Lake'
    );
    translator.addDisplayText('\\name ×\\count: \\gold');
    expect(translator.entries.has('\\name ×\\count: \\gold')).toBe(true);
    translator.addDisplayText('場所\\GMname[12]へ');
    cache(translator, '場所\\COT[0]へ', 'Go to \\COT[0]');
    expect(translator.resolveText('場所\\GMname[12]へ', runtime)).toBe('Go to \\GMname[12]');
});

it('translates quest descriptions before location expansion and nested notification arguments before formatting', async () => {
    const translator = await prepare();
    const raw = '町の住人に引越しの挨拶をしよう\\n日中の時間帯に牧場の南東にある\\QPlaceへいこう！';
    const canonical = raw.replace('\\n', '\n').replace('\\QPlace', '\\COT[0]');
    cache(translator, canonical, 'Greet the townspeople.\nVisit \\COT[0] during the day!');
    cache(translator, '\\COT[0]との出会い', 'Meeting with \\COT[0]');
    const notify = vi.fn();
    vi.stubGlobal('Iz', {
        Text: { get: () => '' },
        Life: {
            Quest: {
                convertEscapeCharacterQuest: (_id, text) =>
                    text.replace(/\\Qplace/gi, "Retrie's Farm"),
            },
        },
        String: { format: (text, ...args) => text.replace(/\{(\d+)\}/g, (_, id) => args[id]) },
        System: { notify },
    });
    class Text {
        setText() {}
    }
    vi.stubGlobal('Sprite_Text', Text);
    vi.stubGlobal('Sprite_TextEx', class extends Text {});
    const parent = vi
        .spyOn(
            Object.getPrototypeOf(InazumaForestiaTranslator.prototype),
            'enablePluginTranslation'
        )
        .mockReturnValue(true);
    try {
        expect(translator.enablePluginTranslation()).toBe(true);
        expect(Iz.Life.Quest.convertEscapeCharacterQuest(11, raw)).toBe(
            "Greet the townspeople.\nVisit Retrie's Farm during the day!"
        );
        expect(Iz.String.format('Started {0}', '\\n[3]との出会い')).toBe(
            'Started Meeting with \\n[3]'
        );
        expect(isKnownDisplayTranslation(runtime, 'Started Meeting with \\n[3]')).toBe(true);
        expect(translator.resolveText(raw.replace('\\QPlace', "Retrie's Farm"), runtime)).toBe(
            "Greet the townspeople.\nVisit Retrie's Farm during the day!"
        );
        runtime.enabled = false;
        expect(Iz.Life.Quest.convertEscapeCharacterQuest(11, raw)).toBe(
            raw.replace('\\QPlace', "Retrie's Farm")
        );
    } finally {
        parent.mockRestore();
    }
});

it('reads explicit text fields without event scans, IDs, conditions or image fields', async () => {
    const translator = await prepare();
    expect(translator.detectPlugin()).toBe(true);
    expect(translator.entries.has('\\COT[0]との出会い')).toBe(true);
    expect(translator.entries.has('画像ファイル')).toBe(false);
    expect(translator.entries.has('PRICE')).toBe(false);
    expect(
        fetch.mock.calls.some(([url]) => /data\/(?:MapInfos|Map\d+|CommonEvents)\.json/.test(url))
    ).toBe(false);
    const count = translator.getCachedCountsSync({ runtime });
    cache(translator, '進行中', 'In progress');
    expect(translator.getCachedCountsSync({ runtime }).left).toBe(count.left - 1);
});

it('uses one canonical key for raw macros, interpolated names and formatter values', async () => {
    const translator = await prepare();
    cache(translator, '\\COT[0]との出会い', 'Meeting \\COT[0]');
    expect(translator.resolveText('\\n[3]との出会い', runtime)).toBe('Meeting \\n[3]');
    expect(translator.resolveText('Retrieとの出会い', runtime)).toBe('Meeting Retrie');
    cache(translator, '売値は \\COT[0]\\Gになります', 'Sale price: \\COT[0]\\G');
    expect(translator.resolveText('売値は {0}\\Gになります', runtime)).toBe('Sale price: {0}\\G');
    expect(translator.resolveText('売値は 250\\Gになります', runtime)).toBe('Sale price: 250\\G');
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith(
        'plugin_inazuma_forestia:\\COT[0]との出会い',
        expect.any(Object)
    );
    expect(
        runtime.trackCacheKeyUsage.mock.calls.some(([key]) => key.endsWith('Retrieとの出会い'))
    ).toBe(false);
    translator.addDisplayText('{0}');
    expect(translator.entries.get('\\COT[0]').parts).toBeNull();
});

it('translates central labels before formatting and sprites before glyph drawing, preserving database values', async () => {
    const translator = await prepare();
    cache(translator, '進行中', 'In progress');
    cache(translator, '\\COT[0]との出会い', 'Meeting \\COT[0]');
    const records = { LABEL: '進行中' };
    vi.stubGlobal('Iz', { Text: { get: (key) => records[key] } });
    class Text {
        setText(value) {
            this.shown = value;
        }
    }
    class TextEx {
        setText(value) {
            this.shown = value;
        }
    }
    vi.stubGlobal('Sprite_Text', Text);
    vi.stubGlobal('Sprite_TextEx', TextEx);
    const parent = vi
        .spyOn(
            Object.getPrototypeOf(InazumaForestiaTranslator.prototype),
            'enablePluginTranslation'
        )
        .mockReturnValue(true);
    try {
        expect(translator.enablePluginTranslation()).toBe(true);
        expect(Iz.Text.get('LABEL')).toBe('In progress');
        const sprite = new TextEx();
        sprite.setText('Retrieとの出会い');
        expect(sprite.shown).toBe('Meeting Retrie');
        expect(records.LABEL).toBe('進行中');
        expect(translator.drawing).toBe(0);
        runtime.enabled = false;
        sprite.setText('Retrieとの出会い');
        expect(sprite.shown).toBe('Retrieとの出会い');
        expect(Iz.Text.get('LABEL')).toBe('進行中');
    } finally {
        parent.mockRestore();
    }
});

it.each(['tags', 'legacy'])(
    'automatically registers Forestia and nested-path TRP controls with %s roundtrips',
    async (format) => {
        const translator = await prepare();
        translator.prepareDynamicValueTag(runtime);
        vi.stubGlobal('$plugins', [
            {
                name: 'thirop/TRP_SkitMZ',
                status: true,
                parameters: { controlCharacters: JSON.stringify({ motion: 'SM' }) },
            },
        ]);
        const skit = new TRPSkitTranslator();
        expect(skit.detectPlugin()).toBe(true);
        vi.spyOn(skit, '_installSpeakerNameRuntimeHook').mockReturnValue(true);
        expect(skit.enablePluginTranslation()).toBe(true);
        const tags = runtime.engine.addPluginTags.mock.calls.flatMap(([, tags]) => tags);
        for (const symbol of [
            'TRN',
            'IL',
            'SHOPTIME',
            'FACTIME',
            'NE',
            'DAIRY_EGG',
            'FSET',
            'FRESET',
            'SM',
            'SE',
            'SP',
            'SA',
        ])
            expect(
                tags.some((tag) => tag.tagSymbol === symbol),
                symbol
            ).toBe(true);
        const manager = new TagManager(null);
        manager.setTagFormat(format);
        manager.setCustomTagConfigs(tags);
        const input =
            '\\TRN[123]本文\\SM[jump]\\SE[5]\\SP[pose expression]\\SA[2]\\IL[action]\\SHOPTIME[1]\\FACTIME[2]\\NE[1]\\DAIRY_EGG\\FSET[font_key]\\FRESET';
        const encoded = manager.preprocessTags(input);
        expect(encoded.preprocessedText).not.toContain('\\TRN[');
        expect(encoded.preprocessedText).not.toContain('\\DAIRY');
        expect(encoded.preprocessedText).not.toContain('jump');
        const decoded = manager.postprocessTags(
            encoded.preprocessedText,
            encoded.tagCounts,
            encoded.caseMap
        );
        expect(decoded.valid).toBe(true);
        expect(decoded.text).toBe(input);
        vi.stubGlobal('$plugins', [{ name: 'thirop/TRP_SkitMZ', status: false, parameters: {} }]);
        expect(new TRPSkitTranslator().detectPlugin()).toBe(false);
    }
);
