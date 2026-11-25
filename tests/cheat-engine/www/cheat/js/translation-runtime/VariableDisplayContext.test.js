import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
    installVariableDisplayContexts,
    isVariableDisplayContext,
} from '../../../../../../cheat-engine/www/cheat/js/translation-runtime/VariableDisplayContext.js';

describe('VariableDisplayContext.installVariableDisplayContexts', () => {
    const savedWindow = globalThis.window;

    beforeEach(() => {
        globalThis.window = {};
    });

    afterEach(() => {
        globalThis.window = savedWindow;
    });

    it('wraps Window_* subclass convertEscapeCharacters overrides that captured the base method before installation', () => {
        const observed = [];

        function Window_Base() {}
        Window_Base.prototype.convertEscapeCharacters = function (text) {
            observed.push({ cls: this.constructor.name, inContext: isVariableDisplayContext() });
            return text;
        };

        function Window_ChoiceList() {}
        Window_ChoiceList.prototype = Object.create(Window_Base.prototype);
        Window_ChoiceList.prototype.constructor = Window_ChoiceList;

        // Simulate GALV_VisualNovelChoices capturing the unwrapped base method at plugin load time.
        const capturedBase = Window_ChoiceList.prototype.convertEscapeCharacters;
        Window_ChoiceList.prototype.convertEscapeCharacters = function (text) {
            return capturedBase.call(this, text);
        };

        globalThis.window.Window_Base = Window_Base;
        globalThis.window.Window_ChoiceList = Window_ChoiceList;

        installVariableDisplayContexts();
        // Idempotency check
        installVariableDisplayContexts();

        expect(isVariableDisplayContext()).toBe(false);

        const baseWin = new Window_Base();
        const choiceWin = new Window_ChoiceList();
        baseWin.convertEscapeCharacters('hello');
        choiceWin.convertEscapeCharacters('choice');

        expect(observed).toEqual([
            { cls: 'Window_Base', inContext: true },
            { cls: 'Window_ChoiceList', inContext: true },
        ]);
        expect(isVariableDisplayContext()).toBe(false);
    });
});
