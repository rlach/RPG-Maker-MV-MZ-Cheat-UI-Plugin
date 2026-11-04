import { afterEach, expect, it, vi } from 'vitest';
import { HendrixLocalizationTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/HendrixLocalizationTranslator.js';
import { parseCsvTable } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/TranslatorHelpers.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function fixture() {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$plugins', [{ name: 'Hendrix_Localization', status: true, parameters: {} }]);
    const chinese = '\\n<小野寺樱>哇！好多人欸！';
    const authored = '\\n<{小野寺樱}>{哇！好多人欸！}';
    const csv = `,Excluded,Original,zh,en,jp\n,,"${authored}","${chinese}","Broken official English","公式日本語"\n,,"{第二句}\n{第三句}",,,\n,,face.png,,,\n,,__VARIABLE__10__,,,\n`;
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: true, text: async () => csv }))
    );
    class Bitmap {
        drawText(text) {
            return text;
        }
    }
    class BaseWindow {
        drawText(text) {
            return text;
        }
        drawTextEx(text) {
            return text;
        }
    }
    class Message {
        constructor() {
            this.messageBuffer = [];
            this._texts = [];
        }
        faceName() {
            return 'Sakura';
        }
        add(text) {
            this.messageBuffer.push(text);
        }
        setChoices(choices) {
            this._choices = choices.map(() => 'Official choice');
        }
        processMessageBuffer() {
            const text = this.messageBuffer.join('\n');
            this._texts.push(this.wordWrap ? '<WordWrap>' + this.official : this.official);
            this.messageBuffer = [];
            return text;
        }
    }
    class MessageWindow {
        startMessage() {
            return window.$gameMessage._texts.join('\n');
        }
    }
    vi.stubGlobal('Bitmap', Bitmap);
    vi.stubGlobal('Window_Base', BaseWindow);
    vi.stubGlobal('Game_Message', Message);
    vi.stubGlobal('Window_Message', MessageWindow);
    const runtime = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        engine: { addPluginTags: vi.fn() },
        translationCache: new Map(),
        getCacheKey: (text, type) => `${type}:${text}`,
        getMessageCacheKey: (text) => `message_portrait:${text}`,
        setCacheValue(key, value) {
            this.translationCache.set(key, value);
        },
        hasUsableCacheValue(key) {
            return !!this.translationCache.get(key);
        },
        trackCacheKeyUsage: vi.fn(),
        getCanonicalSystemCommandName: (name) => name,
    };
    const translator = new HendrixLocalizationTranslator();
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    return { translator, runtime, Message, MessageWindow, authored, chinese };
}

it('parses quoted multiline CSV and scans authored Chinese instead of official language columns', async () => {
    expect(parseCsvTable('Original,en\r\n"a,b\nc","He said ""hi"""')).toEqual([
        ['Original', 'en'],
        ['a,b\nc', 'He said "hi"'],
    ]);
    const { translator, runtime, chinese } = fixture();
    await translator.precomputeCounts();
    expect(translator.collectUntranslated({ runtime }).map((x) => x.value)).toEqual([
        chinese,
        '第二句\n第三句',
    ]);
    expect(translator.sourceText('\\{大字\\} {正文}')).toBe('\\{大字\\} 正文');
});

it.each(['官方中文', 'Broken official English', '公式日本語'])(
    'keeps canonical source and renders cheat translation after native buffering in %s',
    async (official) => {
        const { translator, runtime, Message, MessageWindow, authored, chinese } = fixture();
        expect(translator.enablePluginTranslation()).toBe(true);
        await translator.precomputeCounts();
        runtime.translationCache.set(
            `plugin_hendrix_localization:${chinese}`,
            '\\n<Sakura>Wow! So many people!'
        );
        const message = new Message();
        message.official = official;
        vi.stubGlobal('$gameMessage', message);
        message.add(authored);
        message.processMessageBuffer();
        expect(message.messageBuffer).toEqual([]);
        expect(message._texts).toEqual([chinese]);
        expect(runtime.translationCache.get(`message_portrait:${chinese}`)).toBe(
            '\\n<Sakura>Wow! So many people!'
        );
        expect(new MessageWindow().startMessage()).toBe('\\n<Sakura>Wow! So many people!');
        expect(message._texts).toEqual([chinese]);
        expect(
            translator.resolveMessageCacheSourceText({ text: authored, mode: 'collection' })
        ).toBe(chinese);
        expect(runtime.trackCacheKeyUsage.mock.calls.some(([key]) => key.includes(official))).toBe(
            false
        );
        runtime.enabled = false;
        message._texts = [];
        message.add(authored);
        message.processMessageBuffer();
        expect(message._texts).toEqual([official]);
    }
);

it('preserves pending messages and native word wrapping and does not consume an empty buffer', async () => {
    const { translator, Message, authored, chinese } = fixture();
    translator.enablePluginTranslation();
    await translator.precomputeCounts();
    const message = new Message();
    message._texts = ['previous'];
    message.wordWrap = true;
    message.official = 'Official';
    message.add(authored);
    message.processMessageBuffer();
    expect(message._texts).toEqual(['previous', '<WordWrap>' + chinese]);
});

it('does not harvest duplicate CSV misses while standard messages are being assembled', async () => {
    const { translator, runtime, Message, MessageWindow, authored } = fixture();
    translator.enablePluginTranslation();
    await translator.precomputeCounts();
    const message = new Message();
    message.official = 'Official';
    vi.stubGlobal('$gameMessage', message);
    message.add(authored);
    message.processMessageBuffer();
    new MessageWindow().startMessage();
    expect(runtime.trackCacheKeyUsage).not.toHaveBeenCalled();
});

it('canonicalizes choices and commands and removes legacy braces only while active', async () => {
    const { translator, runtime, Message } = fixture();
    translator.enablePluginTranslation();
    await translator.precomputeCounts();
    const message = new Message();
    message.setChoices(['{是}', '{否}']);
    expect(message._choices).toEqual(['是', '否']);
    expect(runtime.getCanonicalSystemCommandName('{装备}')).toBe('装备');
    expect(translator.normalizeTranslationEntry({ type: 'choice', value: '{是}' }).value).toBe(
        '是'
    );
    expect(new window.Bitmap().drawText('{defence}')).toBe('defence');
    expect(new window.Window_Base().drawTextEx('{Karuhane Tetsuo}')).toBe('Karuhane Tetsuo');
    runtime.enabled = false;
    message.setChoices(['{是}']);
    expect(message._choices).toEqual(['Official choice']);
    expect(runtime.getCanonicalSystemCommandName('{装备}')).toBe('{装备}');
    expect(new window.Bitmap().drawText('{defence}')).toBe('{defence}');
});

it('resolves legacy Gameus quest references before collection and drawing', async () => {
    const { translator, runtime } = fixture();
    window.$plugins.push({ name: 'GameusQuestSystem', status: true, parameters: {} });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url) =>
        url === 'locales/zh-CN/quests.json'
            ? {
                  ok: true,
                  text: async () =>
                      JSON.stringify({ task_object1: '打开背包使用食物', Steps: '当前进度' }),
              }
            : originalFetch(url)
    );
    translator.enablePluginTranslation();
    await translator.precomputeCounts();
    expect(translator.entries.has('打开背包使用食物')).toBe(true);
    expect(translator.sourceText('- {task_object1}')).toBe('- 打开背包使用食物');
    runtime.translationCache.set(
        'plugin_hendrix_localization:打开背包使用食物',
        'Open the inventory and use food'
    );
    expect(new window.Bitmap().drawText('- {task_object1}')).toBe(
        '- Open the inventory and use food'
    );
    expect(new window.Bitmap().drawText('task_object1')).toBe('Open the inventory and use food');
    runtime.enabled = false;
    expect(new window.Bitmap().drawText('- {task_object1}')).toBe('- {task_object1}');
});
