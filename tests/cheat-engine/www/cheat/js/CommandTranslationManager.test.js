import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../cheat-engine/www/cheat/js/HookGuardHelper.js', () => ({
    shouldApplyHook: vi.fn(() => true),
}));

import {
    applyTranslationsToCommands,
    collectUntranslatedCommands,
    installCommandTranslationHook,
} from '../../../../../cheat-engine/www/cheat/js/CommandTranslationManager.js';
import { shouldApplyHook } from '../../../../../cheat-engine/www/cheat/js/HookGuardHelper.js';

function createRuntime({
    translationEnabled = false,
    translateCacheWhenDisabled = false,
    nonOtfActive = false,
    cacheEntries = [],
} = {}) {
    const translationCache = new Map(cacheEntries);
    const lastSeenByCacheKey = new Map();

    return {
        translationCache,
        lastSeenByCacheKey,
        translateCacheWhenDisabled,
        sourceLang: 'ja',
        targetLang: 'en',
        isTranslationEnabled: () => translationEnabled,
        isNonOtfTranslationProcessActive: () => nonOtfActive,
        getCacheKey(text, type) {
            return `${type}:${this.sourceLang}-${this.targetLang}-${text}`;
        },
        getCanonicalSystemCommandName(name) {
            return name;
        },
        hasUsableCacheValue(cacheKey) {
            return translationCache.has(cacheKey) && translationCache.get(cacheKey) !== '';
        },
        trackCacheKeyUsage(cacheKey, options = {}) {
            const shouldHarvest = options.harvestMissing === undefined ? true : !!options.harvestMissing;
            if (shouldHarvest && !translationCache.has(cacheKey)) {
                translationCache.set(cacheKey, '');
            }
            lastSeenByCacheKey.set(cacheKey, Date.now());
        },
    };
}

function cmdKey(runtime, text) {
    return runtime.getCacheKey(text, 'command');
}

describe('applyTranslationsToCommands', () => {
    it('replaces names from cache in-place', () => {
        const runtime = createRuntime({
            translateCacheWhenDisabled: true,
            cacheEntries: [['command:ja-en-ニューゲーム', 'New Game']],
        });

        const list = [{ name: 'ニューゲーム', symbol: 'newGame', enabled: true, ext: null }];
        applyTranslationsToCommands(list, runtime);

        expect(list[0].name).toBe('New Game');
        expect(runtime.lastSeenByCacheKey.has(cmdKey(runtime, 'ニューゲーム'))).toBe(true);
    });

    it('harvests missing commands as empty cache entries', () => {
        const runtime = createRuntime({ translationEnabled: true });

        const list = [{ name: 'セーブ', symbol: 'save', enabled: true, ext: null }];
        applyTranslationsToCommands(list, runtime);

        expect(list[0].name).toBe('セーブ');
        expect(runtime.translationCache.get(cmdKey(runtime, 'セーブ'))).toBe('');
        expect(runtime.lastSeenByCacheKey.has(cmdKey(runtime, 'セーブ'))).toBe(true);
    });

    it('skips entries with symbol "choice"', () => {
        const runtime = createRuntime({ translationEnabled: true });

        const list = [{ name: 'はい', symbol: 'choice', enabled: true, ext: null }];
        applyTranslationsToCommands(list, runtime);

        expect(list[0].name).toBe('はい');
        expect(runtime.translationCache.size).toBe(0);
        expect(runtime.lastSeenByCacheKey.size).toBe(0);
    });

    it('skips entries with empty or non-string names', () => {
        const runtime = createRuntime({ translationEnabled: true });

        const list = [
            { name: '', symbol: 'empty', enabled: true, ext: null },
            { name: null, symbol: 'null', enabled: true, ext: null },
            { name: '  ', symbol: 'whitespace', enabled: true, ext: null },
        ];
        applyTranslationsToCommands(list, runtime);

        expect(runtime.translationCache.size).toBe(0);
    });

    it('does nothing when no translation mode is active', () => {
        const runtime = createRuntime({
            translationEnabled: false,
            translateCacheWhenDisabled: false,
            cacheEntries: [['command:ja-en-アイテム', 'Items']],
        });

        const list = [{ name: 'アイテム', symbol: 'item', enabled: true, ext: null }];
        applyTranslationsToCommands(list, runtime);

        expect(list[0].name).toBe('アイテム');
        expect(runtime.lastSeenByCacheKey.size).toBe(0);
    });

    it('does nothing for null or empty command list', () => {
        const runtime = createRuntime({ translationEnabled: true });

        applyTranslationsToCommands(null, runtime);
        applyTranslationsToCommands([], runtime);

        expect(runtime.lastSeenByCacheKey.size).toBe(0);
    });

    it('activates when nonOtfActive is true even if translation is disabled', () => {
        const runtime = createRuntime({
            nonOtfActive: true,
            cacheEntries: [['command:ja-en-装備', 'Equip']],
        });

        const list = [{ name: '装備', symbol: 'equip', enabled: true, ext: null }];
        applyTranslationsToCommands(list, runtime);

        expect(list[0].name).toBe('Equip');
    });

    it('translates multiple commands in a single list', () => {
        const runtime = createRuntime({
            translateCacheWhenDisabled: true,
            cacheEntries: [
                ['command:ja-en-アイテム', 'Items'],
                ['command:ja-en-スキル', 'Skills'],
            ],
        });

        const list = [
            { name: 'アイテム', symbol: 'item', enabled: true, ext: null },
            { name: 'スキル', symbol: 'skill', enabled: true, ext: null },
            { name: '終了', symbol: 'gameEnd', enabled: true, ext: null },
        ];
        applyTranslationsToCommands(list, runtime);

        expect(list[0].name).toBe('Items');
        expect(list[1].name).toBe('Skills');
        expect(list[2].name).toBe('終了');
        expect(runtime.translationCache.get(cmdKey(runtime, '終了'))).toBe('');
    });
});

describe('collectUntranslatedCommands', () => {
    it('returns untranslated entries as batch items', () => {
        const runtime = createRuntime({
            cacheEntries: [['command:ja-en-アイテム', 'Items']],
        });

        const list = [
            { name: 'アイテム', symbol: 'item', enabled: true, ext: null },
            { name: 'セーブ', symbol: 'save', enabled: true, ext: null },
        ];
        const items = collectUntranslatedCommands(list, runtime);

        expect(items).toEqual([
            { type: 'command', id: 'cmd_1', value: 'セーブ', cacheKey: cmdKey(runtime, 'セーブ') },
        ]);
    });

    it('skips entries with symbol "choice"', () => {
        const runtime = createRuntime();

        const list = [{ name: 'はい', symbol: 'choice', enabled: true, ext: null }];
        const items = collectUntranslatedCommands(list, runtime);

        expect(items).toEqual([]);
    });

    it('returns empty array for null/empty list', () => {
        const runtime = createRuntime();

        expect(collectUntranslatedCommands(null, runtime)).toEqual([]);
        expect(collectUntranslatedCommands([], runtime)).toEqual([]);
    });
});

describe('installCommandTranslationHook', () => {
    let originalBaseMakeCommandList;
    let originalTitleMakeCommandList;

    beforeEach(() => {
        shouldApplyHook.mockReturnValue(true);

        // Simulate RPG Maker prototype chain:
        // Window_Command (base) -> Window_TitleCommand (subclass with own makeCommandList)
        globalThis.Window_Command = function () {};
        globalThis.Window_Command.prototype.makeCommandList = function () {
            this._list = [{ name: 'ベース', symbol: 'base', enabled: true, ext: null }];
        };
        originalBaseMakeCommandList = globalThis.Window_Command.prototype.makeCommandList;

        globalThis.Window_TitleCommand = function () {};
        globalThis.Window_TitleCommand.prototype = Object.create(globalThis.Window_Command.prototype);
        globalThis.Window_TitleCommand.prototype.constructor = globalThis.Window_TitleCommand;
        globalThis.Window_TitleCommand.prototype.makeCommandList = function () {
            this._list = [
                { name: 'ニューゲーム', symbol: 'newGame', enabled: true, ext: null },
                { name: 'コンティニュー', symbol: 'continue', enabled: true, ext: null },
            ];
        };
        originalTitleMakeCommandList = globalThis.Window_TitleCommand.prototype.makeCommandList;
    });

    afterEach(() => {
        delete globalThis.Window_Command;
        delete globalThis.Window_TitleCommand;
        delete globalThis.Window_MenuCommand;
        vi.restoreAllMocks();
    });

    it('patches makeCommandList on subclass to apply translations', () => {
        const runtime = createRuntime({
            translateCacheWhenDisabled: true,
            cacheEntries: [
                ['command:ja-en-ニューゲーム', 'New Game'],
                ['command:ja-en-コンティニュー', 'Continue'],
            ],
        });

        installCommandTranslationHook(runtime);

        const instance = new globalThis.Window_TitleCommand();
        instance._list = [];
        instance.makeCommandList();

        expect(instance._list[0].name).toBe('New Game');
        expect(instance._list[1].name).toBe('Continue');
    });

    it('also patches the base Window_Command prototype', () => {
        const runtime = createRuntime({
            translateCacheWhenDisabled: true,
            cacheEntries: [['command:ja-en-ベース', 'Base']],
        });

        installCommandTranslationHook(runtime);

        const instance = new globalThis.Window_Command();
        instance._list = [];
        instance.makeCommandList();

        expect(instance._list[0].name).toBe('Base');
    });

    it('does not patch when shouldApplyHook returns false', () => {
        shouldApplyHook.mockReturnValue(false);

        const runtime = createRuntime({ translationEnabled: true });
        installCommandTranslationHook(runtime);

        expect(globalThis.Window_Command.prototype.makeCommandList).toBe(originalBaseMakeCommandList);
        expect(globalThis.Window_TitleCommand.prototype.makeCommandList).toBe(originalTitleMakeCommandList);
    });

    it('calls original makeCommandList to populate the list', () => {
        const runtime = createRuntime(); // no translation active

        installCommandTranslationHook(runtime);

        const instance = new globalThis.Window_TitleCommand();
        instance._list = [];
        instance.makeCommandList();

        expect(instance._list).toEqual([
            { name: 'ニューゲーム', symbol: 'newGame', enabled: true, ext: null },
            { name: 'コンティニュー', symbol: 'continue', enabled: true, ext: null },
        ]);
    });

    it('skips window classes that do not exist at hook time', () => {
        // Window_MenuCommand not defined — should not throw
        const runtime = createRuntime({ translationEnabled: true });

        expect(() => installCommandTranslationHook(runtime)).not.toThrow();
    });
});
