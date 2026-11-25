import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    FtkrOriginalSceneWindowTranslator,
    extractOswCommandTexts,
} from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/FtkrOriginalSceneWindowTranslator.js';

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
        getCacheValue(key) {
            return cache.get(key);
        },
        trackCacheKeyUsage(key) {
            tracked.push(key);
        },
    };
}

describe('FtkrOriginalSceneWindowTranslator', () => {
    const savedWindow = globalThis.window;

    beforeEach(() => {
        globalThis.window = {};
    });

    afterEach(() => {
        globalThis.window = savedWindow;
        vi.restoreAllMocks();
    });

    it('extracts display strings from OSW common, command, and select plugin commands', () => {
        expect(
            extractOswCommandTexts(
                'OSW_コモン設定 マップ 0 内容 ステータス text(\\V[2]　\\c[23]週目)'
            )
        ).toEqual(['\\V[2]　\\c[23]週目']);

        expect(
            extractOswCommandTexts(
                'OSW_コモン設定 マップ 0 内容 ステータス text(\\V[2]);text(\\c[23]日目) 幅比率 1,1,0'
            )
        ).toEqual(['\\c[23]日目']);

        expect(
            extractOswCommandTexts(
                'OSW_コモン設定 マップ 1 内容 ステータス eval($gameParty.gold());text();text(\\c[17]\\G) 幅比率 3,0,1'
            )
        ).toEqual([]);

        expect(
            extractOswCommandTexts(
                'OSW_SET_COMMON ORIGINAL 0 TEXT 0 お知らせ コマンド位置 left'
            )
        ).toEqual(['お知らせ']);

        expect(
            extractOswCommandTexts(
                'OSW_コマンド設定 オリジナル 0 コマンド追加 ステータス status true コモンイベント(1)'
            )
        ).toEqual(['ステータス']);

        expect(
            extractOswCommandTexts(
                'OSW_セレクト設定 オリジナル 0 リスト設定 テキスト 項目A,項目B,\\V[1]'
            )
        ).toEqual(['項目A', '項目B']);
    });

    it('scans common events and translates drawCssText, common, command, and select windows without mutating stored data', async () => {
        const drawn = [];

        function Window_Base() {}
        Window_Base.prototype.drawTextEx = function (text) {
            drawn.push(['drawTextEx', this.constructor.name, text]);
            return text;
        };
        Window_Base.prototype.drawCssText = function (_actor, _x, _y, _w, text) {
            this.drawTextEx(text);
            return 1;
        };

        function Window_OswCommon() {}
        Window_OswCommon.prototype = Object.create(Window_Base.prototype);
        Window_OswCommon.prototype.constructor = Window_OswCommon;

        function Window_OswCommand(names) {
            this._names = names;
        }
        Window_OswCommand.prototype = Object.create(Window_Base.prototype);
        Window_OswCommand.prototype.constructor = Window_OswCommand;
        Window_OswCommand.prototype.commandName = function (index) {
            return this._names[index];
        };
        Window_OswCommand.prototype.drawItem = function (index) {
            drawn.push(['command', this.commandName(index)]);
        };

        function Window_OswSelect(data) {
            this._window = { _drawType: 0 };
            this._data = data;
        }
        Window_OswSelect.prototype = Object.create(Window_Base.prototype);
        Window_OswSelect.prototype.constructor = Window_OswSelect;
        Window_OswSelect.prototype.drawItem = function (index) {
            this.drawTextEx(this._data[index]);
        };

        function Scene_Base() {
            this._oswCommonWindows = [];
            this._oswCommandWindows = [];
            this._oswSelectWindows = [];
        }
        Scene_Base.prototype.createCommonWindow = function (id) {
            this._oswCommonWindows[id] = new Window_OswCommon();
        };
        Scene_Base.prototype.createCommandWindow = function (id, gw) {
            this._oswCommandWindows[id] = new Window_OswCommand(gw.names);
        };
        Scene_Base.prototype.createSelectWindow = function (id, gw) {
            this._oswSelectWindows[id] = new Window_OswSelect(gw.data);
        };

        globalThis.window.Window_Base = Window_Base;
        globalThis.window.Scene_Base = Scene_Base;
        globalThis.window.$dataCommonEvents = [
            null,
            {
                id: 1,
                list: [
                    {
                        code: 356,
                        parameters: [
                            'OSW_コモン設定 マップ 0 内容 ステータス text(\\V[2]　\\c[23]週目)',
                        ],
                    },
                ],
            },
        ];
        globalThis.window.$dataTroops = [];
        globalThis.window.$dataMapInfos = [];

        const runtime = createRuntime({
            'plugin_ftkr_original_scene_window:\\V[2]　\\c[23]週目': 'Week \\V[2]',
            'plugin_ftkr_original_scene_window:お知らせ': 'Notice',
            'plugin_ftkr_original_scene_window:ステータス': 'Status',
            'plugin_ftkr_original_scene_window:項目A': 'Item A',
        });

        const translator = new FtkrOriginalSceneWindowTranslator();
        vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
        await translator.precomputeCounts();
        expect(translator.getCachedCountsSync({ runtime })).toEqual({
            total: 1,
            left: 0,
            totalStrings: 1,
            leftStrings: 0,
        });

        expect(translator.enablePluginTranslation()).toBe(true);

        const scene = new Scene_Base();
        scene.createCommonWindow(0);
        scene.createCommandWindow(0, { names: ['ステータス'] });
        scene.createSelectWindow(0, { data: ['項目A'] });

        const commonWin = scene._oswCommonWindows[0];
        const cmdWin = scene._oswCommandWindows[0];
        const selWin = scene._oswSelectWindows[0];

        // Repeated redraws must only track original source keys
        commonWin.drawCssText(null, 0, 0, 150, '\\V[2]　\\c[23]週目');
        commonWin.drawCssText(null, 0, 0, 150, '\\V[2]　\\c[23]週目');
        commonWin.drawTextEx('お知らせ');
        cmdWin.drawItem(0);
        selWin.drawItem(0);

        expect(drawn).toEqual([
            ['drawTextEx', 'Window_OswCommon', 'Week \\V[2]'],
            ['drawTextEx', 'Window_OswCommon', 'Week \\V[2]'],
            ['drawTextEx', 'Window_OswCommon', 'Notice'],
            ['command', 'Status'],
            ['drawTextEx', 'Window_OswSelect', 'Item A'],
        ]);

        // Stored source data remains untouched
        expect(cmdWin.commandName(0)).toBe('ステータス');
        expect(selWin._data[0]).toBe('項目A');
        expect(runtime.tracked.every((k) => !k.includes('Week') && !k.includes('Notice'))).toBe(
            true
        );

        // Disabling translation preserves original text
        runtime.enabled = false;
        drawn.length = 0;
        commonWin.drawCssText(null, 0, 0, 150, '\\V[2]　\\c[23]週目');
        cmdWin.drawItem(0);
        selWin.drawItem(0);
        expect(drawn).toEqual([
            ['drawTextEx', 'Window_OswCommon', '\\V[2]　\\c[23]週目'],
            ['command', 'ステータス'],
            ['drawTextEx', 'Window_OswSelect', '項目A'],
        ]);
    });
});
