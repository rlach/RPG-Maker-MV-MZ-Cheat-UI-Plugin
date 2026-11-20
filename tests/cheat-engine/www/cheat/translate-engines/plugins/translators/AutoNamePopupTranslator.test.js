import { afterEach, expect, it, vi } from 'vitest';
import { AutoNamePopupTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/AutoNamePopupTranslator.js';
import { collectEventCommandEntries } from '../../../../../../../cheat-engine/www/cheat/js/EventCommandTraversal.js';

it('harvests both switch-controlled popup and inline message keys without changing events', () => {
    const { translator } = setup('1');
    window.$plugins[0].parameters.switchId = '53';
    window.$plugins[0].parameters.startNewLine = 'true';
    const body = '\n\n\\ac\\C[6]からだがぁ…♡　あついぃ……♡♡';
    const list = [
        { code: 101, parameters: ['', 0, 2, 2, '\\C[6]\\N[2]'] },
        ...body.split('\n').map((line) => ({ code: 401, parameters: [line] })),
    ];
    const before = JSON.stringify(list);
    const entries = collectEventCommandEntries(list, {
        traversalExtensions: [translator.getEventCommandTraversalExtension()],
        transformEntry: (entry) => ({
            ...entry,
            value:
                translator.resolveMessageCacheSourceText({
                    text: entry.value,
                    command: entry.command,
                    entry,
                    mode: entry.type === 'message' ? 'collection' : 'runtime',
                }) ?? entry.value,
        }),
    });
    expect(entries.filter((e) => e.type === 'message').map((e) => e.value)).toEqual([
        body,
        '\\>\\c[14]\\C[6]\\N[2]\\c[0]\n' + body,
    ]);
    expect(entries.find((e) => e.type === 'speaker').value).toBe('\\C[6]\\N[2]');
    expect(JSON.stringify(list)).toBe(before);
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('deduplicates suppressed-name variants and keeps the native startup template', () => {
    const { translator } = setup('0');
    window.$plugins[0].parameters.switchId = '53';
    window.$plugins[0].parameters.startNewLine = 'true';
    expect(translator._buildCollectionPrefix({ parameters: ['', 0, 0, 0, 'Name'] }, 1)).toBe(
        '\\>\\c[14]Name\\c[0]'
    );
    const list = [
        { code: 101, parameters: ['', 0, 0, 0, 'Name'] },
        { code: 401, parameters: ['_Hidden speaker'] },
    ];
    const entries = collectEventCommandEntries(list, {
        traversalExtensions: [translator.getEventCommandTraversalExtension()],
    });
    expect(entries.map((entry) => [entry.type, entry.value])).toEqual([
        ['message', 'Hidden speaker'],
    ]);
    delete window.$plugins[0].parameters.switchId;
    expect(translator.getEventCommandTraversalExtension()).toBeNull();
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
