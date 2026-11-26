import { applyTextLayoutProviders } from './TextLayoutProviders.js';
import { getRootWindow } from '../RootWindowState.js';

const windowLayouts = new WeakMap();
const standardHelpLayouts = new WeakMap();
const standardMessageWindows = new WeakMap();
const DESCRIPTION_SCENES = [
    'Scene_Item',
    'Scene_Skill',
    'Scene_Equip',
    'Scene_Shop',
    'Scene_Battle',
];

function measureFont(window, Bitmap) {
    const bitmap = new Bitmap(1, 1);
    const probe = Object.create(window, { contents: { value: bitmap } });
    window.resetFontSettings.call(probe);
    const baseFontSize = bitmap.fontSize;
    const glyphs = new Map();
    const sizeSteps = new Map();
    const measureGlyph = (character, size = baseFontSize) => {
        if (!glyphs.has(size)) glyphs.set(size, new Map());
        const widths = glyphs.get(size);
        if (!widths.has(character)) {
            bitmap.fontSize = size;
            widths.set(character, bitmap.measureTextWidth(character));
        }
        return widths.get(character);
    };
    const resizeFont = (size, step) => {
        const key = size * step;
        if (!sizeSteps.has(key)) {
            bitmap.fontSize = size;
            const method = step > 0 ? probe.makeFontBigger : probe.makeFontSmaller;
            method.call(probe);
            sizeSteps.set(key, bitmap.fontSize);
        }
        return sizeSteps.get(key);
    };
    const digitWidth = measureGlyph('0');
    return { baseFontSize, digitWidth, measureGlyph, resizeFont };
}

function describeWindow(window, { Bitmap, Window_Base, ImageManager }, description, mv) {
    const contentWidth =
        !description && mv
            ? window.windowWidth() - window.standardPadding() * 2
            : window.contentsWidth();
    const contentHeight = description ? window.contentsHeight() : 0;
    const width = description
        ? mv
            ? contentWidth - window.textPadding()
            : window.baseTextRect().width
        : contentWidth;
    const font = measureFont(window, Bitmap);
    font.iconWidth = (mv ? (Window_Base?._iconWidth ?? 32) : (ImageManager?.iconWidth ?? 32)) + 4;
    if (!(width > 0 && font.digitWidth > 0)) return null;
    const maxRows = description
        ? Math.max(1, Math.floor(contentHeight / (mv ? window.lineHeight() : window.itemHeight())))
        : undefined;
    return { width, font, maxRows, insets: new Map() };
}

function getStandardHelpLayout(root, mv) {
    const { $gameSystem, Graphics, Window_Help, Rectangle } = root;
    if (!standardHelpLayouts.has($gameSystem)) {
        const rect = mv
            ? 2
            : new Rectangle(0, 0, Graphics.boxWidth, Window_Help.prototype.fittingHeight(2));
        const help = new Window_Help(rect);
        const layout = describeWindow(help, root, true, mv);
        if (layout) layout.window = help;
        standardHelpLayouts.set($gameSystem, layout);
    }
    return standardHelpLayouts.get($gameSystem);
}

function getStandardMessageWindow(root, scene, mv) {
    if (!scene || !root.Window_Message) return null;
    if (!standardMessageWindows.has(scene)) {
        const rect = mv ? undefined : root.Scene_Message.prototype.messageWindowRect.call(scene);
        const win = new root.Window_Message(rect);
        // Plugins such as NRP_MessageWindow allocate Graphics.width in messageWindowRect()
        // and apply the actual configured width/height inside updatePlacement().
        if (typeof win.updatePlacement === 'function') {
            try {
                win.updatePlacement();
            } catch {
                // Keep initial geometry if a plugin's updatePlacement expects live scene state.
            }
        }
        standardMessageWindows.set(scene, win);
    }
    return standardMessageWindows.get(scene);
}

export function resolveTextLayout(runtime, type, root = getRootWindow(), preview = false) {
    if ((!preview && runtime.manuallySetTextWidths) || !root.$gameSystem || !root.Bitmap)
        return null;
    const mv = root.Utils?.RPGMAKER_NAME === 'MV';
    const description = type === 'description';
    const portrait = type === 'message_portrait';
    const scene = root.SceneManager?._scene;
    const hasDescriptionWindow =
        description &&
        DESCRIPTION_SCENES.some((name) => {
            const Scene = root[name];
            return Scene && scene instanceof Scene;
        });
    try {
        const window = description
            ? hasDescriptionWindow && scene?._helpWindow
            : scene?._messageWindow ||
              getStandardMessageWindow(root, scene, mv) ||
              runtime.currentMessageWindow;
        let layout;
        if (window?.contents) {
            layout = windowLayouts.get(window);
            if (!layout) {
                layout = describeWindow(window, root, description, mv);
                if (layout) windowLayouts.set(window, layout);
            }
        } else if (description && root.Window_Help && root.Graphics?.boxWidth) {
            layout = getStandardHelpLayout(root, mv);
        }
        if (!layout) return null;

        let inset = 0;
        if (!description) {
            const activePortrait = !!root.$gameMessage?.faceName();
            if (!layout.insets.has(activePortrait)) {
                const currentInset = window.newLineX({ rtl: false });
                if (Number.isFinite(currentInset)) layout.insets.set(activePortrait, currentInset);
            }
            const faceInset = mv
                ? (root.Window_Base?._faceWidth ?? 144) + 24
                : (root.ImageManager?.faceWidth ?? 144) + 20;
            inset = layout.insets.get(portrait) ?? (portrait ? faceInset : mv ? 0 : 4);
        }
        const geometry = applyTextLayoutProviders(
            { width: layout.width, inset, font: layout.font, maxRows: layout.maxRows },
            { window: window || layout.window, type, root },
            root
        );
        const width = geometry.width - geometry.inset;
        if (!(width > 0)) return null;
        return {
            width,
            maxChars: Math.floor(
                width / geometry.font.measureGlyph('0', geometry.font.baseFontSize)
            ),
            maxRows: geometry.maxRows,
            font: geometry.font,
        };
    } catch {
        return null;
    }
}
