import { afterEach, describe, expect, it } from 'vitest';

import { SystemCommands } from '../../../../../../cheat-engine/www/cheat/translate-engines/translation-phases/SystemCommands.js';

function createRuntimeStub() {
    return {
        getCacheKey(value, type) {
            return `${type}:${value}`;
        },
        hasUsableCacheValue() {
            return false;
        },
    };
}

/** Extra Window_* keys registered by installGlobals (cleaned up in afterEach). */
let registeredWindowKeys = [];

function createWindowCommandBase() {
    globalThis.Window_Command = function Window_Command() {};
    globalThis.Window_Command.prototype.clearCommandList = function () {
        this._list = [];
    };
    globalThis.Window_Command.prototype.makeCommandList = function () {};
    registeredWindowKeys.push('Window_Command');
}

function registerWindowSubclass(name, makeCommandListFn) {
    const Ctor = function () {};
    Ctor.prototype = Object.create(globalThis.Window_Command.prototype);
    Ctor.prototype.constructor = Ctor;
    Ctor.prototype.makeCommandList = makeCommandListFn;
    globalThis[name] = Ctor;
    registeredWindowKeys.push(name);
    return Ctor;
}

function installGlobals({ commands = [], commandsOriginal = null, menuEntries = [] } = {}) {
    globalThis.window = globalThis;
    globalThis.$dataSystem = {
        terms: {
            commands,
            ...(Array.isArray(commandsOriginal) ? { commandsOriginal } : {}),
        },
    };

    createWindowCommandBase();
    registerWindowSubclass('Window_MenuCommand', function () {
        this._list = menuEntries.map((name) => ({
            name,
            symbol: 'dummy',
            enabled: true,
            ext: null,
        }));
    });
}

function installGlobalsWithHandlerInMenuList({
    commands = [],
    commandsOriginal = null,
    menuEntries = [],
} = {}) {
    globalThis.window = globalThis;
    globalThis.$dataSystem = {
        terms: {
            commands,
            ...(Array.isArray(commandsOriginal) ? { commandsOriginal } : {}),
        },
    };

    createWindowCommandBase();
    globalThis.Window_Command.prototype.setHandler = function (symbol, method) {
        this._handlers[symbol] = method;
    };

    registerWindowSubclass('Window_MenuCommand', function () {
        this.setHandler('item', () => {});
        this._list = menuEntries.map((name) => ({
            name,
            symbol: 'dummy',
            enabled: true,
            ext: null,
        }));
    });
}

describe('SystemCommands', () => {
    afterEach(() => {
        delete globalThis.window;
        delete globalThis.$dataSystem;
        for (const key of registeredWindowKeys) {
            delete globalThis[key];
        }
        registeredWindowKeys = [];
    });

    it('adds menu command names to the source list when commandsOriginal is not present', () => {
        installGlobals({
            commands: ['Item', 'Skill'],
            menuEntries: ['Item', 'Skill', 'Gallery'],
        });

        const strategy = new SystemCommands();
        const values = strategy
            .collectUntranslated({ runtime: createRuntimeStub() })
            .map((item) => item.value);

        expect(values).toEqual(['Item', 'Skill', 'Gallery']);
    });

    it('preserves duplicates from terms.commands when commandsOriginal is not present', () => {
        installGlobals({
            commands: ['Item', 'Skill', 'Item'],
            menuEntries: ['Item', 'Skill'],
        });

        const strategy = new SystemCommands();
        const values = strategy
            .collectUntranslated({ runtime: createRuntimeStub() })
            .map((item) => item.value);

        expect(values).toEqual(['Item', 'Skill', 'Item']);
    });

    it('filters out menu names already present in terms.commands when commandsOriginal exists', () => {
        installGlobals({
            commandsOriginal: ['Przedmiot', 'Umiejetnosci'],
            commands: ['Item', 'Skill'],
            menuEntries: ['Item', 'Skill', 'Gallery'],
        });

        const strategy = new SystemCommands();
        const values = strategy
            .collectUntranslated({ runtime: createRuntimeStub() })
            .map((item) => item.value);

        expect(values).toEqual(['Przedmiot', 'Umiejetnosci', 'Gallery']);
    });

    it('collects menu names when makeCommandList sets handlers (MZ plugin-style)', () => {
        installGlobalsWithHandlerInMenuList({
            commandsOriginal: ['ItemOriginal'],
            commands: ['Items'],
            menuEntries: ['Items', 'Gallery'],
        });

        const strategy = new SystemCommands();
        const values = strategy
            .collectUntranslated({ runtime: createRuntimeStub() })
            .map((item) => item.value);

        expect(values).toEqual(['ItemOriginal', 'Gallery']);
    });

    it('gathers commands from multiple discovered window classes', () => {
        installGlobals({
            commands: ['Attack'],
            menuEntries: ['Item', 'Skill'],
        });

        registerWindowSubclass('Window_TitleCommand', function () {
            this._list = [
                { name: 'New Game', symbol: 'newGame', enabled: true, ext: null },
                { name: 'Continue', symbol: 'continue', enabled: true, ext: null },
            ];
        });

        registerWindowSubclass('Window_BattleCommand', function () {
            this._list = [
                { name: 'Attack', symbol: 'attack', enabled: true, ext: null },
                { name: 'Guard', symbol: 'guard', enabled: true, ext: null },
            ];
        });

        const strategy = new SystemCommands();
        const values = strategy
            .collectUntranslated({ runtime: createRuntimeStub() })
            .map((item) => item.value);

        expect(values).toContain('Item');
        expect(values).toContain('Skill');
        expect(values).toContain('New Game');
        expect(values).toContain('Continue');
        expect(values).toContain('Attack');
        expect(values).toContain('Guard');
    });

    it('skips window classes whose makeCommandList throws', () => {
        installGlobals({
            commands: ['Item'],
            menuEntries: ['Item', 'Save'],
        });

        registerWindowSubclass('Window_CrashyCommand', function () {
            throw new Error('Game_Temp is not defined');
        });

        const strategy = new SystemCommands();
        const values = strategy
            .collectUntranslated({ runtime: createRuntimeStub() })
            .map((item) => item.value);

        expect(values).toContain('Item');
        expect(values).toContain('Save');
    });

    it('deduplicates command names across window classes', () => {
        installGlobals({
            commands: [],
            menuEntries: ['Item', 'Skill'],
        });

        registerWindowSubclass('Window_OptionsCommand', function () {
            this._list = [
                { name: 'Item', symbol: 'item', enabled: true, ext: null },
                { name: 'Options', symbol: 'options', enabled: true, ext: null },
            ];
        });

        const strategy = new SystemCommands();
        const names = strategy.collectCommandWindowNames();

        const itemCount = names.filter((n) => n === 'Item').length;
        expect(itemCount).toBe(1);
        expect(names).toContain('Options');
    });
});
