import { it, expect, vi, afterEach } from 'vitest';
import { TMStatusMenuExTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/TMStatusMenuExTranslator.js';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
it.each([
    [],
    [{ name: 'SaveMaxNum', status: true }],
    [{ name: 'TMStatusMenuEx', status: false }],
    [{ name: 'folder/Av_TMStatusMenuEx', status: false }],
])('ignores stale imported flags and parameters without an enabled plugin: %j', (plugins) => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$plugins', plugins);
    vi.stubGlobal('Imported', { TMStatusMenuEx: true });
    vi.stubGlobal('PluginManager', { parameters: () => ({ xparamText: 'Hit,Evasion' }) });
    const translator = new TMStatusMenuExTranslator();
    const enable = vi.spyOn(translator, 'enablePluginTranslation');
    expect(translator.ensureDetection()).toBe(false);
    expect(enable).not.toHaveBeenCalled();
});
it.each(['TMStatusMenuEx', 'folder/Av_TMStatusMenuEx'])(
    'still scans and renders the enabled plugin: %s',
    async (name) => {
        vi.stubGlobal('window', globalThis);
        vi.stubGlobal('$plugins', [
            {
                name,
                status: true,
                parameters: { xparamText: 'Accuracy,Evasion', sparamText: 'Target rate' },
            },
        ]);
        vi.stubGlobal('PluginManager', { parameters: () => ({}) });
        class Status {
            drawText(text) {
                return text;
            }
            drawXparams() {
                this.label = this.drawText('Accuracy');
            }
        }
        vi.stubGlobal('Window_Status', Status);
        const rt = {
            enabled: true,
            isTranslationEnabled() {
                return this.enabled;
            },
            getCacheKey: (text, type) => type + ':' + text,
            translationCache: new Map([['plugin_tm_status_menu_ex:Accuracy', 'Hit rate']]),
            hasUsableCacheValue(key) {
                return this.translationCache.has(key);
            },
            trackCacheKeyUsage: vi.fn(),
        };
        const translator = new TMStatusMenuExTranslator();
        vi.spyOn(translator, 'getRuntime').mockReturnValue(rt);
        expect(translator.detectPlugin()).toBe(true);
        await translator.precomputeCounts();
        expect(translator.collectUntranslated({ runtime: rt }).map((x) => x.value)).toEqual([
            'Evasion',
            'Target rate',
        ]);
        expect(translator.enablePluginTranslation()).toBe(true);
        const view = new Status();
        view.drawXparams();
        expect(view.label).toBe('Hit rate');
        rt.enabled = false;
        view.drawXparams();
        expect(view.label).toBe('Accuracy');
    }
);
