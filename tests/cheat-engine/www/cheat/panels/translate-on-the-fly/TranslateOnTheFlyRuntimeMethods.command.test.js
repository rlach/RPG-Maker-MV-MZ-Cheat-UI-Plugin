import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock heavy transitive imports to keep this a true unit test.
// PluginTranslatorRegistry pulls in every plugin translator (some reference `window` at module scope).
vi.mock(
    '../../../../../../cheat-engine/www/cheat/translate-engines/plugins/PluginTranslatorRegistry.js',
    () => ({
        PLUGIN_TRANSLATOR_REGISTRY: {
            ensureDetectionStarted: vi.fn(),
            ensureDetectionCompleted: vi.fn().mockResolvedValue(undefined),
            getDetectedTranslatorInstances: vi.fn(() => []),
            getDetectedPluginSummaries: vi.fn(() => []),
            normalizeMessageCacheSources: vi.fn(),
        },
    })
);

vi.mock(
    '../../../../../../cheat-engine/www/cheat/translate-engines/batch-manager/TranslationBatchManagerFactory.js',
    () => ({
        createTranslationBatchManager: vi.fn(() => ({
            runBatchedTranslation: vi.fn().mockResolvedValue({ successes: [], failures: [] }),
            applyDataOnLifecycle: vi.fn(),
            register: vi.fn(),
        })),
    })
);

// Mock HookGuardHelper so installCommandTranslationHook always applies in test isolation.
vi.mock('../../../../../../cheat-engine/www/cheat/js/HookGuardHelper.js', () => ({
    shouldApplyHook: vi.fn(() => true),
    isHookAlreadyApplied: vi.fn(() => false),
    markHookAsApplied: vi.fn(() => true),
    clearAllHookGuards: vi.fn(),
    getAppliedHooks: vi.fn(() => []),
}));

import { translateOnTheFlyRuntimeMethods } from '../../../../../../cheat-engine/www/cheat/js/translation-runtime/TranslateOnTheFlyRuntimeMethods.js';

function getCanonicalSystemCommandName(commandName) {
    const normalizedName =
        typeof commandName === 'string'
            ? commandName.trim()
            : commandName == null
              ? ''
              : String(commandName).trim();

    if (!normalizedName) {
        return normalizedName;
    }

    if (!(this.reverseCommandLookup instanceof Map)) {
        this.reverseCommandLookup = new Map();
    }

    if (this.reverseCommandLookup.size === 0 && this.translationCache instanceof Map) {
        for (const [cacheKey, translatedValue] of this.translationCache.entries()) {
            if (typeof cacheKey !== 'string' || !cacheKey.startsWith('command:')) {
                continue;
            }

            const lookupText = typeof translatedValue === 'string' ? translatedValue.trim() : '';
            if (!lookupText) {
                continue;
            }

            this.reverseCommandLookup.set(lookupText, cacheKey);
        }
    }

    const mappedCacheKey = this.reverseCommandLookup.get(normalizedName);
    if (typeof mappedCacheKey !== 'string' || !mappedCacheKey.startsWith('command:')) {
        return normalizedName;
    }

    const marker = `${this.sourceLang}-${this.targetLang}-`;
    const markerIndex = mappedCacheKey.indexOf(marker);
    if (markerIndex < 0) {
        return normalizedName;
    }

    const canonicalName = mappedCacheKey.slice(markerIndex + marker.length).trim();
    return canonicalName || normalizedName;
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
    const WindowCommandBase = createCommandWindowClass(Window_Selectable);
    globalThis.Window_Command = WindowCommandBase;

    // Subclass with own makeCommandList — mirrors real RPG Maker subclasses.
    // Dynamic discovery hooks classes like this, not Window_Command itself.
    class Window_MenuCommand extends WindowCommandBase {}
    Window_MenuCommand.prototype.makeCommandList = WindowCommandBase.prototype.makeCommandList;
    globalThis.Window_MenuCommand = Window_MenuCommand;

    // Simulate game already booted so command hooks install immediately.
    globalThis.SceneManager = { _scene: {} };

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
    enableTranslation = false,
    cacheEntries = [],
    batchResult = { successes: [], failures: [] },
} = {}) {
    const removeReverseCommandLookupByCacheKey = function (cacheKey) {
        if (!(this.reverseCommandLookup instanceof Map) || !cacheKey) {
            return;
        }

        for (const [lookupText, mappedCacheKey] of this.reverseCommandLookup.entries()) {
            if (mappedCacheKey === cacheKey) {
                this.reverseCommandLookup.delete(lookupText);
            }
        }
    };

    return {
        translationCache: new Map(cacheEntries),
        reverseCommandLookup: new Map(),
        lastSeenByCacheKey: new Map(),
        pendingTranslations: new Map(),
        failedTranslations: new Map(),
        enableTranslation,
        sourceLang: 'pl',
        targetLang: 'en',
        batchItemsLimit: 20,
        charLimit: 1000,
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
            return getCanonicalSystemCommandName.call(this, commandName);
        },
        hasUsableCacheValue(cacheKey) {
            return this.translationCache.has(cacheKey) && this.translationCache.get(cacheKey) !== '';
        },
        setCacheValue(cacheKey, value) {
            const normalizedValue =
                typeof value === 'string' ? value : value == null ? '' : String(value);

            let resolvedKey = cacheKey;
            if (typeof cacheKey === 'string' && cacheKey.startsWith('command:')) {
                const marker = `${this.sourceLang}-${this.targetLang}-`;
                const markerIndex = cacheKey.indexOf(marker);
                if (markerIndex >= 0) {
                    const sourceName = cacheKey.slice(markerIndex + marker.length).trim();
                    const canonicalName = this.getCanonicalSystemCommandName(sourceName);
                    if (canonicalName && canonicalName !== sourceName) {
                        resolvedKey = this.getCacheKey(canonicalName, 'command');
                    }
                }
            }

            if (resolvedKey !== cacheKey && this.translationCache.has(cacheKey)) {
                this.translationCache.delete(cacheKey);
                removeReverseCommandLookupByCacheKey.call(this, cacheKey);
            }

            const existingValue = this.translationCache.get(resolvedKey);
            const hasExistingTranslatedValue =
                existingValue !== '' && existingValue !== null && existingValue !== undefined;
            const incomingIsPlaceholder = normalizedValue === '';

            if (!(incomingIsPlaceholder && hasExistingTranslatedValue)) {
                this.translationCache.set(resolvedKey, normalizedValue);
            }

            if (typeof resolvedKey === 'string' && resolvedKey.startsWith('command:')) {
                removeReverseCommandLookupByCacheKey.call(this, resolvedKey);
                const currentValue = this.translationCache.get(resolvedKey);
                const lookupText = typeof currentValue === 'string' ? currentValue.trim() : '';
                if (lookupText) {
                    this.reverseCommandLookup.set(lookupText, resolvedKey);
                }
            }
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
        delete globalThis.Window_MenuCommand;
        delete globalThis.SceneManager;
        delete globalThis.DataManager;
        delete globalThis.Scene_Title;
        delete globalThis.Scene_Load;
        delete globalThis.Scene_Map;
    });

    it('injects cached command translations during menu refresh when cache-mode is enabled', () => {
        installRpgMakerGlobals();
        const runtime = createRuntime({
            translationEnabled: false,
            enableTranslation: true,
            cacheEntries: [[`command:pl-en-Galeria`, 'Gallery']],
        });

        translateOnTheFlyRuntimeMethods.setupTranslationHook.call(runtime);

        const commandWindow = new globalThis.Window_MenuCommand([
            { name: 'Galeria', symbol: 'gallery' },
        ]);
        commandWindow.refresh();

        expect(commandWindow._list).toEqual([
            { name: 'Gallery', symbol: 'gallery', enabled: true, ext: null },
        ]);
        expect(runtime.translationCache).toEqual(new Map([[commandKey(runtime, 'Galeria'), 'Gallery']]));
        expect(runtime.lastSeenByCacheKey.has(commandKey(runtime, 'Galeria'))).toBe(true);
    });

    it('maps already translated system command labels back to the original cache key', () => {
        installRpgMakerGlobals({
            commandsOriginal: ['Galeria'],
            commands: ['Gallery'],
        });
        const runtime = createRuntime({
            translationEnabled: false,
            enableTranslation: true,
            cacheEntries: [[`command:pl-en-Galeria`, 'Gallery']],
        });

        translateOnTheFlyRuntimeMethods.setupTranslationHook.call(runtime);

        const commandWindow = new globalThis.Window_MenuCommand([
            { name: 'Gallery', symbol: 'gallery' },
        ]);
        commandWindow.refresh();

        expect(commandWindow._list[0].name).toBe('Gallery');
        expect(runtime.lastSeenByCacheKey.has(commandKey(runtime, 'Galeria'))).toBe(true);
        expect(runtime.lastSeenByCacheKey.has(commandKey(runtime, 'Gallery'))).toBe(false);
        expect(runtime.translationCache.has(commandKey(runtime, 'Gallery'))).toBe(false);
    });

    it('does not create duplicate translated-name command key during harvest', () => {
        installRpgMakerGlobals();
        const runtime = createRuntime({
            translationEnabled: false,
            enableTranslation: true,
            cacheEntries: [['command:ja-en-CGｼｰﾝﾃｷｽﾄ背景', 'CG Scene Text Background']],
        });

        // Keep test cache key construction consistent with runtime language pair.
        runtime.sourceLang = 'ja';
        runtime.targetLang = 'en';

        const canonicalKey = commandKey(runtime, 'CGｼｰﾝﾃｷｽﾄ背景');
        const translatedNameKey = commandKey(runtime, 'CG Scene Text Background');

        runtime.trackCacheKeyUsage(translatedNameKey);

        expect(runtime.translationCache.get(canonicalKey)).toBe('CG Scene Text Background');
        expect(runtime.translationCache.has(translatedNameKey)).toBe(false);
    });

    it('harvests missing menu commands into cache and seen when no cached translation exists', () => {
        installRpgMakerGlobals();
        const runtime = createRuntime({
            translationEnabled: false,
            enableTranslation: true,
        });

        translateOnTheFlyRuntimeMethods.setupTranslationHook.call(runtime);

        const commandWindow = new globalThis.Window_MenuCommand([
            { name: 'Galeria', symbol: 'gallery' },
        ]);
        commandWindow.refresh();

        expect(commandWindow._list[0].name).toBe('Galeria');
        expect(runtime.translationCache.get(commandKey(runtime, 'Galeria'))).toBe('');
        expect(runtime.lastSeenByCacheKey.has(commandKey(runtime, 'Galeria'))).toBe(true);
    });

    it('does not treat dialog choice entries as command cache items during refresh', () => {
        installRpgMakerGlobals();
        const runtime = createRuntime({
            translationEnabled: false,
            enableTranslation: true,
        });

        translateOnTheFlyRuntimeMethods.setupTranslationHook.call(runtime);

        const commandWindow = new globalThis.Window_Command([
            { name: 'Tak', symbol: 'choice' },
        ]);
        commandWindow.refresh();

        expect(commandWindow._list).toEqual([
            { name: 'Tak', symbol: 'choice', enabled: true, ext: null },
        ]);
        expect(runtime.translationCache.size).toBe(0);
        expect(runtime.lastSeenByCacheKey.size).toBe(0);
    });

    it('does not harvest dialog choice entries as command cache items in full refresh flow', () => {
        installRpgMakerGlobals();
        const runtime = createRuntime({
            translationEnabled: false,
            enableTranslation: true,
        });

        translateOnTheFlyRuntimeMethods.setupTranslationHook.call(runtime);

        const commandWindow = new globalThis.Window_Command([{ name: 'Tak', symbol: 'choice' }]);
        commandWindow.refresh();

        expect(commandWindow._list).toEqual([
            { name: 'Tak', symbol: 'choice', enabled: true, ext: null },
        ]);
        expect(runtime.translationCache.size).toBe(0);
        expect(runtime.lastSeenByCacheKey.size).toBe(0);
    });

    it('does not harvest dialog choice entries as command cache items in realtime refresh flow', () => {
        installRpgMakerGlobals();
        const runtime = createRuntime({
            translationEnabled: true,
            batchResult: { successes: [], failures: [] },
        });

        translateOnTheFlyRuntimeMethods.setupTranslationHook.call(runtime);

        const commandWindow = new globalThis.Window_Command([{ name: 'Tak', symbol: 'choice' }]);
        commandWindow.refresh();

        expect(commandWindow._list).toEqual([
            { name: 'Tak', symbol: 'choice', enabled: true, ext: null },
        ]);
        expect(runtime.translationCache.size).toBe(0);
        expect(runtime.lastSeenByCacheKey.size).toBe(0);
    });

    it('harvests missing command keys during refresh when realtime translation is enabled', () => {
        installRpgMakerGlobals();
        const runtime = createRuntime({
            translationEnabled: true,
        });

        translateOnTheFlyRuntimeMethods.setupTranslationHook.call(runtime);

        const commandWindow = new globalThis.Window_MenuCommand([
            { name: 'Galeria', symbol: 'gallery' },
        ]);
        commandWindow.refresh();

        expect(commandWindow._list[0].name).toBe('Galeria');
        expect(runtime.translationCache.get(commandKey(runtime, 'Galeria'))).toBe('');
        expect(runtime.lastSeenByCacheKey.has(commandKey(runtime, 'Galeria'))).toBe(true);
    });

    it('applies cached scroll_text translation when scroll message starts in cache-mode', () => {
        installRpgMakerGlobals();
        globalThis.$gameMessage.allText = () => 'Original scroll line';

        const runtime = createRuntime({
            translationEnabled: false,
            enableTranslation: true,
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

        // The scroll text translation goes through an async chain:
        // runBatchedTranslation() → .then() → .catch() → .finally()
        // Each step needs a microtask tick to resolve.
        for (let i = 0; i < 10; i++) {
            await Promise.resolve();
        }

        expect(runtime.batchManager.runBatchedTranslation).toHaveBeenCalledTimes(1);
        expect(scrollWindow._text).toBe('Scroll translated now');
        expect(runtime.pendingTranslations.has(scrollTextKey(runtime, 'Uncached scroll line'))).toBe(
            false
        );
    });

    it('keeps Scene_Title lifecycle hook working when another plugin reassigns Scene_Title class', () => {
        installRpgMakerGlobals();
        const runtime = createRuntime({
            translationEnabled: false,
            enableTranslation: true,
        });

        translateOnTheFlyRuntimeMethods.setupTranslationHook.call(runtime);

        const Scene_Title_old = globalThis.Scene_Title;
        let titleMapCreateCommandWindowCalls = 0;

        globalThis.Scene_Title = class Scene_TitleMap {
            createWindowLayer() {}

            createCommandWindow() {
                titleMapCreateCommandWindowCalls += 1;
                return Scene_Title_old.prototype.createCommandWindow.call(this);
            }
        };

        const scene = new globalThis.Scene_Title();
        expect(() => scene.createCommandWindow()).not.toThrow();
        expect(titleMapCreateCommandWindowCalls).toBe(1);
        expect(runtime.batchManager.applyDataOnLifecycle).toHaveBeenCalledWith({
            trigger: 'sceneTitleCreateCommandWindow',
        });
    });
});
