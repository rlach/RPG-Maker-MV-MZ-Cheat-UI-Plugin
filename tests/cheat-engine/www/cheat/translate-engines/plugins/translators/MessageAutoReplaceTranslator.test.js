import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { MessageAutoReplaceTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/MessageAutoReplaceTranslator.js';

let runtime;
let translator;
let message;
beforeEach(() => {
    vi.stubGlobal('window', globalThis);
    runtime = { enabled: true, isTranslationEnabled: () => runtime.enabled };
    vi.stubGlobal('__TranslationRuntime', runtime);
    vi.stubGlobal('__ensureTranslationRuntime', undefined);
    class GameMessage {
        constructor() {
            this.clear();
        }
        clear() {
            this._texts = [];
        }
        allText() {
            return this.applyTextReplace(this._texts.join('\n'));
        }
        applyTextReplace(text) {
            return text.replace(/[♡♥❤]/g, '\\I[12]');
        }
    }
    vi.stubGlobal('Game_Message', GameMessage);
    translator = new MessageAutoReplaceTranslator();
    expect(translator.enablePluginTranslation()).toBe(true);
    message = new GameMessage();
    vi.stubGlobal('$gameMessage', message);
});
afterEach(() => vi.unstubAllGlobals());

function resolve(text) {
    return translator.resolveMessageCacheSourceText({ text, gameMessage: message, runtime });
}

describe('MessageAutoReplace authored cache keys', () => {
    it('keeps mass-translation keys and recovers exact mixed symbols at runtime', () => {
        const source = '  Original♡ text♥\nnext❤';
        message._texts = source.split('\n');
        const rendered = message.allText();
        expect(rendered).toBe('  Original\\I[12] text\\I[12]\nnext\\I[12]');
        expect(resolve(rendered)).toBe(source);
        expect(
            translator.resolveMessageCacheSourceText({ text: source, runtime, mode: 'collection' })
        ).toBeNull();
    });

    it('remembers original context after translated text replaces the message buffer', () => {
        message._texts = ['Source♡'];
        const rendered = message.allText();
        message._texts = ['Translation♥'];
        message.allText();
        expect(resolve(rendered)).toBe('Source♡');
    });

    it('forgets previous message mappings on clear and never guesses a heart variant', () => {
        message._texts = ['Source♥'];
        message.allText();
        message.clear();
        message._texts = ['Source\\I[12]'];
        expect(resolve(message.allText())).toBe('Source\\I[12]');
    });

    it('handles lookup before the scheduled hook has been installed', () => {
        message._texts = ['Source♡'];
        const lateTranslator = new MessageAutoReplaceTranslator();
        expect(
            lateTranslator.resolveMessageCacheSourceText({
                text: message.allText(),
                runtime,
                gameMessage: message,
            })
        ).toBe('Source♡');
    });

    it('does not capture description replacements as the current message source', () => {
        message._texts = ['Dialogue'];
        message.applyTextReplace('Description♡');
        expect(resolve('Description\\I[12]')).toBeNull();
    });

    it('preserves plugin display behavior with translation disabled and supports cache-only mode', () => {
        runtime.enabled = false;
        message._texts = ['Source♡'];
        expect(message.allText()).toBe('Source\\I[12]');
        expect(resolve(message.allText())).toBeNull();
        runtime.enableTranslation = true;
        expect(resolve(message.allText())).toBe('Source♡');
    });

    it('requests retry until the plugin method is present', () => {
        delete Game_Message.prototype.applyTextReplace;
        expect(new MessageAutoReplaceTranslator().enablePluginTranslation()).toBe(false);
    });
});
