import { afterEach, expect, it, vi } from 'vitest';
import { FtkrCssDetailedStatusTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/FtkrCssDetailedStatusTranslator.js';
import { FtkrCustomSimpleActorStatusTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/FtkrCustomSimpleActorStatusTranslator.js';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
it.each([true, false])(
    'keeps translated FTKR labels out of source keys with either hook order (detailed first=%s)',
    async (detailedFirst) => {
        const source = '\\c[27]Ｍ度';
        const translated = '\\C[27]M-Degree';
        const layout = { statusList: [{ text: 'text(%1)', value: source }] };
        class BaseWindow {
            drawCssActorStatusBase() {
                return this.drawTextEx(globalThis.FTKR.CSS.DS.detailedStatus.statusList[0].value);
            }
            drawTextEx(text) {
                return this.drawText(text);
            }
            drawText(text) {
                return text;
            }
            drawCssActorCustom(actor, x, y, width, custom) {
                return this.drawTextEx(custom.name);
            }
            drawCssActorGauge(actor, x, y, width, gauge) {
                return this.drawTextEx(gauge.name);
            }
            drawCssActorMessage() {}
        }
        class Status extends BaseWindow {
            refresh() {
                return this.drawCssActorStatusBase();
            }
        }
        vi.stubGlobal('window', globalThis);
        vi.stubGlobal('Window_Base', BaseWindow);
        vi.stubGlobal('Window_Status', Status);
        vi.stubGlobal('FTKR', { CSS: { DS: { detailedStatus: layout }, cssStatus: {} } });
        const detailed = new FtkrCssDetailedStatusTranslator();
        const simple = new FtkrCustomSimpleActorStatusTranslator();
        const runtime = {
            isTranslationEnabled: () => true,
            getCacheKey: (text, type) => type + ':' + text,
            translationCache: new Map([['plugin_ftkr_css_detailed_status:' + source, translated]]),
            hasUsableCacheValue(key) {
                return this.translationCache.has(key);
            },
            trackCacheKeyUsage: vi.fn(),
        };
        for (const t of [detailed, simple]) {
            vi.spyOn(t, 'getRuntime').mockReturnValue(runtime);
            vi.spyOn(t, 'registerPluginCustomTags').mockImplementation(() => {});
        }
        for (const t of detailedFirst ? [detailed, simple] : [simple, detailed])
            expect(t.enablePluginTranslation()).toBe(true);
        expect(new Status().refresh()).toBe(translated);
        expect(globalThis.FTKR.CSS.DS.detailedStatus).toBe(layout);
        expect(layout.statusList[0].value).toBe(source);
        const observed = runtime.trackCacheKeyUsage.mock.calls.map(([key]) => key);
        expect(observed.some((key) => key.endsWith(translated))).toBe(false);
        expect(observed).toContain('plugin_ftkr_css_detailed_status:' + source);
        const entries = [];
        detailed.collectRuntimeDetailedStatusEntries(entries);
        expect(entries.map((entry) => entry.text)).toEqual([source]);
    }
);
