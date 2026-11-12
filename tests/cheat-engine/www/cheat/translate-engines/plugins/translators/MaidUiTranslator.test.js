import { afterEach, expect, it, vi } from 'vitest';
import { MaidUiTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/MaidUiTranslator.js';
import { SourceTextCatalogTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/SourceTextCatalogTranslator.js';
import { extractJavaScriptTextCatalog } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/JavaScriptTextCatalog.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('collects glossary notifications and time operands without evaluating game scripts', () => {
    const translator = new MaidUiTranslator();
    translator.extractCatalog = extractJavaScriptTextCatalog;
    translator.collectParameterTexts({ popupMessage: '用語辞典が更新されました！' });
    translator.collectCommandTexts([
        { code: 122, parameters: [11, 11, 0, 4, "'午前'"] },
        { code: 122, parameters: [11, 11, 0, 4, "'夜'"] },
    ]);
    expect([...translator.entries.keys()]).toEqual(['用語辞典が更新されました！', '午前', '夜']);
    expect(translator.isDisplayFragment('夜')).toBe(true);
});

it('translates expanded HUD values and label measurements while respecting the runtime guard', () => {
    class Bitmap { measureTextWidth(text) { return text.length; } }
    class WindowBase {
        textSizeEx(text) { return { width: this.convertEscapeCharacters(text).length }; }
        convertEscapeCharacters(text) { return text.replace('\\V[11]', '夜'); }
    }
    class WindowMessage extends WindowBase {}
    vi.stubGlobal('window', { Bitmap, Window_Base: WindowBase, Window_Message: WindowMessage });
    vi.spyOn(SourceTextCatalogTranslator.prototype, 'enablePluginTranslation').mockReturnValue(true);
    const translator = new MaidUiTranslator();
    const runtime = { enabled: true };
    translator.getRuntime = () => runtime;
    translator.isRuntimeTranslationActive = (r) => r.enabled;
    translator.prepareDynamicValueTag = () => {};
    translator.resolveRuntimeTranslation = (text) => ({ '夜': 'Night', '自分の部屋': 'My room' }[text] || text);
    translator.fragmentPattern = /自分の部屋|夜/g;
    translator.entries.set('自分の部屋', { text: '自分の部屋' });
    expect(translator.enablePluginTranslation()).toBe(true);
    expect(new Bitmap().measureTextWidth('自分の部屋')).toBe('My room'.length);
    expect(new WindowBase().textSizeEx('\\V[11] 自分の部屋').width).toBe('Night My room'.length);
    translator.drawing++;
    expect(new WindowBase().convertEscapeCharacters('\\V[11] 自分の部屋')).toBe('Night My room');
    expect(new WindowMessage().convertEscapeCharacters('\\V[11] 自分の部屋')).toBe('夜 自分の部屋');
    runtime.enabled = false;
    expect(new WindowBase().convertEscapeCharacters('\\V[11] 自分の部屋')).toBe('夜 自分の部屋');
    translator.drawing--;
    expect(new Bitmap().measureTextWidth('自分の部屋')).toBe('自分の部屋'.length);
});
