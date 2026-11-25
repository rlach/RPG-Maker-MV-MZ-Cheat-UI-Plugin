vi.mock(
    '../../../../../../../cheat-engine/www/cheat/js/translation-runtime/ObjectTranslationModalMethods.js',
    () => ({ loadMapDataById: vi.fn() })
);
import { afterEach, expect, it, vi } from 'vitest';
import { TextResourceTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/TextResourceTranslator.js';
import { AdvExtentionTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/AdvExtentionTranslator.js';
import { SakuraShowChapterTitleTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/SakuraShowChapterTitleTranslator.js';
import { MapNameExtendTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/MapNameExtendTranslator.js';
import { withOriginalTextResource } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/TextResourceTranslationContext.js';
import { countEventCommandEntries } from '../../../../../../../cheat-engine/www/cheat/js/EventCommandTraversal.js';
import { MapEvents } from '../../../../../../../cheat-engine/www/cheat/translate-engines/translation-phases/MapEvents.js';
import { CommonEvents } from '../../../../../../../cheat-engine/www/cheat/translate-engines/translation-phases/CommonEvents.js';
import { PLUGIN_TRANSLATOR_REGISTRY } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/PluginTranslatorRegistry.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

const makeRuntime = () => {
    const runtime = {
        isTranslationEnabled: () => true,
        getCacheKey: (text, type) => `${type === 'speaker' ? 'actor_name' : type}:${text}`,
        trackCacheKeyUsage: vi.fn(),
        translationCache: new Map(),
        hasUsableCacheValue: (key) => runtime.translationCache.has(key),
    };
    return runtime;
};

it('waits for resource loading and catalogs complete fallback values without metadata or duplicate line fragments', async () => {
    let onLoaded;
    const resource = {
        addOnLoadedListener: (listener) => {
            onLoaded = listener;
        },
        textLabels: {
            baseLanguage: 'ja-JP',
            language: 'en-US',
            resources: {
                'ja-JP': {
                    title: 'Original title',
                    warning: 'First line\nSecond line',
                    metadata: { language: 'ja-JP' },
                },
                'en-US': { title: 'Local title' },
            },
        },
    };
    vi.stubGlobal('window', { TextResource: resource });
    const translator = new TextResourceTranslator();
    const pending = translator.precomputeCounts();
    expect(translator.entries.size).toBe(0);
    onLoaded();
    await pending;
    expect([...translator.entries.keys()]).toEqual(['Local title', 'First line\nSecond line']);
    expect(translator.getCacheType()).toBe('message');
});

it('translates resource UI before custom wrapping while keeping dialogue lookups original', () => {
    const resource = { addOnLoadedListener() {}, getText: () => 'Original notification' };
    vi.stubGlobal('window', { TextResource: resource });
    const translator = new TextResourceTranslator();
    const runtime = makeRuntime();
    runtime.translationCache.set('message:Original notification', 'Translated notification');
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    expect(translator.enablePluginTranslation()).toBe(true);
    expect(resource.getText('notice')).toBe('Translated notification');
    expect(withOriginalTextResource(() => resource.getText('notice'))).toBe(
        'Original notification'
    );
    expect(() =>
        withOriginalTextResource(() => {
            throw new Error('test');
        })
    ).toThrow('test');
    expect(resource.getText('notice')).toBe('Translated notification');
    runtime.isTranslationEnabled = () => false;
    expect(resource.getText('notice')).toBe('Original notification');
});

it('scans ADV resource and inline messages with speakers, preserving character identifiers', () => {
    vi.stubGlobal('window', {
        TextResource: {
            getText: () => 'Resource dialogue',
            hasResource: () => true,
            hasResourceInLocal: () => false,
        },
        $dataActors: [null, { name: 'Hero' }],
        $plugins: [],
    });
    const translator = new AdvExtentionTranslator();
    const extension = translator.getEventCommandTraversalExtension();
    const pushEntry = vi.fn();
    const args = { actor: '1', name: 'sprite-key', label: 'dialogue-id', altName: 'Guard' };
    const command = { code: 357, parameters: ['AdvExtention', 'message', '', args] };
    expect(extension.collectEntriesAt({ command, index: 5, pushEntry })).toEqual({
        handled: true,
        nextIndex: 6,
    });
    expect(pushEntry.mock.calls.map(([entry]) => [entry.type, entry.value])).toEqual([
        ['speaker', 'Guard'],
        ['message', 'Resource dialogue'],
    ]);
    args.label = '';
    args.text = 'Inline dialogue';
    args.altName = '';
    pushEntry.mockClear();
    extension.collectEntriesAt({ command, index: 5, pushEntry });
    expect(pushEntry.mock.calls.map(([entry]) => entry.value)).toEqual(['Hero', 'Inline dialogue']);
    expect(args.name).toBe('sprite-key');
});

it('discovers the private ADV window and translates only its speaker display', () => {
    class MessageWindow {
        updateSpeakerName() {
            return window.$gameMessage._speakerName;
        }
    }
    class Scene {
        createMessageWindow() {
            this._messageWindow = new MessageWindow();
        }
    }
    const command = vi.fn();
    vi.stubGlobal('window', {
        Scene_Message: Scene,
        PluginManager: { _commands: { 'AdvExtention:message': command } },
        $gameMessage: { _speakerName: 'Guard' },
    });
    const translator = new AdvExtentionTranslator();
    const runtime = makeRuntime();
    runtime.translationCache.set('actor_name:Guard', 'Straznik');
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    expect(translator.enablePluginTranslation()).toBe(true);
    const scene = new Scene();
    scene.createMessageWindow();
    expect(scene._messageWindow.updateSpeakerName()).toBe('Straznik');
    expect(window.$gameMessage._speakerName).toBe('Guard');
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith('actor_name:Guard', expect.anything());
    runtime.isTranslationEnabled = () => false;
    expect(scene._messageWindow.updateSpeakerName()).toBe('Guard');
});

it('catalogs and translates chapter lines without changing fonts, timing or picture names', () => {
    const original = vi.fn((args) => args);
    vi.stubGlobal('window', {
        PluginManager: { _commands: { 'Sakura_ShowChapterTitle:showChapterTitle': original } },
    });
    const translator = new SakuraShowChapterTitleTranslator();
    const runtime = makeRuntime();
    runtime.translationCache.set(
        'plugin_sakura_show_chapter_title:Quest started',
        'Rozpoczeto zadanie'
    );
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    const args = {
        lines: JSON.stringify([
            JSON.stringify({ text: 'Quest started', fontSize: '32', fontFace: 'Custom' }),
        ]),
        duration: '240',
        picture: 'backdrop',
    };
    translator.collectCommandTexts([
        { code: 357, parameters: ['Sakura_ShowChapterTitle', 'showChapterTitle', '', args] },
    ]);
    expect([...translator.entries.keys()]).toEqual(['Quest started']);
    expect(translator.enablePluginTranslation()).toBe(true);
    const output = window.PluginManager._commands['Sakura_ShowChapterTitle:showChapterTitle'](args);
    expect(JSON.parse(JSON.parse(output.lines)[0])).toEqual({
        text: 'Rozpoczeto zadanie',
        fontSize: '32',
        fontFace: 'Custom',
    });
    expect(output.duration).toBe('240');
    expect(output.picture).toBe('backdrop');
    expect(args.lines).toContain('Quest started');
});

it('translates the formatted map name before sizing without mutating map data', () => {
    class MapWindow {
        textSizeEx(text) {
            return text;
        }
        drawTextEx(text) {
            return text;
        }
    }
    vi.stubGlobal('window', {
        Window_MapName: MapWindow,
        $gameMap: { displayName: () => 'Upper prison' },
    });
    const translator = new MapNameExtendTranslator();
    const runtime = makeRuntime();
    runtime.translationCache.set('map_name:Upper prison', 'Gorne wiezienie');
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    expect(translator.enablePluginTranslation()).toBe(true);
    const display = new MapWindow();
    expect(display.textSizeEx('\\C[1]Upper prison')).toBe('\\C[1]Gorne wiezienie');
    expect(display.drawTextEx('\\C[1]Upper prison')).toBe('\\C[1]Gorne wiezienie');
    expect(window.$gameMap.displayName()).toBe('Upper prison');
});

it('skips absent source labels without invoking the game debug error path', () => {
    const getText = vi.fn(() => {
        throw new Error('Unknown label');
    });
    vi.stubGlobal('window', {
        TextResource: { getText, hasResource: () => false, hasResourceInLocal: () => false },
        $plugins: [],
    });
    const translator = new AdvExtentionTranslator();
    const command = {
        code: 357,
        parameters: ['AdvExtention', 'message', '', { label: 'missing-label' }],
    };
    const pushEntry = vi.fn();
    expect(
        translator
            .getEventCommandTraversalExtension()
            .collectEntriesAt({ command, index: 0, pushEntry })
    ).toEqual({ handled: true, nextIndex: 1 });
    expect(pushEntry).not.toHaveBeenCalled();
    expect(getText).not.toHaveBeenCalled();
});

it('counts and collects ADV speakers and messages through the actual mass translation phases', async () => {
    vi.stubGlobal('window', {
        $plugins: [],
        TextResource: {
            getText: () => 'Label dialogue',
            hasResource: () => true,
            hasResourceInLocal: () => false,
        },
    });
    const translator = new AdvExtentionTranslator();
    const extension = translator.getEventCommandTraversalExtension();
    vi.spyOn(PLUGIN_TRANSLATOR_REGISTRY, 'buildEventCommandTraversalOptions').mockReturnValue({
        traversalExtensions: [extension],
    });
    vi.spyOn(PLUGIN_TRANSLATOR_REGISTRY, 'getDetectedTranslatorInstances').mockReturnValue([]);
    vi.spyOn(PLUGIN_TRANSLATOR_REGISTRY, 'resolveMessageCacheSourceText').mockImplementation(
        ({ text }) => text
    );
    const list = [
        {
            code: 357,
            parameters: [
                'AdvExtention',
                'message',
                '',
                { actor: '0', name: 'Guard', label: '', text: 'Inline guard dialogue' },
            ],
        },
        {
            code: 357,
            parameters: [
                'AdvExtention',
                'message',
                '',
                { actor: '0', name: '', altName: 'Tutorial', label: 'label-id' },
            ],
        },
    ];
    const runtime = makeRuntime();
    expect(
        countEventCommandEntries(list, {
            traversalExtensions: [extension],
            isUntranslated: () => true,
        })
    ).toEqual({ totalStrings: 4, leftStrings: 4 });
    const maps = new MapEvents({ events: [{ pages: [{ list }] }] });
    expect(MapEvents.countMapEventStatsForData(runtime, maps.mapData).leftStrings).toBe(4);
    const pending = maps.collectUntranslated({ runtime });
    expect(pending.map((item) => item.cacheKey)).toEqual([
        'actor_name:Guard',
        'message:Inline guard dialogue',
        'actor_name:Tutorial',
        'message:Label dialogue',
    ]);
    vi.stubGlobal('window', { ...window, $dataCommonEvents: [null, { list }] });
    vi.stubGlobal('fetch', async () => ({
        ok: true,
        text: async () => JSON.stringify([null, { list }]),
    }));
    const commons = new CommonEvents();
    expect(commons.countAmountSync({ runtime }).leftStrings).toBe(4);
    const [{ strategy }] = await commons.createEntries();
    expect(strategy.collectUntranslated({ runtime }).map((item) => item.cacheKey)).toEqual(
        pending.map((item) => item.cacheKey)
    );
    for (const item of pending) runtime.translationCache.set(item.cacheKey, 'Translated');
    expect(commons.countAmountSync({ runtime }).leftStrings).toBe(0);
    expect(strategy.collectUntranslated({ runtime })).toEqual([]);
});
