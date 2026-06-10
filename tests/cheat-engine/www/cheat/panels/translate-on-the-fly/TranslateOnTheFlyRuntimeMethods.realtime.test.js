import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock(
    '../../../../../../cheat-engine/www/cheat/translate-engines/plugins/PluginTranslatorRegistry.js',
    () => ({
        PLUGIN_TRANSLATOR_REGISTRY: {
            ensureDetectionStarted: vi.fn(),
            ensureDetectionCompleted: vi.fn().mockResolvedValue(undefined),
            getDetectedTranslatorInstances: vi.fn(() => []),
            getDetectedPluginSummaries: vi.fn(() => []),
            resolveMessageCacheSourceText: vi.fn(({ text }) => text),
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

vi.mock('../../../../../../cheat-engine/www/cheat/js/HookGuardHelper.js', () => ({
    shouldApplyHook: vi.fn(() => true),
    isHookAlreadyApplied: vi.fn(() => false),
    markHookAsApplied: vi.fn(() => true),
    clearAllHookGuards: vi.fn(),
    getAppliedHooks: vi.fn(() => []),
}));

vi.mock('../../../../../../cheat-engine/www/cheat/js/TranslateOnTheFlyState.js', () => ({
    TranslateOnTheFlyState: {
        isEnabled: vi.fn(() => false),
        setEnabled: vi.fn(),
        toggleEnabled: vi.fn(() => false),
        subscribe: vi.fn(() => () => {}),
    },
}));

import { translateOnTheFlyCoreMethods } from '../../../../../../cheat-engine/www/cheat/js/translation-runtime/TranslateOnTheFlyCoreMethods.js';
import { translateOnTheFlyRuntimeMethods } from '../../../../../../cheat-engine/www/cheat/js/translation-runtime/TranslateOnTheFlyRuntimeMethods.js';

function installRpgMakerGlobals({ messageLines = ['JP line 1'], speaker = 'NPC' } = {}) {
    globalThis.window = globalThis;
    globalThis.Imported = {};

    globalThis.$gameMessage = {
        _texts: messageLines.slice(),
        _choices: [],
        _speakerName: speaker,
        _translateOriginalText: undefined,
        _translateOriginalChoices: undefined,
        _translateOriginalSpeaker: undefined,
        _translateMessageOrigin: undefined,
        isBusy: () => false,
        isChoice: () => false,
        allText() {
            return this._texts.join('\n');
        },
        choices() {
            return this._choices;
        },
    };

    globalThis.$gameParty = {
        inBattle: () => false,
    };

    globalThis.$dataSystem = {
        terms: {
            commandsOriginal: [],
            commands: [],
        },
    };

    globalThis.$dataMap = null;

    class Game_Message {
        clear() {}
        isBusy() {
            return false;
        }
        allText() {
            return globalThis.$gameMessage.allText();
        }
        choices() {
            return globalThis.$gameMessage.choices();
        }
        isChoice() {
            return globalThis.$gameMessage.isChoice();
        }
    }

    class Game_Variables {
        value() {
            return '';
        }
    }

    class Game_Interpreter {
        constructor() {
            this._eventId = 1;
            this._index = 0;
            this._list = [];
            this._waitMode = 'message';
        }

        isRunning() {
            return true;
        }

        currentCommand() {
            return this._list[this._index] || null;
        }

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
        }

        refresh() {}

        startMessage() {
            this._text = globalThis.$gameMessage.allText();
            return true;
        }
    }

    class Window_Selectable {
        refresh() {}
    }

    class Window_Command extends Window_Selectable {
        clearCommandList() {
            this._list = [];
        }

        makeCommandList() {}

        createContents() {}

        refresh() {
            this.clearCommandList();
            this.makeCommandList();
            this.createContents();
            Window_Selectable.prototype.refresh.call(this);
        }
    }

    globalThis.Game_Message = Game_Message;
    globalThis.Game_Variables = Game_Variables;
    globalThis.Game_Interpreter = Game_Interpreter;
    globalThis.Window_Message = Window_Message;
    globalThis.Window_ScrollText = Window_ScrollText;
    globalThis.Window_Selectable = Window_Selectable;
    globalThis.Window_Command = Window_Command;

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
}

function createRuntime({
    translationEnabled = true,
    cacheEntries = [],
    requestForegroundDialogBatch = null,
    skipActive = false,
} = {}) {
    const skipState = {
        active: !!skipActive,
    };

    const replaceMessageText = vi.fn((translatedText) => {
        globalThis.$gameMessage._texts = String(translatedText || '').split('\n');
    });

    const runtime = {
        enabled: false,
        enableTranslation: false,
        _isMessageSkipActive: () => false,
        translateFullEventInRealtime: true,
        interruptQueueForRealtime: false,
        sourceLang: 'ja',
        targetLang: 'en',
        translationCache: new Map(cacheEntries),
        lastSeenByCacheKey: new Map(),
        pendingTranslations: new Map(),
        failedTranslations: new Map(),
        reverseCommandLookup: new Map(),
        _foregroundDialogBatchState: {
            active: false,
            operationKey: '',
            sourceTrigger: '',
            startedAt: 0,
            promise: null,
        },
        engine: {
            cancelActiveRequest: vi.fn(() => true),
            cancelActiveBackgroundRequest: vi.fn(() => false),
            hasActiveBackgroundRequest: vi.fn(() => false),
        },
        batchManager: {
            runBatchedTranslation: vi.fn().mockResolvedValue({ successes: [], failures: [] }),
            applyDataOnLifecycle: vi.fn(),
        },
        isTranslationEnabled() {
            return translationEnabled;
        },
        isNonOtfTranslationProcessActive() {
            return false;
        },
        isForegroundDialogBatchActive() {
            return !!this._foregroundDialogBatchState?.active;
        },
        findMessageInterpreter() {
            return this._testInterpreter || null;
        },
        requestForegroundDialogBatch:
            requestForegroundDialogBatch || vi.fn(() => Promise.resolve(null)),
        trackCacheKeyUsage(cacheKey, options = {}) {
            const shouldHarvestMissing =
                options.harvestMissing === undefined ? true : !!options.harvestMissing;
            if (shouldHarvestMissing && !this.translationCache.has(cacheKey)) {
                this.translationCache.set(cacheKey, '');
            }
            this.lastSeenByCacheKey.set(cacheKey, Date.now());
        },
        hasUsableCacheValue(cacheKey) {
            return (
                this.translationCache.has(cacheKey) && this.translationCache.get(cacheKey) !== ''
            );
        },
        setCacheValue(cacheKey, value) {
            this.translationCache.set(cacheKey, value);
        },
        replaceMessageText,
        replaceChoiceText: vi.fn((choices) => {
            globalThis.$gameMessage._choices = Array.isArray(choices) ? choices.slice() : [];
        }),
        replaceSpeakerName: vi.fn((speaker) => {
            globalThis.$gameMessage._speakerName = speaker;
        }),
        normalizeSpeakerNameCase(value) {
            return value;
        },
        notify: vi.fn(),
        setSkipActive(active) {
            skipState.active = !!active;
        },
    };

    Object.assign(runtime, translateOnTheFlyCoreMethods, translateOnTheFlyRuntimeMethods);
    runtime.isTranslationEnabled = () => translationEnabled;
    runtime.isSkippingMessages = () => skipState.active;

    return runtime;
}

function createMessageInterpreterWithThreeMessages() {
    const interpreter = new globalThis.Game_Interpreter();
    interpreter._eventId = 99;
    interpreter._index = 0;
    interpreter._waitMode = 'message';
    interpreter._list = [
        { code: 101, parameters: ['', 0, 0, 2, 'Narrator'] },
        { code: 401, parameters: ['JP line 1'] },
        { code: 401, parameters: ['JP line 2'] },
        { code: 401, parameters: ['JP line 3'] },
    ];
    return interpreter;
}

describe('TranslateOnTheFly realtime flow', () => {
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
        delete globalThis.SceneManager;
        delete globalThis.DataManager;
        delete globalThis.Scene_Title;
        delete globalThis.Scene_Load;
    });

    it('correctly translates text realtime when it encounters untranslated event', async () => {
        installRpgMakerGlobals({ messageLines: ['JP line 1'], speaker: '' });

        const runtime = createRuntime();
        runtime._testInterpreter = createMessageInterpreterWithThreeMessages();

        runtime.requestForegroundDialogBatch = vi.fn((payload) => {
            runtime.pendingTranslations.set(payload.cacheKey, true);
            return Promise.resolve(null);
        });

        translateOnTheFlyRuntimeMethods.setupTranslationHook.call(runtime);

        const windowMessage = new globalThis.Window_Message();
        const firstCanStart = windowMessage.canStart();

        expect(firstCanStart).toBe(false);
        expect(runtime.requestForegroundDialogBatch).toHaveBeenCalled();
        expect(runtime.requestForegroundDialogBatch).toHaveBeenCalledWith(
            expect.objectContaining({
                currentText: 'JP line 1',
                currentSpeakerName: '',
                maxDepth: 999,
            })
        );

        const messageKey = runtime.getMessageCacheKey('JP line 1', { hasPortrait: false });
        runtime.pendingTranslations.delete(messageKey);
        runtime.translationCache.set(messageKey, 'EN line 1');

        const secondCanStart = windowMessage.canStart();

        expect(secondCanStart).toBe(true);
        expect(runtime.replaceMessageText).toHaveBeenCalledWith('EN line 1');
    });

    it('does not stop execution when event is translated', () => {
        installRpgMakerGlobals({ messageLines: ['JP line 1'], speaker: '' });

        const runtime = createRuntime();
        runtime._testInterpreter = createMessageInterpreterWithThreeMessages();

        const messageKey = runtime.getMessageCacheKey('JP line 1', { hasPortrait: false });
        runtime.translationCache.set(messageKey, 'EN line 1');

        runtime.requestForegroundDialogBatch = vi.fn();

        translateOnTheFlyRuntimeMethods.setupTranslationHook.call(runtime);

        const windowMessage = new globalThis.Window_Message();
        const canStart = windowMessage.canStart();

        expect(canStart).toBe(true);
        expect(runtime.replaceMessageText).toHaveBeenCalledWith('EN line 1');
        expect(runtime.requestForegroundDialogBatch).not.toHaveBeenCalled();
    });

    it('if user aborts OTF while skip is held it cancels and keeps current text as-is', () => {
        installRpgMakerGlobals({ messageLines: ['JP line 1'], speaker: '' });

        const runtime = createRuntime();
        runtime._testInterpreter = createMessageInterpreterWithThreeMessages();

        runtime.requestForegroundDialogBatch = vi.fn((payload) => {
            runtime.pendingTranslations.set(payload.cacheKey, true);
            return Promise.resolve(null);
        });

        translateOnTheFlyRuntimeMethods.setupTranslationHook.call(runtime);

        const windowMessage = new globalThis.Window_Message();
        const firstCanStart = windowMessage.canStart();

        expect(firstCanStart).toBe(false);
        expect(runtime.requestForegroundDialogBatch).toHaveBeenCalled();

        runtime.setSkipActive(true);

        const secondCanStart = windowMessage.canStart();

        expect(secondCanStart).toBe(true);
        expect(runtime.engine.cancelActiveRequest).toHaveBeenCalledWith('request_aborted');
        expect(runtime.replaceMessageText).not.toHaveBeenCalledWith('JP line 1');
    });

    it('does not start new OTF requests while skip is held and resumes on next normal message', () => {
        installRpgMakerGlobals({ messageLines: ['JP line 1'], speaker: '' });

        const runtime = createRuntime();
        runtime._testInterpreter = createMessageInterpreterWithThreeMessages();

        runtime.requestForegroundDialogBatch = vi.fn((payload) => {
            runtime.pendingTranslations.set(payload.cacheKey, true);
            return Promise.resolve(null);
        });

        translateOnTheFlyRuntimeMethods.setupTranslationHook.call(runtime);

        const windowMessage = new globalThis.Window_Message();
        expect(windowMessage.canStart()).toBe(false);
        expect(runtime.requestForegroundDialogBatch).toHaveBeenCalledTimes(1);

        runtime.setSkipActive(true);
        expect(windowMessage.canStart()).toBe(true);
        expect(runtime.requestForegroundDialogBatch).toHaveBeenCalledTimes(1);

        runtime.pendingTranslations.clear();
        runtime.failedTranslations.clear();
        runtime._foregroundDialogBatchState.active = false;
        windowMessage.terminateMessage();

        globalThis.$gameMessage._texts = ['JP line 2'];
        globalThis.$gameMessage._translateOriginalText = undefined;
        globalThis.$gameMessage._translateOriginalChoices = undefined;
        globalThis.$gameMessage._translateOriginalSpeaker = undefined;

        const skipHeldCanStart = windowMessage.canStart();
        expect(skipHeldCanStart).toBe(true);
        expect(runtime.requestForegroundDialogBatch).toHaveBeenCalledTimes(1);

        runtime.setSkipActive(false);
        windowMessage.terminateMessage();

        globalThis.$gameMessage._texts = ['JP line 3'];
        globalThis.$gameMessage._translateOriginalText = undefined;
        globalThis.$gameMessage._translateOriginalChoices = undefined;
        globalThis.$gameMessage._translateOriginalSpeaker = undefined;

        const afterReleaseCanStart = windowMessage.canStart();
        expect(afterReleaseCanStart).toBe(false);
        expect(runtime.requestForegroundDialogBatch).toHaveBeenCalledTimes(2);
    });

    it('preserves already translated landing text while skip is held', () => {
        installRpgMakerGlobals({ messageLines: ['EN line 1'], speaker: '' });

        const runtime = createRuntime();
        runtime._testInterpreter = createMessageInterpreterWithThreeMessages();

        const messageKey = runtime.getMessageCacheKey('JP line 1', { hasPortrait: false });
        runtime.pendingTranslations.set(messageKey, true);

        translateOnTheFlyRuntimeMethods.setupTranslationHook.call(runtime);

        const windowMessage = new globalThis.Window_Message();
        runtime.setSkipActive(true);

        const canStart = windowMessage.canStart();

        expect(canStart).toBe(true);
        expect(globalThis.$gameMessage._texts.join('\n')).toBe('EN line 1');
        expect(runtime.requestForegroundDialogBatch).not.toHaveBeenCalled();
    });
});
