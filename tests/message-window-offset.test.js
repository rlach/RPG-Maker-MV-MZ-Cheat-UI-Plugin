import { afterEach, it, expect, vi } from 'vitest';
import { MessageWindowOffsetTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/MessageWindowOffsetTranslator.js';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
it('translates custom name-box measurement and drawing while restoring original identity', () => {
    class NameBox {
        constructor() {
            this._name = '店員';
        }
        refresh() {
            this.width = this._name.length * 12;
            this.drawn = this._name;
            return this.width;
        }
    }
    vi.stubGlobal('window', { Window_NameBox: NameBox });
    const t = new MessageWindowOffsetTranslator();
    const runtime = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        getCacheKey: (text, type) => `${type === 'speaker' ? 'actor_name' : type}:${text}`,
        translationCache: new Map([['actor_name:店員', 'Clerk']]),
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    vi.spyOn(t, 'getRuntime').mockReturnValue(runtime);
    expect(t.enablePluginTranslation()).toBe(true);
    const box = new NameBox();
    for (let i = 0; i < 3; i++) {
        expect(box.refresh()).toBe(60);
        expect(box.drawn).toBe('Clerk');
        expect(box._name).toBe('店員');
    }
    box._name = 'Clerk';
    box.refresh();
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledTimes(3);
    box._name = '店員';
    runtime.enabled = false;
    expect(box.refresh()).toBe(24);
    expect(box.drawn).toBe('店員');
});
it('restores the name even if native custom refresh throws', () => {
    class NameBox {
        refresh() {
            throw Error('native failure');
        }
    }
    vi.stubGlobal('window', { Window_NameBox: NameBox });
    const t = new MessageWindowOffsetTranslator();
    const runtime = {
        isTranslationEnabled: () => true,
        getCacheKey: () => 'key',
        hasUsableCacheValue: () => true,
    };
    vi.spyOn(t, 'getRuntime').mockReturnValue(runtime);
    vi.spyOn(t, 'resolveRuntimeTranslation').mockReturnValue('Clerk');
    t.enablePluginTranslation();
    const box = new NameBox();
    box._name = '店員';
    expect(() => box.refresh()).toThrow('native failure');
    expect(box._name).toBe('店員');
});

it('survives game plugins replacing refresh after translator initialization', () => {
    class NameBox {
        constructor() {
            this._name = '店員';
        }
        refresh() {}
        start() {
            this.refresh();
        }
        drawTextEx(text) {
            this.drawn = text;
            return text.length * 12;
        }
    }
    vi.stubGlobal('window', { Window_NameBox: NameBox });
    const translator = new MessageWindowOffsetTranslator();
    const runtime = {
        isTranslationEnabled: () => true,
        getCacheKey: (text) => 'actor_name:' + text,
        hasUsableCacheValue: (key) => key === 'actor_name:店員',
        translationCache: new Map([['actor_name:店員', 'Clerk']]),
        trackCacheKeyUsage: vi.fn(),
    };
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    translator.enablePluginTranslation();
    // Same bootstrap order as main.js: cheat first, then PluginManager.setup.
    NameBox.prototype.refresh = function () {
        this.measured = this._name;
        this.width = this._name.length * 12;
        this.drawTextEx(this._name);
    };
    const box = new NameBox();
    box.start();
    expect(box.measured).toBe('Clerk');
    expect(box.drawn).toBe('Clerk');
    expect(box.width).toBe(60);
    expect(box._name).toBe('店員');
    box.refresh();
    expect(box.drawn).toBe('Clerk');
    expect(runtime.trackCacheKeyUsage.mock.calls.every(([key]) => key === 'actor_name:店員')).toBe(
        true
    );
});
