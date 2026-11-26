import { afterEach, expect, it, vi } from 'vitest';
import { CbrEroStatusTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/CbrEroStatusTranslator.js';
import { TMMenuLabelTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/TMMenuLabelTranslator.js';
import { isVariableDisplayContext } from '../cheat-engine/www/cheat/js/translation-runtime/VariableDisplayContext.js';
import { prepareCbrVariableText, restoreCbrVariableText } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/CbrVariableText.js';

afterEach(() => {
    delete globalThis.__CHEAT_CBR_ERO_STATUS_TRANSLATOR_HOOKED__;
    delete globalThis.__CHEAT_TM_MENU_LABEL_TRANSLATOR_HOOKED__;
    vi.restoreAllMocks(); vi.unstubAllGlobals();
});

function setup() {
    vi.stubGlobal('window', globalThis);
    const runtime = { enabled: true, engine: {}, isTranslationEnabled() { return this.enabled; },
        getCacheKey: (text) => text, translationCache: new Map(), hasUsableCacheValue: () => false,
        trackCacheKeyUsage: vi.fn() };
    const raw = [0, '処女', 'portrait', '未許可'];
    const variables = { value(id) { return runtime.enabled && isVariableDisplayContext() && id === 1 ? 'Virgin' : raw[id]; } };
    vi.stubGlobal('$gameVariables', variables);
    return { runtime, variables, raw };
}

it('protects variable output from script evaluation and leaves escaped tags and expressions intact', () => {
    const source = [{ val: '\\V[1] \\V[3] \\\\V[1] \\<code("\\V[1]")\\>' }];
    const before = JSON.stringify(source);
    const { text, tokens } = prepareCbrVariableText(source, (id) =>
        id === 1 && isVariableDisplayContext() ? '\\<notExecutable\\>' : 'raw');
    expect(text[0].val).toContain('\\<code("\\V[1]")\\>');
    expect(tokens.size).toBe(1);
    expect(restoreCbrVariableText(text[0].val, tokens)).toContain('\\<notExecutable\\> \\V[3]');
    expect(JSON.stringify(source)).toBe(before);
    expect(isVariableDisplayContext()).toBe(false);
});

it('localizes CBR text before measuring while keeping image variables, scripts and source records raw', () => {
    const { runtime, variables, raw } = setup();
    const records = [{ val: 'State: \\V[1] / \\V[3]' }];
    const page = { テキスト: records, 画像: [{ val: '\\V[2]' }] };
    vi.stubGlobal('CBR', { エロステータス() {}, eroStatus: { data: [page], pageNow: 0 } });
    class Status {
        constructor() { this.contents = { measureTextWidth: (text) => { this.measured = text; return text.length; } }; }
        drawText(text) { return text; }
        refresh() {
            this.image = variables.value(2);
            this.condition = variables.value(1) === '処女';
            const text = page.テキスト[0].val.replace(/\\V\[(\d+)\]/g, (_, id) => variables.value(+id));
            this.contents.measureTextWidth(text);
            if (this.fail) throw Error('draw failed');
            return this.drawText(text);
        }
    }
    vi.stubGlobal('Window_EroStatus', Status);
    const translator = new CbrEroStatusTranslator();
    translator.getRuntime = () => runtime;
    translator.tagEngine = runtime.engine;
    translator._scanPrepared = true;
    expect(translator.enablePluginTranslation()).toBe(true);
    const status = new Status();
    for (let i = 0; i < 2; i++) expect(status.refresh()).toBe('State: Virgin / 未許可');
    expect(status.measured).toBe('State: Virgin / 未許可');
    expect(status.image).toBe('portrait'); expect(status.condition).toBe(true);
    expect(page.テキスト).toBe(records); expect(raw[1]).toBe('処女');
    expect(runtime.trackCacheKeyUsage.mock.calls.some(([key]) => String(key).includes('CBR_VALUE'))).toBe(false);
    status.fail = true; expect(() => status.refresh()).toThrow('draw failed');
    expect(page.テキスト).toBe(records); expect(translator.variableTokens).toBeUndefined();
    expect(isVariableDisplayContext()).toBe(false);
    status.fail = false; runtime.enabled = false;
    expect(status.refresh()).toBe('State: 処女 / 未許可');
});

it('localizes TM menu label values on the first open and retains numeric counter behavior', () => {
    const { runtime, variables } = setup();
    const label = { id: 1, name: '', footer: '' };
    class Labels {
        drawMenuLabel(x, y, data, value) { this.drawn = value; }
        refresh() { this.drawMenuLabel(0, 0, label, variables.value(label.id)); }
    }
    class Menu {
        create() { this.createMenuLabelWindow(); }
        createMenuLabelWindow() { this._menuLabelWindow = new Labels(); this._menuLabelWindow.refresh(); }
    }
    vi.stubGlobal('Scene_Menu', Menu);
    const translator = new TMMenuLabelTranslator(); translator.getRuntime = () => runtime;
    expect(translator.enablePluginTranslation()).toBe(true);
    const menu = new Menu(); menu.create();
    expect(menu._menuLabelWindow.drawn).toBe('Virgin');
    expect(variables.value(1)).toBe('処女');
    menu._menuLabelWindow.drawMenuLabel(0, 0, { id: -1 }, 42);
    expect(menu._menuLabelWindow.drawn).toBe(42);
    runtime.enabled = false; menu._menuLabelWindow.refresh();
    expect(menu._menuLabelWindow.drawn).toBe('処女');
    expect(label).toEqual({ id: 1, name: '', footer: '' });
});
