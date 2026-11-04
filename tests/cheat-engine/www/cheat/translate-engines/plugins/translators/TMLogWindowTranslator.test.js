import { afterEach, expect, it, vi } from 'vitest';
import { TMLogWindowTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/TMLogWindowTranslator.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('scans MV addLog and script entries without duplicating regular messages', () => {
    const translator = new TMLogWindowTranslator();
    const output = [];
    translator.collectEntriesFromList(
        [
            { code: 101, parameters: [] },
            { code: 401, parameters: ['会話'] },
            { code: 356, parameters: ['addLog 会話'] },
            { code: 356, parameters: ['addLog 追加情報'] },
            { code: 355, parameters: ['$gameSystem.addLog("スクリプト");'] },
        ],
        {},
        output
    );
    translator._scanEntries = output;
    const runtime = { getCacheKey: (text, type) => `${type}:${text}` };
    expect(translator.buildUniquePendingItems(runtime).map((item) => item.value)).toEqual([
        '追加情報',
        'スクリプト',
    ]);
});

it('renders mirrored messages through their standard whole-message cache and keeps stored logs original', () => {
    vi.stubGlobal('window', globalThis);
    class System {
        constructor() {
            this._actionLog = [];
        }
        addLog(text) {
            this._actionLog.push(text);
        }
    }
    const system = new System();
    class Message {
        constructor() {
            this._texts = [];
        }
        faceName() {
            return '';
        }
        add(text) {
            this._texts.push(text);
            system.addLog(text);
        }
    }
    class Base {
        drawTextEx(text) {
            return text;
        }
    }
    class Window_MapLog extends Base {}
    vi.stubGlobal('Game_System', System);
    vi.stubGlobal('Game_Message', Message);
    vi.stubGlobal('Window_Base', Base);
    const cache = new Map([
        ['会話', 'Dialogue'],
        ['一行\n二行', 'First\nSecond'],
    ]);
    const runtime = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        getPreferredMessageCacheEntry: (text) => ({ value: cache.get(text) }),
        translationCache: new Map([['plugin_tm_log_window:追加情報', 'Extra information']]),
        getCacheKey: (text, type) => `${type}:${text}`,
        hasUsableCacheValue(key) {
            return !!this.translationCache.get(key);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    const translator = new TMLogWindowTranslator();
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    expect(translator.enablePluginTranslation()).toBe(true);
    const log = new Window_MapLog();
    new Message().add('会話');
    expect(log.drawTextEx('会話')).toBe('Dialogue');
    expect(runtime.trackCacheKeyUsage).not.toHaveBeenCalled();
    const message = new Message();
    message.add('一行');
    message.add('二行');
    expect(log.drawTextEx('一行')).toBe('First');
    expect(log.drawTextEx('二行')).toBe('Second');
    system.addLog('追加情報');
    expect(log.drawTextEx('追加情報')).toBe('Extra information');
    expect(system._actionLog).toEqual(['会話', '一行', '二行', '追加情報']);
    expect(new Base().drawTextEx('追加情報')).toBe('追加情報');
    runtime.enabled = false;
    expect(log.drawTextEx('会話')).toBe('会話');
});
