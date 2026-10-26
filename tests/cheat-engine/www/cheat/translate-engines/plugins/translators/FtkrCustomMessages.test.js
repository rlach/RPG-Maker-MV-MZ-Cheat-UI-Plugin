import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FtkrExMessageWindowTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/FtkrExMessageWindowTranslator.js';
import { FtkrPopupSpriteMessageTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/FtkrPopupSpriteMessageTranslator.js';
import { TmSimpleWindowTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/TmSimpleWindowTranslator.js';
import { collectEventCommandEntries } from '../../../../../../../cheat-engine/www/cheat/js/EventCommandTraversal.js';
import {
    buildMessageCacheLookupKeys,
    getMessageSourceTextVariants,
} from '../../../../../../../cheat-engine/www/cheat/js/MessageCacheKeyHelper.js';

let runtime;
it('scans TM window text and translates private window buffers without triggering perpetual refreshes', () => {
    const instance = translator(TmSimpleWindowTranslator);
    const list = [
        'showWindow 1 0 0 200 40 一行目\\n二行目',
        'showNoFrameWindow 2 0 0 200 40 枠なし',
        'showNoBackWindow 3 0 0 200 40 背景なし',
        'eraseWindow 1',
    ].map((text) => ({ code: 356, parameters: [text] }));
    expect(
        collectEventCommandEntries(list, {
            traversalExtensions: [instance.getEventCommandTraversalExtension()],
        }).map((entry) => entry.value)
    ).toEqual(['一行目\n二行目', '枠なし', '背景なし']);
    class Simple {
        constructor() {
            this._text = '一行目\\n二行目';
            this.width = 200;
        }
        refreshContents() {
            this.drawn = this._text.replace(/\\n/g, '\n');
        }
    }
    class Spriteset {
        createSimpleWindows() {
            this._simpleWindows = [null, new Simple()];
        }
    }
    vi.stubGlobal('Spriteset_Base', Spriteset);
    vi.stubGlobal('SceneManager', { _scene: null });
    runtime.translationCache.set('message:一行目\n二行目', 'First\nSecond');
    expect(instance.enablePluginTranslation()).toBe(true);
    const spriteset = new Spriteset();
    spriteset.createSimpleWindows();
    const win = spriteset._simpleWindows[1];
    win.refreshContents();
    expect(win.drawn).toBe('First\nSecond');
    expect(win._text).toBe('一行目\\n二行目');
    const refresh = Simple.prototype.refreshContents;
    instance.hookSimpleWindows(spriteset);
    expect(Simple.prototype.refreshContents).toBe(refresh);
    runtime.enabled = false;
    win.refreshContents();
    expect(win.drawn).toBe('一行目\n二行目');
});
beforeEach(() => {
    vi.stubGlobal('window', globalThis);
    runtime = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        translationCache: new Map(),
        engine: { addPluginTags: vi.fn() },
        getCacheKey: (text, type) => `${type}:${text}`,
        getMessageCacheKey(text, { hasPortrait = false } = {}) {
            return this.getCacheKey(
                getMessageSourceTextVariants(text)[0],
                hasPortrait ? 'message_portrait' : 'message'
            );
        },
        getPreferredMessageCacheEntry(text, options = {}) {
            for (const key of buildMessageCacheLookupKeys(
                this.getCacheKey,
                text,
                !!options.hasPortrait
            )) {
                if (this.translationCache.has(key))
                    return { cacheKey: key, value: this.translationCache.get(key) };
            }
            return null;
        },
        hasUsableCacheValue(key) {
            return !!this.translationCache.get(key);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    vi.stubGlobal('__TranslationRuntime', runtime);
    vi.stubGlobal('__ensureTranslationRuntime', undefined);
});
afterEach(() => vi.unstubAllGlobals());

function translator(Class) {
    const instance = new Class();
    vi.spyOn(instance, 'getRuntime').mockReturnValue(runtime);
    return instance;
}

it('uses each numbered FTKR buffer, preserves raw buffers and default dialogue, restores on failure', () => {
    class MessageWindow {
        startMessage() {
            this.shown = this._gameMessage.allText();
            if (this.fail) throw Error('render failed');
        }
    }
    class Choices {
        start() {
            this.shown = [...this._gameMessage._choices];
        }
    }
    vi.stubGlobal('Window_MessageEx', MessageWindow);
    vi.stubGlobal('Window_ChoiceListEx', Choices);
    vi.stubGlobal('$gameMessage', { _texts: ['Default window'] });
    const instance = translator(FtkrExMessageWindowTranslator);
    expect(instance.enablePluginTranslation()).toBe(true);
    const buffer = {
        _texts: [' こんにちは。', '二行目。'],
        _choices: ['はい', 'いいえ'],
        faceName: () => '',
        allText() {
            return this._texts.join('\n');
        },
    };
    const raw = buffer._texts;
    runtime.translationCache.set(
        runtime.getMessageCacheKey(buffer.allText()),
        ' Hello.\nSecond line.'
    );
    runtime.translationCache.set('choice:はい', 'Yes');
    const win = new MessageWindow();
    win._gameMessage = buffer;
    win.startMessage();
    expect(win.shown).toBe(' Hello.\nSecond line.');
    expect(buffer._texts).toBe(raw);
    expect($gameMessage._texts).toEqual(['Default window']);
    const choiceWin = new Choices();
    choiceWin._gameMessage = buffer;
    choiceWin.start();
    expect(choiceWin.shown).toEqual(['Yes', 'いいえ']);
    expect(buffer._choices).toEqual(['はい', 'いいえ']);
    win.fail = true;
    expect(() => win.startMessage()).toThrow('render failed');
    expect(buffer._texts).toBe(raw);
    win.fail = false;
    runtime.enabled = false;
    win.startMessage();
    choiceWin.start();
    expect(win.shown).toBe(raw.join('\n'));
    expect(choiceWin.shown).toEqual(['はい', 'いいえ']);
});

it('harvests missing whole extended messages and reuses YEP merged-message cache', () => {
    class Message {
        startMessage() {
            this.shown = this._gameMessage.allText();
        }
    }
    vi.stubGlobal('Window_MessageEx', Message);
    vi.stubGlobal(
        'Window_ChoiceListEx',
        class {
            start() {}
        }
    );
    const instance = translator(FtkrExMessageWindowTranslator);
    instance.enablePluginTranslation();
    const buffer = {
        _texts: ['未知。'],
        faceName: () => 'Actor1',
        allText() {
            return this._texts.join('\n');
        },
    };
    const win = new Message();
    win._gameMessage = buffer;
    win.startMessage();
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith('message_portrait:未知。');
    runtime.translationCache.set('plugin_yep_message_core:未知。', 'Unknown.');
    win.startMessage();
    expect(win.shown).toBe('Unknown.');
    expect(buffer._texts).toEqual(['未知。']);
});

it('waits for all FTKR window dependencies before installing hooks', () => {
    const startMessage = vi.fn();
    vi.stubGlobal('Window_MessageEx', class {});
    Window_MessageEx.prototype.startMessage = startMessage;
    vi.stubGlobal('Window_ChoiceListEx', undefined);
    expect(translator(FtkrExMessageWindowTranslator).enablePluginTranslation()).toBe(false);
    expect(Window_MessageEx.prototype.startMessage).toBe(startMessage);
});

it('collects both popup command formats and Japanese aliases through the shared event scanner', () => {
    const instance = translator(FtkrPopupSpriteMessageTranslator);
    const list = [
        'PSM_SHOW_POPUP 1 0 100 200 120 本文\\_です -c',
        'PSM_SHOW_POPUP_B 1 100 200 120 別の本文 -1 24 0 false 0 0 0 255',
        'PSM_ポップアップ表示 1 0 0 0 60 日本語コマンド',
        'PSM_ポップアップ表示B 1 0 0 60 日本語B -1 24 0 false 0 0 0 255',
        'PSM_MOVE_POPUP 1 3 4 60',
    ].map((line) => ({ code: 356, parameters: [line] }));
    const entries = collectEventCommandEntries(list, {
        traversalExtensions: [instance.getEventCommandTraversalExtension()],
    });
    expect(entries.map((entry) => entry.value)).toEqual([
        '本文\\_です',
        '別の本文',
        '日本語コマンド',
        '日本語B',
    ]);
    expect(entries.every((entry) => entry.type === 'message')).toBe(true);
});

it('translates popup text before expansion and glyph measurement without changing control arguments', () => {
    class Party {
        setPopupMessage(...args) {
            this.args = args;
        }
    }
    vi.stubGlobal('Game_Party', Party);
    const instance = translator(FtkrPopupSpriteMessageTranslator);
    expect(instance.enablePluginTranslation()).toBe(true);
    runtime.translationCache.set('message:所持\\V[1]個', 'Owned: \\V[1]');
    const party = new Party();
    const args = [
        1,
        100,
        200,
        120,
        0,
        '所持\\V[1]個',
        [0, 0, 0, 0],
        0,
        false,
        24,
        'red',
        0,
        'GameFont',
        255,
        true,
    ];
    party.setPopupMessage(...args);
    expect(party.args).toEqual([...args.slice(0, 5), 'Owned: \\V[1]', ...args.slice(6)]);
    expect(args[5]).toBe('所持\\V[1]個');
    party.setPopupMessage(...args.slice(0, 5), '未発見');
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith('message:未発見');
    runtime.enabled = false;
    party.setPopupMessage(...args);
    expect(party.args).toEqual(args);
});
