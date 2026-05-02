import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { translateOnTheFlyRuntimeMethods } from '../../../../../../cheat-engine/www/cheat/panels/translate-on-the-fly/TranslateOnTheFlyRuntimeMethods.js';

function getCanonicalSystemCommandName(commandName) {
    let normalizedName = '';
    if (typeof commandName === 'string') {
        normalizedName = commandName.trim();
    } else if (commandName !== null && commandName !== undefined) {
        normalizedName = String(commandName).trim();
    }

    if (!normalizedName) {
        return normalizedName;
    }

    const terms = globalThis.$dataSystem?.terms;
    const originalCommands = Array.isArray(terms?.commandsOriginal) ? terms.commandsOriginal : null;
    if (!originalCommands) {
        return normalizedName;
    }

    const currentCommands = Array.isArray(terms?.commands) ? terms.commands : [];
    for (let i = 0; i < originalCommands.length; i++) {
        const originalValue =
            typeof originalCommands[i] === 'string' ? originalCommands[i].trim() : '';
        if (!originalValue) {
            continue;
        }

        if (normalizedName === originalValue) {
            return originalValue;
        }

        const currentValue =
            typeof currentCommands[i] === 'string' ? currentCommands[i].trim() : '';
        if (currentValue && normalizedName === currentValue) {
            return originalValue;
        }
    }

    return normalizedName;
}

function createCommandWindowClass(BaseSelectable) {
    return class FakeWindowCommand extends BaseSelectable {
        constructor(commands = []) {
            super();
            this._commands = commands;
            this._list = [];
        }

        clearCommandList() {
            this._list = [];
        }

        makeCommandList() {
            for (const command of this._commands) {
                this.addCommand(
                    command.name,
                    command.symbol,
                    command.enabled === undefined ? true : command.enabled,
                    command.ext === undefined ? null : command.ext
                );
            }
        }

        addCommand(name, symbol, enabled = true, ext = null) {
            this._list.push({ name, symbol, enabled, ext });
        }

        createContents() {
            this._contentsCreated = true;
        }

        refresh() {
            this.clearCommandList();
            this.makeCommandList();
            this.createContents();
            BaseSelectable.prototype.refresh.call(this);
        }
    };
}

function installRpgMakerGlobals({ commandsOriginal = [], commands = [] } = {}) {
    globalThis.window = globalThis;
    globalThis.Imported = {};
    globalThis.$gameMessage = {
        _texts: [],
        _choices: [],
        _speakerName: '',
        isBusy: () => false,
        isChoice: () => false,
        allText: () => '',
        choices: () => [],
    };
    globalThis.$gameParty = {
        inBattle: () => false,
    };
    globalThis.$dataSystem = {
        terms: {
            commandsOriginal,
            commands,
        },
    };
    globalThis.$dataMap = null;

    class Game_Message {
        clear() {}
        isBusy() {
            return false;
        }
        allText() {
            return '';
        }
        choices() {
            return [];
        }
        isChoice() {
            return false;
        }
    }

    class Game_Variables {
        value() {
            return '';
        }
    }

    class Game_Interpreter {
        command101() {
            return true;
        }
        command102() {
            return true;
        }
        command320() {
            return true;
        }
    }

    class Window_Message {
        canStart() {
            return true;
        }
        terminateMessage() {}
        startInput() {
            return true;
        }
    }

    class Window_ScrollText {
        constructor() {
            this._text = '';
            this._refreshCount = 0;
        }

        refresh() {
            this._refreshCount += 1;
        }

        startMessage() {
            this._text = globalThis.$gameMessage.allText();
            this.refresh();
            return true;
        }
    }

    class Window_Selectable {
        refresh() {
            this._selectableRefreshCount = (this._selectableRefreshCount || 0) + 1;
        }
    }

    globalThis.Game_Message = Game_Message;
    globalThis.Game_Variables = Game_Variables;
    globalThis.Game_Interpreter = Game_Interpreter;
    globalThis.Window_Message = Window_Message;
    globalThis.Window_ScrollText = Window_ScrollText;
    globalThis.Window_Selectable = Window_Selectable;
    globalThis.Window_Command = createCommandWindowClass(Window_Selectable);
    globalThis.DataManager = {
        extractSaveContents() {},
        createGameObjects() {},
        loadDatabase() {},
    };
    globalThis.Scene_Title = class Scene_Title {
        createCommandWindow() {}
    };
    globalThis.Scene_Load = class Scene_Load {
        helpWindowText() {
            return '';
        }
    };
    globalThis.Scene_Map = class Scene_Map {
        onMapLoaded() {}
    };
}

function createRuntime({
    translationEnabled = false,
    translateCacheWhenDisabled = false,
    cacheEntries = [],
    batchResult = { successes: [], failures: [] },
} = {}) {
    return {
        translationCache: new Map(cacheEntries),
        lastSeenByCacheKey: new Map(),
        pendingTranslations: new Map(),
        failedTranslations: new Map(),
        translateCacheWhenDisabled,
        sourceLang: 'pl',
        targetLang: 'en',
        batchItemsLimit: 20,
        charLimit: 1000,
        _systemCommandsCollected: false,
        batchManager: {
            runBatchedTranslation: vi.fn().mockResolvedValue(batchResult),
            applyDataOnLifecycle: vi.fn(),
        },
        isTranslationEnabled() {
            return translationEnabled;
        },
        isNonOtfTranslationProcessActive() {
            return false;
        },
        getCacheKey(text, type) {
            const normalizedText = typeof text === 'string' ? text.replace(/\n+$/, '') : text;
            return `${type}:${this.sourceLang}-${this.targetLang}-${normalizedText}`;
        },
        getCanonicalSystemCommandName(commandName) {
            return getCanonicalSystemCommandName(commandName);
        },
        hasUsableCacheValue(cacheKey) {
            return this.translationCache.has(cacheKey) && this.translationCache.get(cacheKey) !== '';
        },
        setCacheValue(cacheKey, value) {
            this.translationCache.set(cacheKey, typeof value === 'string' ? value : String(value || ''));
        },
        trackCacheKeyUsage(cacheKey, options = {}) {
            const shouldHarvestMissing =
                options.harvestMissing === undefined ? true : !!options.harvestMissing;
            if (shouldHarvestMissing && !this.translationCache.has(cacheKey)) {
                this.setCacheValue(cacheKey, '');
            }

            this.lastSeenByCacheKey.set(cacheKey, Date.now());
        },
        markBatchFailuresAsUntranslated: vi.fn(),
        markBatchItemsAsUntranslated: vi.fn(),
        findMessageInterpreter() {
            return null;
        },
        replaceChoiceText: vi.fn(),
        replaceMessageText: vi.fn(),
        replaceSpeakerName: vi.fn(),
        normalizeSpeakerNameCase(value) {
            return value;
        },
        isSkippingMessages() {
            return false;
        },
    };
}

function commandKey(runtime, text) {
    return runtime.getCacheKey(text, 'command');
}

function scrollTextKey(runtime, text) {
    return runtime.getCacheKey(text, 'scroll_text');
}

describe('TranslateOnTheFlyRuntimeMethods command handling', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete globalThis.window;
        delete globalThis.Imported;
        delete globalThis.$gameMessage;
        delete globalThis.$gameParty;
        delete globalThis.$dataSystem;
        delete globalThis.$dataMap;
        delete globalThis.Game_Message;
        delete globalThis.Game_Variables;
        delete globalThis.Game_Interpreter;
        delete globalThis.Window_Message;
        delete globalThis.Window_ScrollText;
        delete globalThis.Window_Selectable;
        delete globalThis.Window_Command;
        delete globalThis.DataManager;
        delete globalThis.Scene_Title;
        delete globalThis.Scene_Load;
        delete globalThis.Scene_Map;
    });

    it('injects cached command translations during menu refresh and marks the original key as seen', async () => {
        installRpgMakerGlobals();
        const runtime = createRuntime({
            translationEnabled: false,
            translateCacheWhenDisabled: true,
            cacheEntries: [[`command:pl-en-Galeria`, 'Gallery']],
        });

        translateOnTheFlyRuntimeMethods.setupTranslationHook.call(runtime);

        const commandWindow = new globalThis.Window_Command([
            { name: 'Galeria', symbol: 'gallery' },
        ]);
        await commandWindow.refresh();

        expect(commandWindow._list).toEqual([
            { name: 'Gallery', symbol: 'gallery', enabled: true, ext: null },
        ]);
        expect(runtime.translationCache).toEqual(new Map([[commandKey(runtime, 'Galeria'), 'Gallery']]));
        expect(runtime.lastSeenByCacheKey.has(commandKey(runtime, 'Galeria'))).toBe(true);
    });

    it('maps already translated system command labels back to the original cache key', async () => {
        installRpgMakerGlobals({
            commandsOriginal: ['Galeria'],
            commands: ['Gallery'],
        });
        const runtime = createRuntime({
            translationEnabled: false,
            translateCacheWhenDisabled: true,
            cacheEntries: [[`command:pl-en-Galeria`, 'Gallery']],
        });

        translateOnTheFlyRuntimeMethods.setupTranslationHook.call(runtime);

        const commandWindow = new globalThis.Window_Command([
            { name: 'Gallery', symbol: 'gallery' },
        ]);
        await commandWindow.refresh();

        expect(commandWindow._list[0].name).toBe('Gallery');
        expect(runtime.lastSeenByCacheKey.has(commandKey(runtime, 'Galeria'))).toBe(true);
        expect(runtime.lastSeenByCacheKey.has(commandKey(runtime, 'Gallery'))).toBe(false);
        expect(runtime.translationCache.has(commandKey(runtime, 'Gallery'))).toBe(false);
    });

    it('harvests missing menu commands into cache and seen when no cached translation exists', async () => {
        installRpgMakerGlobals();
        const runtime = createRuntime({
            translationEnabled: false,
            translateCacheWhenDisabled: true,
        });

        translateOnTheFlyRuntimeMethods.setupTranslationHook.call(runtime);

        const commandWindow = new globalThis.Window_Command([
            { name: 'Galeria', symbol: 'gallery' },
        ]);
        await commandWindow.refresh();

        expect(commandWindow._list[0].name).toBe('Galeria');
        expect(runtime.translationCache.get(commandKey(runtime, 'Galeria'))).toBe('');
        expect(runtime.lastSeenByCacheKey.has(commandKey(runtime, 'Galeria'))).toBe(true);
    });

    it('does not treat dialog choice entries as command cache items during cache injection', async () => {
        installRpgMakerGlobals();
        const runtime = createRuntime({
            translationEnabled: true,
            batchResult: { successes: [], failures: [] },
        });

        translateOnTheFlyRuntimeMethods.setupTranslationHook.call(runtime);

        const commandWindow = new globalThis.Window_Command();
        commandWindow._translateApplyingCommandCache = true;
        commandWindow.addCommand('Tak', 'choice');

        expect(commandWindow._list).toEqual([
            { name: 'Tak', symbol: 'choice', enabled: true, ext: null },
        ]);
        expect(runtime.translationCache.size).toBe(0);
        expect(runtime.lastSeenByCacheKey.size).toBe(0);
        expect(runtime.batchManager.runBatchedTranslation).not.toHaveBeenCalled();
    });

    it('does not harvest dialog choice entries as command cache items in full refresh flow', async () => {
        installRpgMakerGlobals();
        const runtime = createRuntime({
            translationEnabled: false,
            translateCacheWhenDisabled: true,
        });

        translateOnTheFlyRuntimeMethods.setupTranslationHook.call(runtime);

        const commandWindow = new globalThis.Window_Command([{ name: 'Tak', symbol: 'choice' }]);
        await commandWindow.refresh();

        expect(commandWindow._list).toEqual([
            { name: 'Tak', symbol: 'choice', enabled: true, ext: null },
        ]);
        expect(runtime.translationCache.size).toBe(0);
        expect(runtime.lastSeenByCacheKey.size).toBe(0);
    });

    it('does not harvest dialog choice entries as command cache items in translation-enabled refresh flow', async () => {
        installRpgMakerGlobals();
        const runtime = createRuntime({
            translationEnabled: true,
            batchResult: { successes: [], failures: [] },
        });

        translateOnTheFlyRuntimeMethods.setupTranslationHook.call(runtime);

        const commandWindow = new globalThis.Window_Command([{ name: 'Tak', symbol: 'choice' }]);
        await commandWindow.refresh();

        expect(commandWindow._list).toEqual([
            { name: 'Tak', symbol: 'choice', enabled: true, ext: null },
        ]);
        expect(runtime.translationCache.size).toBe(0);
        expect(runtime.lastSeenByCacheKey.size).toBe(0);
        expect(runtime.batchManager.runBatchedTranslation).not.toHaveBeenCalled();
    });

    it('harvests missing command keys in on-the-fly refresh even when batch translation returns nothing', async () => {
        installRpgMakerGlobals();
        const runtime = createRuntime({
            translationEnabled: true,
            batchResult: { successes: [], failures: [] },
        });

        translateOnTheFlyRuntimeMethods.setupTranslationHook.call(runtime);

        const commandWindow = new globalThis.Window_Command([
            { name: 'Galeria', symbol: 'gallery' },
        ]);
        await commandWindow.refresh();

        expect(runtime.batchManager.runBatchedTranslation).toHaveBeenCalledTimes(1);
        expect(commandWindow._list[0].name).toBe('Galeria');
        expect(runtime.translationCache.get(commandKey(runtime, 'Galeria'))).toBe('');
        expect(runtime.lastSeenByCacheKey.has(commandKey(runtime, 'Galeria'))).toBe(true);
    });

    it('applies cached scroll_text translation when scroll message starts in cache-only mode', () => {
        installRpgMakerGlobals();
        globalThis.$gameMessage.allText = () => 'Original scroll line';

        const runtime = createRuntime({
            translationEnabled: false,
            translateCacheWhenDisabled: true,
            cacheEntries: [[`scroll_text:pl-en-Original scroll line`, 'Translated scroll line']],
        });

        translateOnTheFlyRuntimeMethods.setupTranslationHook.call(runtime);

        const scrollWindow = new globalThis.Window_ScrollText();
        scrollWindow.startMessage();

        expect(scrollWindow._text).toBe('Translated scroll line');
        expect(runtime.lastSeenByCacheKey.has(scrollTextKey(runtime, 'Original scroll line'))).toBe(
            true
        );
    });

    it('requests translation for uncached scroll_text and refreshes active scroll window', async () => {
        installRpgMakerGlobals();
        globalThis.$gameMessage.allText = () => 'Uncached scroll line';

        const runtime = createRuntime({
            translationEnabled: true,
        });

        runtime.batchManager.runBatchedTranslation = vi
            .fn()
            .mockImplementation(async (entries) => {
                const item = entries?.[0]?.items?.[0];
                runtime.translationCache.set(item.cacheKey, 'Scroll translated now');
                return {
                    successes: [
                        {
                            cacheKey: item.cacheKey,
                            translated: 'Scroll translated now',
                            type: 'scroll_text',
                        },
                    ],
                    failures: [],
                };
            });

        translateOnTheFlyRuntimeMethods.setupTranslationHook.call(runtime);

        const scrollWindow = new globalThis.Window_ScrollText();
        scrollWindow.startMessage();

        await Promise.resolve();
        await Promise.resolve();

        expect(runtime.batchManager.runBatchedTranslation).toHaveBeenCalledTimes(1);
        expect(scrollWindow._text).toBe('Scroll translated now');
        expect(runtime.pendingTranslations.has(scrollTextKey(runtime, 'Uncached scroll line'))).toBe(
            false
        );
    });
});
