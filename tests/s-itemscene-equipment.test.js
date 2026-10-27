import { afterEach, expect, it, vi } from 'vitest';
import { SItemsceneKzTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/SItemsceneKzTranslator.js';

afterEach(() => vi.unstubAllGlobals());
it.each(['item', 'weapon', 'armor'])(
    'uses the %s note cache in the custom detail window',
    (kind) => {
        vi.stubGlobal('window', globalThis);
        const note = '<ill:carrot>\n<br:日本語の説明>';
        const item = {
            id: 1,
            note,
            _translateOriginal: { note },
            meta: { br: '日本語の説明', ill: 'carrot' },
        };
        class SceneItem {
            update() {}
        }
        vi.stubGlobal('Scene_Item', SceneItem);
        vi.stubGlobal('$dataWeapons', kind === 'weapon' ? [null, item] : []);
        vi.stubGlobal('$dataArmors', kind === 'armor' ? [null, item] : []);
        const seen = [];
        const runtime = {
            getCacheKey: (value, type) => type,
            trackCacheKeyUsage: (key) => seen.push(key),
        };
        const translator = new SItemsceneKzTranslator();
        translator.getRuntime = () => runtime;
        translator.registerPluginCustomTags = vi.fn();
        translator.isRuntimeTranslationActive = () => true;
        translator.resolveRuntimeTranslation = (value, runtime, type) =>
            type === `${kind}_note` ? '<ill:carrot>\n<br:Translated detail>' : value;
        expect(translator.enablePluginTranslation()).toBe(true);
        const scene = new SceneItem();
        scene.item = () => item;
        scene._InfoWindow = { setText: vi.fn() };
        scene.update();
        expect(seen).toEqual([`${kind}_note`]);
        expect(scene._InfoWindow.setText).toHaveBeenCalledWith('Translated detail', 'carrot');
        expect(item.note).toBe(note);
    }
);
