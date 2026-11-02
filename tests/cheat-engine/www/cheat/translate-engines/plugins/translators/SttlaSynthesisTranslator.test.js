import { afterEach, expect, it, vi } from 'vitest';
import { SttlaSynthesisTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/SttlaSynthesisTranslator.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('collects configured synthesis columns and TsL menu labels and renders cached translations', async () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$plugins', [
        {
            name: 'STTLA_Synthesis',
            status: true,
            parameters: {
                'Need Amount': '必要数',
                'Owned Amount': '所持数',
                'Product Amount': '商品数',
                Gold: '0',
            },
        },
        { name: 'TsL_Menu', status: true, parameters: { 好感度: '好感度' } },
    ]);
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
            ok: true,
            text: async () => 'function draw(){this.drawText("必要な素材",0,0);}',
        }))
    );
    const runtime = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        engine: { addPluginTags: vi.fn() },
        translationCache: new Map(),
        getCacheKey: (text, type) => `${type}:${text}`,
        hasUsableCacheValue(key) {
            return !!this.translationCache.get(key);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    const translator = new SttlaSynthesisTranslator();
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    await translator.precomputeCounts();
    const values = translator.collectUntranslated({ runtime }).map((item) => item.value);
    expect(values).toEqual(expect.arrayContaining(['必要数', '所持数', '商品数', '好感度']));
    expect(values).not.toContain('0');
    runtime.translationCache.set('plugin_sttla_synthesis:必要数', 'Required');
    expect(translator.resolveText('必要数', runtime)).toBe('Required');
    runtime.enabled = false;
    expect(translator.resolveText('必要数', runtime)).toBe('必要数');
});
