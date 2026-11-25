import { describe, expect, it, vi } from 'vitest';
import { resolveTextLayout } from '../cheat-engine/www/cheat/js/translation-runtime/TextLayoutGeometry.js';
import { wrapTextByVisibleWidth } from '../cheat-engine/www/cheat/js/translation-runtime/TextWrap.js';
import BaseTranslationEngine from '../cheat-engine/www/cheat/translate-engines/BaseTranslationEngine.js';

class Bitmap {
    measureTextWidth(glyph) {
        const em = glyph === 'W' ? 0.75 : glyph === 'i' ? 0.25 : 0.5;
        return this.fontSize * em;
    }
}

function makeMessageWindow() {
    return {
        contents: { fontSize: 99 },
        contentsWidth: vi.fn(() => 792),
        newLineX: vi.fn(() => 4),
        resetFontSettings() {
            this.contents.fontSize = 26;
        },
        makeFontBigger() {
            this.contents.fontSize += 12;
        },
        makeFontSmaller() {
            this.contents.fontSize -= 12;
        },
    };
}

describe('automatic text layout', () => {
    it('measures the normal MZ message rectangle on the title screen', () => {
        const scene = { calcWindowHeight: () => 184 };
        const messageWindowRect = vi.fn(function () {
            return { width: 808, height: this.calcWindowHeight() };
        });
        const Window_Message = vi.fn(function (rect) {
            Object.assign(this, makeMessageWindow(), { contentsWidth: () => rect.width - 24 });
        });
        const root = {
            $gameSystem: {},
            $gameMessage: { faceName: () => '' },
            SceneManager: { _scene: scene },
            Scene_Message: { prototype: { messageWindowRect } },
            Window_Message,
            Bitmap,
        };
        expect(resolveTextLayout({}, 'message', root)).toMatchObject({ width: 780, maxChars: 60 });
        expect(resolveTextLayout({}, 'message_portrait', root)).toMatchObject({
            width: 620,
            maxChars: 47,
        });
        expect(Window_Message).toHaveBeenCalledTimes(1);
        expect(scene._messageWindow).toBeUndefined();
    });

    it('uses the MZ text window, independently of screen width, and caches geometry', () => {
        const messageWindow = makeMessageWindow();
        const root = {
            $gameSystem: {},
            $gameMessage: { faceName: () => '' },
            Graphics: { width: 1280, boxWidth: 960 },
            ImageManager: { faceWidth: 144 },
            Utils: { RPGMAKER_NAME: 'MZ' },
            SceneManager: { _scene: { _messageWindow: messageWindow } },
            Bitmap,
        };
        const runtime = {};
        const normal = resolveTextLayout(runtime, 'message', root);
        expect(normal).toMatchObject({ width: 788, maxChars: 60 });
        expect(resolveTextLayout(runtime, 'message_portrait', root)).toMatchObject({
            width: 628,
            maxChars: 48,
        });
        expect(resolveTextLayout(runtime, 'message', root).font).toBe(normal.font);
        expect(messageWindow.contentsWidth).toHaveBeenCalledTimes(1);
        expect(messageWindow.newLineX).toHaveBeenCalledTimes(1);
        expect(messageWindow.contents.fontSize).toBe(99);
        runtime.manuallySetTextWidths = true;
        expect(resolveTextLayout(runtime, 'message', root)).toBeNull();
    });

    it('uses the MV dialogue width, font, and the measured portrait indentation', () => {
        const messageWindow = {
            ...makeMessageWindow(),
            windowWidth: () => 816,
            standardPadding: () => 18,
            newLineX: () => 168,
            resetFontSettings() {
                this.contents.fontSize = 28;
            },
        };
        const root = {
            $gameSystem: {},
            $gameMessage: { faceName: () => 'Actor1' },
            Utils: { RPGMAKER_NAME: 'MV' },
            Bitmap,
        };
        const runtime = { currentMessageWindow: messageWindow };
        expect(resolveTextLayout(runtime, 'message', root)).toMatchObject({
            width: 780,
            maxChars: 55,
        });
        expect(resolveTextLayout(runtime, 'message_portrait', root)).toMatchObject({
            width: 612,
            maxChars: 43,
        });
    });

    it('uses the help text rectangle and keeps boxing overrides independent', () => {
        class SceneItem {}
        const scene = new SceneItem();
        scene._helpWindow = {
            ...makeMessageWindow(),
            baseTextRect: () => ({ width: 776 }),
            contentsHeight: () => 88,
            itemHeight: () => 44,
        };
        const root = {
            $gameSystem: {},
            SceneManager: { _scene: scene },
            Scene_Item: SceneItem,
            Bitmap,
        };
        const layout = resolveTextLayout({}, 'description', root);
        expect(layout).toMatchObject({ width: 776, maxChars: 59, maxRows: 2 });
        const engine = new BaseTranslationEngine({
            descriptionMaxLineWidth: 42,
            getAutomaticTextLayout: () => layout,
        });
        expect(engine.getWrapConfigForType('item_description').maxWidth).toBe(776);
        expect(engine.getWrapConfigForType('item_description', { boxingMode: true }).maxWidth).toBe(
            42
        );
    });

    it('wraps by glyph advances and carries escape-controlled sizes through line breaks', () => {
        const root = { Bitmap, $gameSystem: {}, $gameMessage: { faceName: () => '' } };
        const { font } = resolveTextLayout(
            { currentMessageWindow: makeMessageWindow() },
            'message',
            root
        );
        expect(wrapTextByVisibleWidth('ii ii', 50, { font })).toBe('ii ii');
        expect(wrapTextByVisibleWidth('WW WW', 50, { font })).toBe('WW\nWW');
        expect(wrapTextByVisibleWidth('\\{00 00', 70, { font })).toBe('\\{00\n00');
        expect(wrapTextByVisibleWidth('\\FS[40]00\n00 00', 70, { font })).toBe(
            '\\FS[40]00\n00\n00'
        );
        expect(
            wrapTextByVisibleWidth('\\N<First Last>WWWW', 40, {
                font,
                tagEntries: [{ tagSymbol: 'N', type: 'withCustomParameter', bracket: '<' }],
            })
        ).toBe('\\N<First Last>WW\nWW');
    });
});
