import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InputFormMzTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/InputFormMzTranslator.js';

function createRuntime(translations = {}, enabled = true) {
    const cache = new Map(Object.entries(translations));
    const tracked = [];
    return {
        tracked,
        enabled,
        translationCache: cache,
        isTranslationEnabled() {
            return this.enabled;
        },
        translateCacheWhenDisabled: false,
        getCacheKey(value, type) {
            return `${type}:${value}`;
        },
        hasUsableCacheValue(key) {
            return cache.has(key);
        },
        trackCacheKeyUsage(key) {
            tracked.push(key);
        },
    };
}

describe('InputFormMzTranslator', () => {
    const savedWindow = globalThis.window;
    const savedDocument = globalThis.document;

    beforeEach(() => {
        globalThis.window = {};
    });

    afterEach(() => {
        globalThis.window = savedWindow;
        globalThis.document = savedDocument;
        vi.restoreAllMocks();
    });

    it('scans OK/Cancel button parameters and translates _111_submit buttons on _performInput without harvesting translated labels', () => {
        globalThis.window.$plugins = [
            {
                name: '111_InputFormMZ',
                status: true,
                parameters: {
                    'OK Button Text': '決定',
                    'Display Cancel Button': 'true',
                    'Cancel Button Text': 'キャンセル',
                },
            },
        ];

        let buttons = [];
        globalThis.document = {
            querySelectorAll(selector) {
                return selector === 'input[id="_111_submit"][type="submit"]' ? buttons : [];
            },
        };

        function Game_Interpreter() {}
        Game_Interpreter.prototype._performInput = function () {
            buttons = [{ value: '決定' }, { value: 'キャンセル' }];
        };
        globalThis.window.Game_Interpreter = Game_Interpreter;

        const runtime = createRuntime({
            'plugin_111_input_form_mz:決定': 'OK',
            'plugin_111_input_form_mz:キャンセル': 'Cancel',
        });

        const translator = new InputFormMzTranslator();
        vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);

        expect(translator.getCachedCountsSync({ runtime })).toEqual({
            total: 2,
            left: 0,
            totalStrings: 2,
            leftStrings: 0,
        });
        expect(translator.collectUntranslated({ runtime })).toEqual([]);

        expect(translator.enablePluginTranslation()).toBe(true);

        const interpreter = new Game_Interpreter();
        interpreter._performInput({});
        expect(buttons.map((b) => b.value)).toEqual(['OK', 'Cancel']);

        // Repeated calls on already-translated DOM must not track translated strings as keys
        translator.translateActiveButtons();
        expect(runtime.tracked).toEqual([
            'plugin_111_input_form_mz:決定',
            'plugin_111_input_form_mz:キャンセル',
        ]);

        // Disabling translation keeps original button labels untouched
        runtime.enabled = false;
        interpreter._performInput({});
        expect(buttons.map((b) => b.value)).toEqual(['決定', 'キャンセル']);
    });
});
