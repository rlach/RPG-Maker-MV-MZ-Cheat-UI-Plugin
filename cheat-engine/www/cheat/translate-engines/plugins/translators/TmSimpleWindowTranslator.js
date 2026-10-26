import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * TMSimpleWindow v1.2.0 (MV). Text is the sixth argument of showWindow,
 * showNoFrameWindow and showNoBackWindow. Window_Simple is closure-private:
 * discover its prototype through the spriteset factory and translate only the
 * temporary rendering buffer, never Game_Screen's persistent window records.
 */
export class TmSimpleWindowTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'TMSimpleWindow';
    }
    getPluginLabel() {
        return 'TM simple windows';
    }

    getEventCommandTraversalExtension() {
        return {
            collectEntriesAt: ({ command, index, pushEntry }) => {
                if (command.code !== 356) return null;
                const [name, ...args] = command.parameters[0].split(' ');
                if (!['showWindow', 'showNoFrameWindow', 'showNoBackWindow'].includes(name))
                    return null;
                const value = args[5]?.replace(/\\n/g, '\n');
                if (this.isUsableText(value))
                    pushEntry({ type: 'message', value, cmdIndex: index, command });
                return { handled: true, nextIndex: index + 1 };
            },
        };
    }

    hookSimpleWindows(spriteset) {
        this.prototypes ??= new WeakSet();
        for (const win of spriteset?._simpleWindows || []) {
            if (!win) continue;
            const prototype = Object.getPrototypeOf(win);
            if (this.prototypes.has(prototype)) continue;
            this.prototypes.add(prototype);
            const original = prototype.refreshContents;
            const translator = this;
            prototype.refreshContents = function (...args) {
                const source = this._text;
                if (this.width === 0) return original.apply(this, args);
                const text = source.replace(/\\n/g, '\n');
                this._text = translator.resolveRuntimeMessageTranslation(
                    text,
                    translator.getRuntime()
                );
                try {
                    return original.apply(this, args);
                } finally {
                    this._text = source;
                }
            };
        }
    }

    enablePluginTranslation() {
        const spriteset = window.Spriteset_Base?.prototype;
        if (typeof spriteset?.createSimpleWindows !== 'function') return false;
        const original = spriteset.createSimpleWindows;
        const translator = this;
        spriteset.createSimpleWindows = function (...args) {
            const result = original.apply(this, args);
            translator.hookSimpleWindows(this);
            return result;
        };
        this.hookSimpleWindows(window.SceneManager?._scene?._spriteset);
        return true;
    }
}
