import { afterEach, expect, it, vi } from 'vitest';
import { LlMenuScreenStatusMvTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/LlMenuScreenStatusMvTranslator.js';
import { SourceTextCatalogTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/SourceTextCatalogTranslator.js';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('collects changing event profiles, nicknames and literal variable descriptions', () => {
    vi.spyOn(SourceTextCatalogTranslator.prototype, 'collectCommandTexts').mockImplementation(() => {});
    const translator = new LlMenuScreenStatusMvTranslator();
    translator.collectCommandTexts([
        {code:324, parameters:[2,'爆乳剣道部']},
        {code:325, parameters:[2,'元の世界に戻るために頑張る！']},
        {code:122, parameters:[10,10,0,4,'"好きなタイプ"']},
        {code:122, parameters:[10,10,0,4,'throw new Error()']},
    ]);
    expect([...translator.entries.keys()]).toEqual(['爆乳剣道部','元の世界に戻るために頑張る！','好きなタイプ']);
});
it('resolves new values after repeated stat changes and leaves source/save data intact', () => {
    vi.stubGlobal('window', globalThis);
    class Actor { profile() { return this._profile; } nickname() { return this._nickname; } }
    vi.stubGlobal('Game_Actor', Actor);
    vi.spyOn(SourceTextCatalogTranslator.prototype, 'enablePluginTranslation').mockReturnValue(true);
    let enabled = true;
    const cache = new Map([['actor_profile:初期','Initial'],['plugin_ll_menu_screen_status_mv:変更','Changed'],['plugin_ll_menu_screen_status_mv:新称号','New title']]);
    const runtime = {isTranslationEnabled:()=>enabled,getCacheKey:(s,t)=>`${t}:${s}`,trackCacheKeyUsage(){},hasUsableCacheValue:k=>cache.has(k),translationCache:cache};
    const translator = new LlMenuScreenStatusMvTranslator();
    vi.spyOn(translator,'getRuntime').mockReturnValue(runtime);
    expect(translator.enablePluginTranslation()).toBe(true);
    const actor = new Actor(); actor._profile='初期'; actor._nickname='新称号';
    expect(actor.profile()).toBe('Initial');
    actor._profile='変更'; expect(actor.profile()).toBe('Changed');
    expect(actor.nickname()).toBe('New title');
    expect(actor._nickname).toBe('新称号');
    enabled=false; expect(actor.profile()).toBe('変更'); expect(actor.nickname()).toBe('新称号');
});
