import { afterEach, expect, it, vi } from 'vitest';
import { MogSceneMenuTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/MogSceneMenuTranslator.js';

afterEach(() => vi.unstubAllGlobals());

it('translates only the location bitmap and preserves map identity and original drawing', () => {
    vi.stubGlobal('window', globalThis);
    class Bitmap {
        drawText(text) {
            this.text = text;
        }
    }
    const map = { displayName: () => 'ノイマン邸 ２号室' };
    class SceneMenu {
        loadBitmapsMain() {}
        createLocation() {
            this._location = { bitmap: new Bitmap() };
            this._location.bitmap.drawText(map.displayName());
            this.other = new Bitmap();
            this.other.drawText(map.displayName());
        }
    }
    vi.stubGlobal('Bitmap', Bitmap);
    vi.stubGlobal('Scene_Menu', SceneMenu);
    const translator = new MogSceneMenuTranslator();
    const runtime = {
        enabled: true,
        isTranslationEnabled: () => true,
        getCacheKey: (text, type) => `${type}:${text}`,
        trackCacheKeyUsage: vi.fn(),
        hasUsableCacheValue: () => true,
        translationCache: new Map([['map_name:ノイマン邸 ２号室', 'Neumann Mansion, Room 2']]),
    };
    translator.getRuntime = () => runtime;
    const draw = Bitmap.prototype.drawText;
    expect(translator.enablePluginTranslation()).toBe(true);
    const scene = new SceneMenu();
    scene.createLocation();
    expect(scene._location.bitmap.text).toBe('Neumann Mansion, Room 2');
    expect(scene.other.text).toBe('ノイマン邸 ２号室');
    expect(map.displayName()).toBe('ノイマン邸 ２号室');
    expect(Bitmap.prototype.drawText).toBe(draw);
    runtime.enabled = false;
    runtime.isTranslationEnabled = () => false;
    scene.createLocation();
    expect(scene._location.bitmap.text).toBe(map.displayName());
});
