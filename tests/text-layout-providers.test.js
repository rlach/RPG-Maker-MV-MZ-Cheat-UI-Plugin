import { afterEach, expect, it, vi } from 'vitest';
import { resolveTextLayout } from '../cheat-engine/www/cheat/js/translation-runtime/TextLayoutGeometry.js';
import { registerTextLayoutProvider, getTextLayoutCapacities, TEXT_LAYOUT_CHANGED_EVENT } from '../cheat-engine/www/cheat/js/translation-runtime/TextLayoutProviders.js';
import { subscribeRootWindowEvent } from '../cheat-engine/www/cheat/js/RootWindowState.js';
import { DarkPlasmaAutoLineBreakTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/DarkPlasmaAutoLineBreakTranslator.js';
import { MessagePlusTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/MessagePlusTranslator.js';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function setup() {
    class Bitmap { measureTextWidth() { return this.fontSize / 2; } }
    const message = { contents: { fontSize: 99 }, contentsWidth: () => 524,
        resetFontSettings() { this.contents.fontSize = 20; },
        makeFontBigger() { this.contents.fontSize += 4; },
        makeFontSmaller() { this.contents.fontSize -= 4; },
        newLineX: () => 4, lineWidth: () => 520, isAutoLineBreakEnabled: () => true };
    const root = { Bitmap, $gameSystem: {}, $gameMessage: { faceName: () => '' },
        Window_Base: { prototype: message }, Window_Message: { prototype: message },
        SceneManager: { _scene: { _messageWindow: message } },
        $plugins: [{ name: 'DarkPlasma_AutoLineBreak', status: true }, { name: 'MessagePlus', status: true, parameters: { faceWindow: '{"enabled":"true"}' } }] };
    vi.stubGlobal('window', root);
    return { root, message };
}
it('accounts for the native auto-wrap boundary (52 becomes 51) without changing legacy defaults', () => {
    const { root, message } = setup();
    expect(resolveTextLayout({}, 'message', root)).toMatchObject({ width: 520, maxChars: 52 });
    expect(new DarkPlasmaAutoLineBreakTranslator().enablePluginTranslation()).toBe(true);
    expect(resolveTextLayout({}, 'message', root)).toMatchObject({ width: 516, maxChars: 51 });
    message.isAutoLineBreakEnabled = () => false;
    expect(resolveTextLayout({}, 'message', root)).toMatchObject({ width: 520, maxChars: 52 });
    expect(message.contents.fontSize).toBe(99);
});
it('composes a separate portrait window with auto-wrap and uses native font size steps', () => {
    const { root } = setup();
    new MessagePlusTranslator().enablePluginTranslation();
    new DarkPlasmaAutoLineBreakTranslator().enablePluginTranslation();
    const normal = resolveTextLayout({}, 'message', root);
    const portrait = resolveTextLayout({}, 'message_portrait', root);
    expect(portrait.width).toBe(normal.width);
    expect(getTextLayoutCapacities(normal)).toEqual({ minus1: 64, base: 51, plus1: 43, plus2: 36 });
    expect(resolveTextLayout({ manuallySetTextWidths: true }, 'message', root)).toBeNull();
    expect(resolveTextLayout({ manuallySetTextWidths: true }, 'message', root, true).maxChars).toBe(51);
});
it('shares provider registration and refresh notifications across overlay and separate window', () => {
    const { root } = setup();
    const changed = vi.fn();
    subscribeRootWindowEvent(TEXT_LAYOUT_CHANGED_EVENT, changed);
    const child = { __CHEAT_EXTERNAL_WINDOW__: true, opener: root };
    vi.stubGlobal('window', child);
    const remove = registerTextLayoutProvider('ExamplePlugin', ({ geometry }) => ({ font: { ...geometry.font, measureGlyph: () => 20 } }));
    expect(resolveTextLayout({}, 'message', root).maxChars).toBe(26);
    expect(changed).toHaveBeenCalledOnce();
    remove();
    expect(resolveTextLayout({}, 'message', root).maxChars).toBe(52);
    expect(changed).toHaveBeenCalledTimes(2);
});
it('rejects invalid provider output without losing default geometry or changing other games', () => {
    const { root } = setup();
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    registerTextLayoutProvider('BrokenPlugin', () => ({ width: Infinity }));
    expect(resolveTextLayout({}, 'message', root).maxChars).toBe(52);
    expect(warning).toHaveBeenCalledOnce();
    expect(getTextLayoutCapacities(null)).toEqual({ minus1: null, base: null, plus1: null, plus2: null });
});

it('subtracts the help draw origin once when the plugin has a wider right margin', () => {
    const { root, message } = setup();
    class ItemScene {}
    const help = { ...message, baseTextRect: () => ({ x: 4, width: 516 }),
        contentsHeight: () => 88, itemHeight: () => 44, lineWidth: () => 508 };
    root.Scene_Item = ItemScene;
    root.SceneManager._scene = Object.assign(new ItemScene(), { _helpWindow: help });
    new DarkPlasmaAutoLineBreakTranslator().enablePluginTranslation();
    expect(resolveTextLayout({}, 'description', root)).toMatchObject({ width: 504, maxRows: 2 });
});
