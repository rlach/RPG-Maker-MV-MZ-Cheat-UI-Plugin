import { afterEach, expect, it, vi } from 'vitest';
import { BasePluginTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/BasePluginTranslator.js';
import { NRP_MessageWindowTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/NRP_MessageWindowTranslator.js';
import { LLInfoPopupWIndowTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/LLInfoPopupWIndowTranslator.js';

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

it('offers settings only on opt-in translators and applies offsets without drift', () => {
    vi.stubGlobal('window', globalThis);
    class Message {
        constructor() {
            this.sprite = { x: 10, y: 20 };
        }
        calcWindowHeight() {
            return 120;
        }
        lineHeight() {
            return 30;
        }
        fittingHeight(lines) {
            return lines * 30 + 20;
        }
        contentsSprite() {
            return this.sprite;
        }
        updatePlacement() {
            this.y = 100;
        }
    }
    vi.stubGlobal('Window_Message', Message);
    const translator = new NRP_MessageWindowTranslator();
    const runtime = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        pluginTranslatorSettings: { OtherPlugin: { option: 1 } },
        saveGameTranslationSettings: vi.fn(),
    };
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    expect(new BasePluginTranslator().getSettingsSchema()).toEqual([]);
    expect(translator.getSettingsSchema()).toHaveLength(4);
    expect(translator.enablePluginTranslation()).toBe(true);
    const message = new Message();
    vi.stubGlobal('SceneManager', { _scene: { _messageWindow: message } });
    translator.savePluginSettings({ textOffsetX: '5', textOffsetY: '-40', windowOffsetY: '-30' });
    message.updatePlacement();
    message.updatePlacement();
    expect(message.sprite).toEqual({ x: 15, y: -20 });
    expect(message.y).toBe(70);
    expect(runtime.pluginTranslatorSettings.OtherPlugin).toEqual({ option: 1 });
    expect(runtime.saveGameTranslationSettings).toHaveBeenCalledOnce();
    runtime.enabled = false;
    message.updatePlacement();
    expect(message.sprite).toEqual({ x: 10, y: 20 });
    expect(message.y).toBe(100);
    translator.savePluginSettings({ textOffsetX: NaN, textOffsetY: -99999 });
    expect(translator.getPluginSettings()).toEqual({
        maxLinesPerPage: 0,
        textOffsetX: 0,
        textOffsetY: -2048,
        windowOffsetY: 0,
    });
});

it('moves MZ animated and finished glyphs together with their clipping area on every frame', () => {
    vi.stubGlobal('window', globalThis);
    class Message {
        constructor() {
            this._clientArea = { x: 12, y: 12 };
            this.contents = { x: 0, y: 0, parent: this._clientArea };
            this.animatedGlyph = { x: 0, y: 0, parent: this._clientArea };
        }
        calcWindowHeight() {
            return 120;
        }
        lineHeight() {
            return 30;
        }
        fittingHeight(lines) {
            return lines * 30 + 24;
        }
        updatePlacement() {
            this.y = 100;
        }
        _updateClientArea() {
            this._clientArea.x = 12;
            this._clientArea.y = 12;
        }
        _updateFilterArea() {
            this.clip = { x: this._clientArea.x, y: this._clientArea.y, width: 600, height: 200 };
        }
    }
    vi.stubGlobal('Window_Message', Message);
    const translator = new NRP_MessageWindowTranslator();
    const runtime = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        pluginTranslatorSettings: { NRP_MessageWindow: { textOffsetX: -80, textOffsetY: -60 } },
    };
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    expect(translator.enablePluginTranslation()).toBe(true);
    const message = new Message();
    for (const offset of [-80, 80, 0]) {
        runtime.pluginTranslatorSettings.NRP_MessageWindow.textOffsetX = offset;
        message.updatePlacement();
        for (let frame = 0; frame < 3; frame++) {
            message._updateClientArea();
            message._updateFilterArea();
            expect(message.contents.parent.x).toBe(12 + offset);
            expect(message.animatedGlyph.parent.x).toBe(message.contents.parent.x);
            expect(message.clip).toEqual({ x: 12 + offset, y: -48, width: 600, height: 200 });
        }
    }
    runtime.enabled = false;
    message.updatePlacement();
    expect(message._clientArea).toEqual({ x: 12, y: 12 });
    expect(message.clip.y).toBe(12);
});

it('harvests LL popup command text and translates before sizing without changing arguments', async () => {
    vi.stubGlobal('window', globalThis);
    const shown = vi.fn();
    vi.stubGlobal('PluginManager', { _commands: { 'LL_InfoPopupWIndow:showMessage': shown } });
    const translator = new LLInfoPopupWIndowTranslator();
    vi.spyOn(translator, 'precomputeCounts').mockResolvedValue();
    const runtime = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        getCacheKey: (text, type) => `${type}:${text}`,
        trackCacheKeyUsage: vi.fn(),
        translationCache: new Map([
            ['plugin_ll_info_popup_window:極太ディルド改', 'Upgraded item'],
        ]),
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
    };
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    const args = { messageText: '極太ディルド改', windowX: '300', seName: 'itemget1' };
    translator.collectCommandTexts([
        { code: 357, parameters: ['LL_InfoPopupWIndow', 'showMessage', '', args] },
    ]);
    expect([...translator.entries.keys()]).toEqual(['極太ディルド改']);
    expect(translator.enablePluginTranslation()).toBe(true);
    PluginManager._commands['LL_InfoPopupWIndow:showMessage'](args);
    expect(shown).toHaveBeenLastCalledWith({ ...args, messageText: 'Upgraded item' });
    expect(args.messageText).toBe('極太ディルド改');
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith(
        'plugin_ll_info_popup_window:極太ディルド改',
        expect.anything()
    );
    runtime.enabled = false;
    PluginManager._commands['LL_InfoPopupWIndow:showMessage'](args);
    expect(shown).toHaveBeenLastCalledWith(args);
});
