import { afterEach, expect, it, vi } from 'vitest';
import { AutoNamePopupTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/AutoNamePopupTranslator.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function setup(mode = '0') {
    const table = { name: 'Original name', optionString: '\\C[3]', expressions: 8 };
    class System {
        getNameKeyParam(key, prop) {
            return table[prop];
        }
    }
    vi.stubGlobal('Utils', { RPGMAKER_NAME: 'MZ' });
    vi.stubGlobal('window', {
        Game_System: System,
        $plugins: [
            {
                name: 'AutoNamePopup',
                status: true,
                parameters: { mode, template: '\\>\\c[14]%1\\c[0]' },
            },
        ],
    });
    const translator = new AutoNamePopupTranslator();
    let enabled = true;
    const runtime = {
        isTranslationEnabled: () => enabled,
        getCacheKey: (text, type) => `${type}:${text}`,
        translationCache: new Map([['actor_name:Original name', 'Translated name']]),
        hasUsableCacheValue: (key) => runtime.translationCache.has(key),
        trackCacheKeyUsage: vi.fn(),
    };
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    expect(translator.enablePluginTranslation()).toBe(true);
    return {
        system: new System(),
        translator,
        runtime,
        table,
        setEnabled: (value) => {
            enabled = value;
        },
    };
}

it('uses the actor-name cache before popup formatting without modifying face mappings', () => {
    const { system, translator, runtime, table, setEnabled } = setup();
    const key = ['HeroFace', 0];
    const display = translator._formatTemplate(
        translator._resolveRuntimeConfig().template,
        system.getNameKeyParam(key, 'name')
    );
    expect(display).toBe('\\>\\c[14]Translated name\\c[0]');
    expect(table.name).toBe('Original name');
    expect(system.getNameKeyParam(key, 'optionString')).toBe('\\C[3]');
    expect(system.getNameKeyParam(key, 'expressions')).toBe(8);
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledTimes(1);
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith(
        'actor_name:Original name',
        expect.anything()
    );
    setEnabled(false);
    expect(system.getNameKeyParam(key, 'name')).toBe('Original name');
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledTimes(1);
    setEnabled(true);
    runtime.translationCache.clear();
    expect(system.getNameKeyParam(key, 'name')).toBe('Original name');
});

it('preserves inline message prefixes so collection and runtime keys still match', () => {
    const { system, runtime } = setup('1');
    expect(system.getNameKeyParam(['HeroFace', 0], 'name')).toBe('Original name');
    expect(runtime.trackCacheKeyUsage).not.toHaveBeenCalled();
});

it('waits for the AutoNamePopup runtime API', () => {
    vi.stubGlobal('window', {});
    expect(new AutoNamePopupTranslator().enablePluginTranslation()).toBe(false);
});
