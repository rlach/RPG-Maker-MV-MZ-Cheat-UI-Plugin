import { afterEach, expect, it, vi } from 'vitest';
import { AutoNamePopupTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/AutoNamePopupTranslator.js';
import { NuunStatusScreenTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/NuunStatusScreenTranslator.js';
import { ManoInputConfigTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/ManoInputConfigTranslator.js';
import { NUUN_EnemyBookTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/NUUN_EnemyBookTranslator.js';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
function runtimeFor(t, pairs) {
    const r = {
        isTranslationEnabled: () => true,
        getCacheKey: (text, type) => type + ':' + text,
        translationCache: new Map(pairs.map(([s, v]) => [t.getCacheType() + ':' + s, v])),
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    vi.spyOn(t, 'getRuntime').mockReturnValue(r);
    return r;
}
it('initializes the v1.1.2 name popup getter', () => {
    class System {
        getNamePopup() {
            return 'レイラ';
        }
    }
    vi.stubGlobal('Utils', { RPGMAKER_NAME: 'MZ' });
    vi.stubGlobal('window', {
        Game_System: System,
        $plugins: [{ name: 'AutoNamePopup', status: true, parameters: { mode: '0' } }],
    });
    const t = new AutoNamePopupTranslator();
    const r = runtimeFor(t, []);
    r.translationCache.set('actor_name:レイラ', 'Leila');
    expect(t.enablePluginTranslation()).toBe(true);
    expect(new System().getNamePopup('face,0')).toBe('Leila');
});
it('collects older status schema and translates the separate content window', () => {
    class Status {
        drawText(text) {
            return text;
        }
    }
    class Content {
        destroy() {}
        drawText(text) {
            return text;
        }
    }
    class Scene {
        createStatusContentWindow() {
            this._leftContentWindow = new Content();
            this._rightContentWindow = new Content();
        }
    }
    const parameters = {
        ParamName: '能力値',
        XParamName: '追加能力値',
        SParamName: '特殊能力値',
        Xparam: JSON.stringify([
            JSON.stringify({ XparamName: '性感度', XparamEval: 'a.xparam(10)', XparamUnit: '%' }),
        ]),
    };
    vi.stubGlobal('window', {
        Window_Status: Status,
        Scene_Status: Scene,
        $plugins: [{ name: 'NUUN_StatusScreen', status: true, parameters }],
    });
    const t = new NuunStatusScreenTranslator();
    runtimeFor(t, [
        ['能力値', 'Parameters'],
        ['性感度', 'Sensitivity'],
    ]);
    expect(t.buildScanEntries().map((e) => e.text)).toContain('性感度');
    expect(t.enablePluginTranslation()).toBe(true);
    const scene = new Scene();
    scene.createStatusContentWindow();
    expect(scene._leftContentWindow.drawText('能力値')).toBe('Parameters');
    expect(scene._rightContentWindow.drawText('能力値')).toBe('Parameters');
    expect(new Content().drawText('性感度')).toBe('Sensitivity');
    expect(new Content().drawText('100%')).toBe('100%');
});
it('finds legacy MZ config parameters and translates help before rendering lines', async () => {
    const text = 'ゲームパッドが接続されていません\nボタンを押して再度試してください';
    vi.stubGlobal('window', {
        $plugins: [
            {
                name: 'Mano_InputConfig',
                status: true,
                parameters: { GamepadIsNotConnected: JSON.stringify(text) },
            },
        ],
    });
    const t = new ManoInputConfigTranslator();
    vi.stubGlobal('fetch', async () => ({
        ok: true,
        text: async () => 'var $plugins=' + JSON.stringify(window.$plugins) + ';',
    }));
    vi.spyOn(t, '_scheduleEnablePluginTranslation').mockImplementation(() => {});
    await t.precomputeCounts();
    expect(t._scanEntries.map((e) => e.text)).toContain(text);
    runtimeFor(t, [[text, 'No gamepad connected.\nPress a button to retry.']]);
    const help = {
        drawText: (s) => s,
        setText(s) {
            this.text = s;
        },
    };
    t._patchSceneWindowDrawText({ _helpWindow: help });
    help.setText(text);
    expect(help.text).toBe('No gamepad connected.\nPress a button to retry.');
});
it('catalogs bestiary source defaults before they are observed', async () => {
    vi.stubGlobal('window', {
        $dataEnemies: [],
        $plugins: [{ name: 'NUUN_EnemyBook', status: true, parameters: {} }],
    });
    vi.stubGlobal('fetch', async () => ({
        ok: true,
        text: async () => "this.drawText('獲得金額',0,0);this.drawText('耐性属性',0,0);",
    }));
    const t = new NUUN_EnemyBookTranslator();
    vi.spyOn(t, '_scheduleEnablePluginTranslation').mockImplementation(() => {});
    await t.precomputeCounts();
    expect(t._scanEntries.map((e) => e.text)).toContain('獲得金額');
    expect(t._scanEntries.map((e) => e.text)).toContain('耐性属性');
});

it('hooks gamepad help through the older exported-window branch even on MZ', () => {
    const text = 'ゲームパッドが接続されていません\nボタンを押して再度試してください';
    class GamepadScene {
        createAllWindows() {
            this._helpWindow = {
                _text: text,
                drawText: (text) => text,
                setText(text) {
                    this._text = text;
                },
            };
            this._gamepadWindow = {
                drawText: (text) => text,
                refresh() {},
                updateHelp: () => this._helpWindow.setText(text),
            };
        }
    }
    vi.stubGlobal('window', {
        Mano_InputConfig: { Window_GamepadConfig: class {}, Scene_GamepadConfig: GamepadScene },
    });
    const translator = new ManoInputConfigTranslator();
    translator._sourceAliases = new Map([[text, text]]);
    vi.spyOn(translator, 'precomputeCounts').mockResolvedValue();
    runtimeFor(translator, [[text, 'No gamepad connected.\nPress a button to retry.']]);
    vi.spyOn(translator, '_hookOptionsCommandName').mockReturnValue(true);
    vi.spyOn(translator, '_hookMV').mockReturnValue(true);
    expect(translator._isMvVersion()).toBe(true);
    expect(translator.enablePluginTranslation()).toBe(true);
    const scene = new GamepadScene();
    scene.createAllWindows();
    expect(scene._helpWindow._text).toBe('No gamepad connected.\nPress a button to retry.');
});

it('reads configured names from the private runtime content class before opening status', () => {
    const names = [
        'ＨＰ再生率',
        'ＭＰ再生率',
        'ＴＰ再生率',
        'ＭＰ消費率',
        'ＴＰチャージ率',
        '経験獲得率',
    ];
    const destroy = vi.fn();
    const xparams = [7, 8, 9].map((XparamId) =>
        JSON.stringify({ XparamId: String(XparamId), XparamName: '' })
    );
    const sparams = [4, 5, 9].map((SparamId) =>
        JSON.stringify({ SparamId: String(SparamId), SparamName: '' })
    );
    class PrivateContent {
        XparamName(index) {
            return names[index];
        }
        SparamName(index) {
            return names[index + 3];
        }
        destroy() {
            destroy();
        }
    }
    class Scene {
        createStatusContentWindow() {
            this._leftContentWindow = new PrivateContent();
            this._rightContentWindow = new PrivateContent();
        }
    }
    vi.stubGlobal('window', {
        Scene_Status: Scene,
        $plugins: [
            {
                name: 'NUUN_StatusScreen',
                status: true,
                parameters: { Xparam: JSON.stringify(xparams), Sparam: JSON.stringify(sparams) },
            },
        ],
    });
    const translator = new NuunStatusScreenTranslator();
    const runtime = runtimeFor(
        translator,
        names.map((text, index) => [text, 'Translated ' + index])
    );
    const entries = translator.buildScanEntries().map((entry) => entry.text);
    expect(entries).toEqual(names);
    expect(entries).not.toContain('獲得経験率');
    expect(destroy).toHaveBeenCalledTimes(2);
    for (const [index, text] of names.entries()) {
        expect(translator.translateKnownText(text, runtime)).toBe('Translated ' + index);
    }
});
