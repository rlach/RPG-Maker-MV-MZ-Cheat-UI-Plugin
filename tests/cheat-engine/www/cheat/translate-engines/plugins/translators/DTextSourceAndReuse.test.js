import { afterEach, expect, it, vi } from 'vitest';
import { DTextPictureTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/DTextPictureTranslator.js';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
it('keeps the raw MZ template across command expansion, repeated updates, language toggle and cache edits', () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$plugins', []);
    let value = 7,
        serial = 0,
        enabled = true;
    class Screen {
        setDTextPicture(text, size) {
            this.dTextValue = (size > 0 ? `\\fs[${size}]` : '') + text;
            this.dTextSize = size;
        }
        getDTextPictureInfo() {
            return { value: this.dTextValue, font: 'Dela', size: this.dTextSize };
        }
    }
    class Picture {
        updateDText() {
            this._dTextValue = this.dTextInfo.value.replace(/\\V\[1\]/gi, String(value));
        }
        show(name, scale = 100) {
            this._name = name || String(++serial);
            this._scaleX = scale;
            this._scaleY = scale;
            this.dTextInfo = name ? null : $gameScreen.getDTextPictureInfo();
            if (this.dTextInfo) this.updateDText();
        }
    }
    vi.stubGlobal('Game_Screen', Screen);
    vi.stubGlobal('Game_Picture', Picture);
    vi.stubGlobal('$gameScreen', new Screen());
    vi.stubGlobal('PluginManager', {
        callCommand(self, plugin, command, args) {
            $gameScreen.setDTextPicture(args.text.replace(/\\V\[1\]/gi, String(value)), 20);
        },
    });
    const source = '残り：\\V[1]';
    const r = {
        isTranslationEnabled: () => enabled,
        getCacheKey: (text) => text,
        trackCacheKeyUsage: vi.fn(),
        hasUsableCacheValue: (key) => r.translationCache.has(key),
        translationCache: new Map([[source, 'Remaining: \\V[1]']]),
    };
    const t = new DTextPictureTranslator();
    vi.spyOn(t, 'getRuntime').mockReturnValue(r);
    t.installLegacySetDTextPictureHook();
    t.installMZCommandHook();
    t.installMZRefreshHook();
    t.installMZPictureReuseHook();
    const picture = new Picture();
    const show = () => {
        PluginManager.callCommand({}, 'DTextPicture', 'dText', { text: source });
        picture.show('');
    };
    show();
    const firstName = picture._name;
    expect(picture._dTextValue).toBe('\\fs[20]Remaining: 7');
    for (let i = 0; i < 100; i++) {
        show();
        picture.updateDText();
    }
    expect(picture._name).toBe(firstName);
    expect(picture.dTextInfo.value).toBe('\\fs[20]' + source);
    value = 8;
    show();
    expect(picture._name).not.toBe(firstName);
    expect(picture._dTextValue).toBe('\\fs[20]Remaining: 8');
    r.translationCache.set(source, 'Left: \\V[1]');
    picture.updateDText();
    expect(picture._dTextValue).toBe('\\fs[20]Left: 8');
    enabled = false;
    picture.updateDText();
    expect(picture._dTextValue).toBe('\\fs[20]残り：8');
    expect(r.trackCacheKeyUsage.mock.calls.every(([key]) => key === source)).toBe(true);
    const previousName = picture._name;
    picture.show('', 120);
    expect(picture._name).not.toBe(previousName);
});
it('does not persist translated originalValue during MV real-time refresh', () => {
    vi.stubGlobal('window', globalThis);
    class Picture {
        updateDTextVariable() {
            this.rendered = this.dTextInfo.originalValue;
        }
    }
    vi.stubGlobal('Game_Picture', Picture);
    const t = new DTextPictureTranslator();
    const r = {
        isTranslationEnabled: () => true,
        getCacheKey: (text) => text,
        trackCacheKeyUsage: vi.fn(),
        hasUsableCacheValue: (key) => key === '原文',
        translationCache: new Map([['原文', 'Translation']]),
    };
    vi.spyOn(t, 'getRuntime').mockReturnValue(r);
    t.installDTextRealTimeRefreshHook();
    const picture = new Picture();
    picture.dTextInfo = { originalValue: '原文' };
    picture.updateDTextVariable();
    picture.updateDTextVariable();
    expect(picture.rendered).toBe('Translation');
    expect(picture.dTextInfo.originalValue).toBe('原文');
    expect(r.trackCacheKeyUsage.mock.calls.map(([key]) => key)).toEqual(['原文', '原文']);
});
