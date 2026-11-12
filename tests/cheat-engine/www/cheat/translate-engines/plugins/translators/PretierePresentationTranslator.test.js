import { afterEach, expect, it, vi } from 'vitest';
import { PretierePresentationTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/PretierePresentationTranslator.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('resolves both form names without changing saved identity and respects translation OFF', () => {
    vi.stubGlobal('window', globalThis);
    class Actor { name() { return this._name; } }
    class Log { addText(text) { return text; } }
    vi.stubGlobal('Game_Actor', Actor);
    vi.stubGlobal('Window_BattleLog', Log);
    let enabled = true;
    const values = new Map([['actor_name:ひなた', 'Hinata'], ['actor_name:プリティエール', 'Pretiere']]);
    const runtime = { isTranslationEnabled: () => enabled, getCacheKey: (s,t) => `${t}:${s}`, trackCacheKeyUsage() {}, hasUsableCacheValue: k => values.has(k), translationCache: values };
    const translator = new PretierePresentationTranslator();
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    expect(translator.enablePluginTranslation()).toBe(true);
    const actor = new Actor(); actor._actorId = 1;
    for (const [source, target] of [['ひなた','Hinata'], ['プリティエール','Pretiere'], ['ひなた','Hinata']]) {
        actor._name = source;
        expect(actor.name()).toBe(target);
        expect(actor._name).toBe(source);
    }
    enabled = false;
    expect(actor.name()).toBe('ひなた');
});

it('collects troop introduction scripts and resolves the same runtime key', async () => {
    vi.stubGlobal('window', globalThis);
    const text = '\\C[24]―― 一つ目の巨大な宇宙スライム ――\\C[0]';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok:true, json:async () => [null, { pages:[{list:[{code:355,parameters:[`BattleManager._logWindow.addText(${JSON.stringify(text)});`]}]}] }] }));
    const translator = new PretierePresentationTranslator();
    await translator.precomputeCounts();
    expect([...translator.entries.keys()]).toContain(text);
});
