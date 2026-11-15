import { afterEach, expect, it, vi } from 'vitest';
import { HzChoiceEventTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/HzChoiceEventTranslator.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('uses original tagged event names for both list and canvas without changing event data', () => {
    const t = new HzChoiceEventTranslator();
    t.collectMapTexts(
        { id: 50, name: 'Translated map name' },
        {
            events: [
                null,
                { id: 10, name: '自然公園', note: '<hzChoice:land,!C>' },
                { id: 11, name: 'Technical event', note: '' },
            ],
        }
    );
    expect([...t.entries.keys()]).toEqual(['自然公園']);
    const data = { name: 'Existing translation', meta: { hzChoice: 'land,!C' } };
    const event = { _mapId: 50, eventId: () => 10, event: () => data };
    const fill = vi.fn();
    const context = { fillText: fill };
    class WindowBase {
        drawText(text) {
            return text;
        }
    }
    class Window_EventList extends WindowBase {}
    class Interpreter {
        updateWaitMode() {
            context.fillText(data.name, 12, 34);
        }
    }
    vi.stubGlobal('window', {
        Window_Base: WindowBase,
        Game_Interpreter: Interpreter,
        SceneManager: { _scene: { _spriteset: { _hzChoiceScreen: { bitmap: { context } } } } },
    });
    let enabled = true;
    const r = {
        isTranslationEnabled: () => enabled,
        getCacheKey: (text) => text,
        trackCacheKeyUsage: vi.fn(),
        hasUsableCacheValue: () => true,
        translationCache: new Map([['自然公園', 'Nature Park']]),
    };
    vi.spyOn(t, 'getRuntime').mockReturnValue(r);
    vi.spyOn(t, 'precomputeCounts').mockResolvedValue();
    expect(t.enablePluginTranslation()).toBe(true);
    const list = new Window_EventList();
    list._listevents = [event];
    const choice = new Interpreter();
    choice._waitMode = 'hzChoiceEvent';
    choice._hzChoceEvent = { _choiceEvents: [event] };
    expect(list.drawText(data.name)).toBe('Nature Park');
    choice.updateWaitMode();
    choice.updateWaitMode();
    expect(fill).toHaveBeenLastCalledWith('Nature Park', 12, 34);
    expect(context.fillText).toBe(fill);
    expect(data.name).toBe('Existing translation');
    expect(r.trackCacheKeyUsage.mock.calls.every(([key]) => key === '自然公園')).toBe(true);
    enabled = false;
    expect(list.drawText(data.name)).toBe('Existing translation');
    choice.updateWaitMode();
    expect(fill).toHaveBeenLastCalledWith('Existing translation', 12, 34);
});
