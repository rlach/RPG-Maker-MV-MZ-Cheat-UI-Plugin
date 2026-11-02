import { afterEach, expect, it, vi } from 'vitest';
import { DKToolsLocalizationTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/DKToolsLocalizationTranslator.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function fixture() {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$plugins', [
        { name: 'DKTools_Localization', status: true, parameters: { 'Parse Depth': '3' } },
    ]);
    vi.stubGlobal('_', {
        get: (data, key) => key.split('.').reduce((value, part) => value?.[part], data),
    });
    const dictionaries = {
        ja: {
            sleep: '睡眠の胞子',
            story: ['こんにちは！\n白菇です！'],
            place: '廃屋',
            nested: { label: '  見出し' },
        },
        en: {
            sleep: '釋放具有睡眠效果的胞子。',
            story: ['呀吼~你好!\n我是白菇~!'],
            place: 'Abandoned House',
        },
    };
    const localization = {
        locale: 'ja',
        _data: dictionaries.ja,
        _cache: {},
        async _loadData(locale) {
            return dictionaries[locale];
        },
        async loadData() {
            this._data = await this._loadData(this.locale);
        },
        getText(text) {
            let result = String(text);
            for (let i = 0; i < 3; i++) {
                result = result.replace(
                    /\{(.*?)\}/g,
                    (_, key) => window._.get(this._data, key) ?? key
                );
                result = result.replace(/\\VAR\[\d+\]/g, '7');
            }
            return result;
        },
    };
    vi.stubGlobal('DKTools', { Localization: localization });
    const runtime = {
        enabled: true,
        translationCache: new Map(),
        getCacheKey: (text, type) => `${type}:${text.replace(/\n+$/, '')}`,
        getMessageCacheLookupKeys(text) {
            return [this.getCacheKey(text, 'message')];
        },
        hasUsableCacheValue(key) {
            return !!this.translationCache.get(key);
        },
        trackCacheKeyUsage: vi.fn(),
        isTranslationEnabled() {
            return this.enabled;
        },
        engine: { addPluginTags: vi.fn() },
    };
    const translator = new DKToolsLocalizationTranslator();
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    return { translator, localization, runtime };
}

it('scans every active-locale dictionary leaf before it is seen, without localization braces', async () => {
    const { translator, localization, runtime } = fixture();
    // Scanning may precede installation of the runtime hooks.
    await translator.precomputeCounts();
    expect(translator.collectUntranslated({ runtime }).map((x) => x.value)).toEqual([
        '睡眠の胞子',
        'こんにちは！\n白菇です！',
        '廃屋',
        '  見出し',
    ]);
    expect(translator.enablePluginTranslation()).toBe(true);
    localization.locale = 'en';
    await localization.loadData();
    expect(translator.collectUntranslated({ runtime }).map((x) => x.value)).toEqual([
        '釋放具有睡眠效果的胞子。',
        '呀吼~你好!\n我是白菇~!',
        'Abandoned House',
    ]);
});

it('uses dictionary translations for descriptions, locations and unseen dialogue, tracking source keys', async () => {
    const { translator, localization, runtime } = fixture();
    expect(translator.enablePluginTranslation()).toBe(true);
    await translator.precomputeCounts();
    for (const [source, target] of [
        ['睡眠の胞子', 'Release sleep spores.'],
        ['廃屋', 'Abandoned House'],
        ['こんにちは！\n白菇です！', 'Hello!\nI am White Mushroom!'],
    ]) {
        runtime.translationCache.set(
            runtime.getCacheKey(source, translator.getCacheType()),
            target
        );
    }
    expect(localization.getText('{sleep}')).toBe('Release sleep spores.');
    expect(localization.getText('{Release spores\nwith sleep effect.}')).toBe(
        'Release spores\nwith sleep effect.'
    );
    expect(localization.getText('{place}')).toBe('Abandoned House');
    const dialogue = localization.getText('{story.0}');
    expect(dialogue).toBe('Hello!\nI am White Mushroom!');
    expect(translator.resolveMessageCacheSourceText({ text: dialogue + '\n' })).toBe(
        'こんにちは！\n白菇です！\n'
    );
    expect(
        translator.resolveMessageCacheSourceText({ text: '{story.0}', mode: 'collection' })
    ).toBe('こんにちは！\n白菇です！');
    expect(runtime.getMessageCacheLookupKeys('こんにちは！\n白菇です！')).toContain(
        'plugin_dktools_localization:こんにちは！\n白菇です！'
    );
    runtime.trackCacheKeyUsage.mockClear();
    expect(localization.getText(dialogue)).toBe(dialogue);
    expect(runtime.trackCacheKeyUsage).not.toHaveBeenCalled();
    expect(localization._data.sleep).toBe('睡眠の胞子');
    expect(localization._cache).toEqual({});
    runtime.enabled = false;
    expect(localization.getText('{sleep}')).toBe('睡眠の胞子');
    expect(runtime.getMessageCacheLookupKeys('睡眠の胞子')).toEqual(['message:睡眠の胞子']);
});

it('preserves native fallback and reference parsing for missing entries and legacy translated braces', async () => {
    const { translator, localization, runtime } = fixture();
    translator.enablePluginTranslation();
    await translator.precomputeCounts();
    expect(localization.getText('{unknown}')).toBe('unknown');
    expect(localization.getText('{sleep}')).toBe('睡眠の胞子');
    runtime.translationCache.set(
        'plugin_dktools_localization:睡眠の胞子',
        '{Release sleep spores.}'
    );
    expect(localization.getText('{sleep}')).toBe('Release sleep spores.');
});

it('retries initialization until the dictionary API and data are available', () => {
    const { translator, localization } = fixture();
    localization._data = null;
    expect(translator.enablePluginTranslation()).toBe(false);
});

it('keeps variable IDs in dictionary and message keys and registers plugin tags', async () => {
    const { translator, localization, runtime } = fixture();
    localization._data.count = '胞子 \\VAR[1]';
    localization._data.reference = '{count}';
    translator.registerPluginCustomTags();
    expect(runtime.engine.addPluginTags.mock.calls[0][1].map((tag) => tag.tagSymbol)).toEqual([
        'VAR',
        'LANGUAGE',
    ]);
    translator.enablePluginTranslation();
    await translator.precomputeCounts();
    expect(translator.collectUntranslated({ runtime }).map((item) => item.value)).toContain(
        '胞子 \\VAR[1]'
    );
    expect(localization.getText('{reference}')).toBe('胞子 7');
    expect(translator.resolveMessageCacheSourceText({ text: '胞子 7' })).toBe('胞子 \\VAR[1]');
    runtime.translationCache.set('plugin_dktools_localization:胞子 \\VAR[1]', 'Spores: \\VAR[1]');
    expect(localization.getText('{count}')).toBe('Spores: 7');
});
