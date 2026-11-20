import { afterEach, expect, it, vi } from 'vitest';
import { KrdMultilingualTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/KrdMultilingualTranslator.js';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('keeps the first English word after DarkPlasma name removal and preserves other controls', () => {
    class Base {
        convertEscapeCharacters(text) {
            return text.replace(/\\LANG\[0\]([\s\S]*?)\\LANGEND/g, '$1').replace(/\\/g, '\x1b');
        }
    }
    class Message extends Base {
        convertEscapeCharacters(text) {
            return super.convertEscapeCharacters(text).replace(/\x1bNDP<(.*?)>/gi, '');
        }
    }
    vi.stubGlobal('window', {
        Window_Base: Base,
        KRD_MULTILINGUAL: { getReturnData: () => '', getType: () => 'item' },
    });
    const t = new KrdMultilingualTranslator();
    t.getRuntime = () => ({ isTranslationEnabled: () => true });
    t.registerPluginCustomTags = vi.fn();
    t.enablePluginTranslation();
    const converted = new Message().convertEscapeCharacters(
        "\\LANG[0]\\N\\NDP<2>What's wrong?!\\LANGEND"
    );
    expect(converted).toBe("\nWhat's wrong?!");
    expect(new Message().convertEscapeCharacters('\\N[1] \\N<Speaker> \\C[3]')).toBe(
        '\x1bN[1] \x1bN<Speaker> \x1bC[3]'
    );
});

it('reuses item and actor caches behind native read-only getters without changing native sources', () => {
    let enabled = true;
    const native = {
        getType: (data) => data.type,
        getReturnData: (data, field) => data[field + '_0'],
    };
    vi.stubGlobal('window', {
        Window_Base: class {
            convertEscapeCharacters(t) {
                return t;
            }
        },
        KRD_MULTILINGUAL: native,
    });
    const t = new KrdMultilingualTranslator();
    t.registerPluginCustomTags = () => {};
    const cache = new Map([
        ['actor_name:課長', 'Chief'],
        ['item_name:カードリーダー', 'Card Reader'],
    ]);
    const runtime = {
        isTranslationEnabled: () => enabled,
        getCacheKey: (s, type) => `${type}:${s}`,
        hasUsableCacheValue: (key) => cache.has(key),
        translationCache: cache,
        trackCacheKeyUsage: vi.fn(),
    };
    t.getRuntime = () => runtime;
    t.enablePluginTranslation();
    const actor = { type: 'actor', name_0: '課長' };
    const item = { type: 'item', name_0: 'カードリーダー' };
    Object.defineProperty(item, 'name', { get: () => native.getReturnData(item, 'name') });
    expect(native.getReturnData(actor, 'name')).toBe('Chief');
    expect(item.name).toBe('Card Reader');
    expect(item.name_0).toBe('カードリーダー');
    enabled = false;
    expect(item.name).toBe('カードリーダー');
});

it('uses harvested database sources when KRD backing fields already contain translations', () => {
    const native = { getType: () => 'item', getReturnData: () => 'カードリーダー' };
    const messages = { loadMessage: '读取哪个文件？', file: '文件', autosave: '自动保存' };
    const manager = {
        message: (id) =>
            ({
                loadMessage: 'どのファイルをロードしますか？',
                file: 'ファイル',
                autosave: 'オートセーブ',
            })[id],
    };
    vi.stubGlobal('window', {
        KRD_MULTILINGUAL: native,
        TextManager: manager,
        $dataSystem: { terms: { messagesOriginal: messages } },
        Window_Base: class {
            convertEscapeCharacters(t) {
                return t;
            }
        },
    });
    const cache = new Map([
        ['item_name:刷卡机', 'Card Reader'],
        ['system_message:读取哪个文件？', 'Load which file?'],
        ['system_message:文件', 'File'],
        ['system_message:自动保存', 'Autosave'],
    ]);
    let enabled = true;
    const t = new KrdMultilingualTranslator();
    t.registerPluginCustomTags = () => {};
    t.getRuntime = () => ({
        isTranslationEnabled: () => enabled,
        getCacheKey: (s, type) => `${type}:${s}`,
        hasUsableCacheValue: (key) => cache.has(key),
        translationCache: cache,
        trackCacheKeyUsage() {},
    });
    t.enablePluginTranslation();
    const item = { name_0: 'Card Reader', _translateOriginal: { name: '刷卡机' } };
    expect(native.getReturnData(item, 'name')).toBe('Card Reader');
    expect(manager.message('loadMessage')).toBe('Load which file?');
    expect(manager.message('file')).toBe('File');
    expect(manager.message('autosave')).toBe('Autosave');
    enabled = false;
    expect(native.getReturnData(item, 'name')).toBe('カードリーダー');
    expect(manager.message('file')).toBe('ファイル');
    expect(item.name_0).toBe('Card Reader');
});
