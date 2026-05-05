import { afterEach, describe, expect, it } from 'vitest';

import { SystemCommands } from '../../../../../../cheat-engine/www/cheat/translate-engines/translation-phases/SystemCommands.js';

function createPanelStub() {
    return {
        getCacheKey(value, type) {
            return `${type}:${value}`;
        },
        hasUsableCacheValue() {
            return false;
        },
    };
}

function installGlobals({ commands = [], commandsOriginal = null, menuEntries = [] } = {}) {
    globalThis.window = globalThis;
    globalThis.$dataSystem = {
        terms: {
            commands,
            ...(Array.isArray(commandsOriginal) ? { commandsOriginal } : {}),
        },
    };

    const menuPrototype = {
        _list: [],
        clearCommandList() {
            this._list = [];
        },
        makeCommandList() {
            this._list = menuEntries.map((name) => ({
                name,
                symbol: 'dummy',
                enabled: true,
                ext: null,
            }));
        },
    };

    globalThis.Window_MenuCommand = function Window_MenuCommand() {};
    globalThis.Window_MenuCommand.prototype = menuPrototype;
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

    const selectablePrototype = {
        setHandler(symbol, method) {
            this._handlers[symbol] = method;
        },
    };

    const commandPrototype = Object.create(selectablePrototype);
    commandPrototype.clearCommandList = function() {
        this._list = [];
    };

    commandPrototype.makeCommandList = function() {
        this.setHandler('item', () => {});
        this._list = menuEntries.map((name) => ({
            name,
            symbol: 'dummy',
            enabled: true,
            ext: null,
        }));
    };

    globalThis.Window_MenuCommand = function Window_MenuCommand() {};
    globalThis.Window_MenuCommand.prototype = commandPrototype;
}

describe('SystemCommands', () => {
    afterEach(() => {
        delete globalThis.window;
        delete globalThis.$dataSystem;
        delete globalThis.Window_MenuCommand;
    });

    it('adds menu command names to the source list when commandsOriginal is not present', () => {
        installGlobals({
            commands: ['Item', 'Skill'],
            menuEntries: ['Item', 'Skill', 'Gallery'],
        });

        const strategy = new SystemCommands();
        const values = strategy
            .collectUntranslated({ panel: createPanelStub() })
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
            .collectUntranslated({ panel: createPanelStub() })
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
            .collectUntranslated({ panel: createPanelStub() })
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
            .collectUntranslated({ panel: createPanelStub() })
            .map((item) => item.value);

        expect(values).toEqual(['ItemOriginal', 'Gallery']);
    });
});
