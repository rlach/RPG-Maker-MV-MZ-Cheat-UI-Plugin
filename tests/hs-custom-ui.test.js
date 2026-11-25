/* eslint-disable no-control-regex -- Tests verify ESC (\x1b) conversion for icon tags inside expanded variables. */
import { afterEach, expect, it, vi } from 'vitest';
import { HsCustomUiTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/HsCustomUiTranslator.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function createSetup() {
    class Window_Base {
        drawText(text) {
            return text;
        }
        drawTextEx(text) {
            return this.convertEscapeCharacters(text);
        }
        convertEscapeCharacters(text) {
            let result = String(text ?? '').replace(/\\/g, '\x1b');
            result = result.replace(/\x1bV\[(\d+)\]/gi, (_, id) =>
                String(window.$gameVariables?.value(Number(id)) ?? 0)
            );
            return result;
        }
    }

    class Window_Selectable extends Window_Base {
        drawAllItems() {
            return (this._data || []).map((item) => `${item.speaker}:${item.text}`);
        }
    }

    class Window_HSRecallList extends Window_Selectable {
        drawItem(name) {
            return this.drawText(name, 0, 0, 200);
        }
    }

    class Window_OptionHelp extends Window_Base {
        constructor() {
            super();
            this._text = '';
        }
        setText(text) {
            this._text = String(text || '');
            this.rendered = this.convertEscapeCharacters(this._text);
        }
    }

    class Window_HoverTooltip extends Window_Base {}
    class Window_HSTooltip extends Window_Base {}

    class Window_Options extends Window_Selectable {
        constructor() {
            super();
            this._list = [
                { name: 'Voice Volume', symbol: 'voiceVolume', enabled: true, ext: null },
                { name: 'Fast Mode', symbol: 'fastMode', enabled: true, ext: null },
                { name: 'Skip Read Text', symbol: 'hsReadSkipEnabled', enabled: true, ext: null },
            ];
        }
        index() {
            return 0;
        }
        commandSymbol() {
            return 'fastMode';
        }
        refresh() {
            // Simulate HS_FastOptionLocalize / HS_SV_OptionLocalize relabeling during refresh
            for (const item of this._list) {
                if (item.symbol === 'voiceVolume') item.name = 'Voice Volume';
                if (item.symbol === 'fastMode') item.name = 'Fast Mode';
                if (item.symbol === 'hsReadSkipEnabled') item.name = 'Skip Read Text';
            }
        }
    }

    class Scene_Options {
        constructor() {
            this._optionsWindow = new Window_Options();
            this._hsOptionHelpWindow = new Window_OptionHelp();
        }
        updateHsOptionHelp() {
            this._hsOptionHelpWindow.setText('Shortens wait times for text and effects.');
        }
    }

    class Game_System {
        constructor() {
            this._hsBacklog = [];
        }
        hsPushBacklog(entry) {
            this._hsBacklog.push(entry);
        }
    }

    class Window_HS_BacklogList extends Window_Selectable {
        constructor(data) {
            super();
            this._data = data;
        }
    }

    const terms = {
        commands: [
            '戦う',
            '逃げる',
            '攻撃',
            '防御',
            'アイテム',
            'スキル',
            '装備',
            'ステータス',
            '並び替え',
            '0',
            '0',
            '0 ',
            '武器',
            '防具',
            '大事なもの',
            '装備',
            '最強装備',
            '全て外す',
            '0',
            '0',
            null,
            '0',
            '0',
        ],
        commandsOriginal: [
            '戦う',
            '逃げる',
            '攻撃',
            '防御',
            'アイテム',
            'スキル',
            '装備',
            'ステータス',
            '並び替え',
            '0',
            '0',
            '0 ',
            '武器',
            '防具',
            '大事なもの',
            '装備',
            '最強装備',
            '全て外す',
            '0',
            '0',
            null,
            '0',
            '0',
        ],
        messages: {
            saveMessage: '0 ',
            loadMessage: '0 ',
            file: '0 ',
            autosave: '0 ',
            bgmVolume: '0 ',
        },
        messagesOriginal: {
            saveMessage: '0 ',
            loadMessage: '0 ',
            file: '0 ',
            autosave: '0 ',
            bgmVolume: '0 ',
        },
    };

    const plugins = [
        {
            name: 'HS_LangSimple',
            status: true,
            parameters: {
                languageVarId: '9',
                titleCommandText: 'Language / 言語',
                titleFallbacks: JSON.stringify([
                    JSON.stringify({
                        varId: '161',
                        value0: 'どのファイルにセーブしますか？',
                        value1: 'Which file do you want to save to?',
                    }),
                    JSON.stringify({
                        varId: '162',
                        value0: 'どのファイルをロードしますか？',
                        value1: 'Which file do you want to load?',
                    }),
                    JSON.stringify({
                        varId: '163',
                        value0: 'ファイル',
                        value1: 'File',
                    }),
                    JSON.stringify({
                        varId: '164',
                        value0: 'オートセーブ',
                        value1: 'Autosave',
                    }),
                    JSON.stringify({
                        varId: '168',
                        value0: 'BGM 音量',
                        value1: 'BGM Volume',
                    }),
                    JSON.stringify({
                        varId: '172',
                        value0: 'オプション',
                        value1: 'Options',
                    }),
                    JSON.stringify({
                        varId: '173',
                        value0: 'セーブ',
                        value1: 'Save',
                    }),
                    JSON.stringify({
                        varId: '174',
                        value0: 'ゲーム終了',
                        value1: 'Quit Game',
                    }),
                    JSON.stringify({
                        varId: '175',
                        value0: 'ニューゲーム',
                        value1: 'New Game',
                    }),
                    JSON.stringify({
                        varId: '176',
                        value0: 'コンティニュー',
                        value1: 'Continue',
                    }),
                    JSON.stringify({
                        varId: '177',
                        value0: 'タイトルへ',
                        value1: 'To Title',
                    }),
                    JSON.stringify({
                        varId: '178',
                        value0: 'やめる',
                        value1: 'Exit',
                    }),
                ]),
            },
        },
        {
            name: 'HS_RecallTitle',
            status: true,
            parameters: {
                RecallCommandJP: '回想',
                RecallCommandEN: 'Memories',
                LockedTextJP: '？？？',
                LockedTextEN: '????',
                Scenes: JSON.stringify([
                    JSON.stringify({
                        id: 'prologue',
                        nameJP: 'プロローグ',
                        nameEN: 'Prologue',
                    }),
                    JSON.stringify({
                        id: '3_5',
                        nameJP: '孵化の名残が疼く夜',
                        nameEN: '孵化の名残が疼く夜',
                    }),
                ]),
            },
        },
        {
            name: 'HS_OptionHelp',
            status: true,
            parameters: {
                fastModeText: 'テキストや演出の待機を短縮します。',
                hsAutoText: 'メッセージを一定時間で自動で進めます。',
                hsProtectText:
                    'ONにすると重要イベント中は高速/自動送りを停止します。OFFにすると重要イベントも流れます。',
            },
        },
        {
            name: 'HS_OptionHelp_LangBridge',
            status: true,
            parameters: {
                fastFb0: 'テキストや演出の待機を短縮します。',
                fastFb1: 'Shortens wait times for text and effects.',
                autoFb0: 'メッセージを一定時間で自動で進めます。',
                autoFb1: 'Automatically advances messages at set intervals.',
                protFb0:
                    'ONにすると重要イベント中は高速/自動送りを停止します。OFFにすると重要イベントも流れます。',
                protFb1:
                    'When ON, Fast/Auto is disabled during important events. When OFF, important events will also advance.',
            },
        },
        {
            name: 'HS_SV_OptionLocalize',
            status: true,
            parameters: {
                fb0: 'ボイス 音量',
                fb1: 'Voice Volume',
            },
        },
        {
            name: 'HS_FastOptionLocalize',
            status: true,
            parameters: {
                fastFb0: '高速モード',
                fastFb1: 'Fast Mode',
                autoFb0: '自動送り',
                autoFb1: 'Auto-Advance',
                protectFb0: '重要シーンを保護',
                protectFb1: 'Protect Key Scenes',
            },
        },
        {
            name: 'HS_ReadSkipMZ',
            status: true,
            parameters: {
                OptionFb0: '既読スキップ',
                OptionFb1: 'Skip Read Text',
            },
        },
        {
            name: 'MEG_PictureTooltipMZ',
            status: true,
            parameters: {},
        },
    ];

    const varMap = new Map([
        [111, 'Talk to her'],
        [117, '\\IS[12,18]Affection'],
        [119, '\\IS[14,18]Comfort'],
    ]);

    vi.stubGlobal('window', {
        $plugins: plugins,
        $dataSystem: { terms },
        $dataCommonEvents: [
            {
                id: 1,
                list: [
                    {
                        code: 111,
                        indent: 0,
                        parameters: [1, 9, 0, 0, 0],
                    },
                    {
                        code: 357,
                        indent: 1,
                        parameters: [
                            'MEG_PictureTooltipMZ',
                            'AddTooltip',
                            'Add Tooltip',
                            {
                                pictureId: '24',
                                text: '\\FS[14]\\C[2]章目標\\C[0]：想いを伝え、心を通わせる  \\C[0]あと \\C[6]\\V[108]\\C[0] 日',
                            },
                        ],
                    },
                    {
                        code: 412,
                        indent: 0,
                        parameters: [],
                    },
                    {
                        code: 111,
                        indent: 0,
                        parameters: [1, 9, 0, 1, 0],
                    },
                    {
                        code: 357,
                        indent: 1,
                        parameters: [
                            'MEG_PictureTooltipMZ',
                            'AddTooltip',
                            'Add Tooltip',
                            {
                                pictureId: '24',
                                text: '\\FS[14]\\C[2]Chapter Goal\\C[0]: Share your feelings  \\C[0]\\C[6]\\V[108]\\C[0] days left',
                            },
                        ],
                    },
                    {
                        code: 412,
                        indent: 0,
                        parameters: [],
                    },
                    {
                        code: 357,
                        indent: 0,
                        parameters: [
                            'MEG_PictureTooltipMZ',
                            'AddTooltip',
                            'Add Tooltip',
                            {
                                pictureId: '3',
                                text: '\\FS[12]\\V[111]: \\C[0]\\V[117] \\C[2]↑\\C[0] \\C[0]\\V[119] \\C[6]—\\C[0]',
                            },
                        ],
                    },
                ],
            },
        ],
        $dataMapInfos: [],
        $gameVariables: {
            _data: [],
            value: (id) => varMap.get(id) ?? 0,
            _translateOriginalValue: (id) => (id >= 161 && id <= 185 ? 0 : varMap.get(id) ?? 0),
        },
        $gameMessage: {
            _translateOriginalSpeaker: '透花',
        },
        ConfigManager: { hs_langIndex: 0 },
        DataManager: {
            onLoad: (obj) => obj,
            createGameObjects: () => {},
        },
        TextManager: {
            command: (id) => terms.commands[id] || '',
            message: (id) => terms.messages[id] || '',
        },
        Window_Base,
        Window_Selectable,
        Window_Options,
        Scene_Options,
        Game_System,
    });

    const cache = new Map();
    const seen = [];
    const runtime = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        isNonOtfTranslationProcessActive() {
            return false;
        },
        getCacheKey: (text, type) => `${type}:${String(text).replace(/\n+$/, '')}`,
        translationCache: cache,
        hasUsableCacheValue: (key) => {
            const val = cache.get(key);
            return typeof val === 'string' && val.trim() !== '';
        },
        trackCacheKeyUsage: vi.fn((key) => seen.push(key)),
        getCanonicalSystemCommandName: (name) => name,
        getKnownCommandDisplayCacheKey: (text) => {
            for (const [k, v] of cache.entries()) {
                if (k.startsWith('command:') && v === text) return k;
            }
            return null;
        },
        getPreferredMessageCacheEntry: (text) => {
            const key = `message:${text}`;
            return cache.has(key) ? { cacheKey: key, value: cache.get(key) } : null;
        },
        getMessageCacheKey: (text) => `message:${text}`,
    };

    const translator = new HsCustomUiTranslator();
    translator.getRuntime = () => runtime;
    translator.registerPluginCustomTags = vi.fn();

    return {
        translator,
        runtime,
        cache,
        seen,
        terms,
        Window_HSRecallList,
        Window_HoverTooltip,
        Window_HSTooltip,
        Window_Options,
        Scene_Options,
        Game_System,
        Window_HS_BacklogList,
    };
}

it('repairs "0" corrupted $dataSystem.terms from HS_LangSimple and protects templates against overwrites', () => {
    const { translator, runtime, cache, terms } = createSetup();
    cache.set('command:ニューゲーム', 'New Game');
    cache.set('command:コンティニュー', 'Continue');
    cache.set('command:オプション ', 'Options ');
    cache.set('system_message:どのファイルにセーブしますか？ ', 'Save to which file? ');
    cache.set('system_message:ファイル ', 'File ');
    cache.set('system_message:オートセーブ ', 'Autosave ');

    expect(translator.enablePluginTranslation()).toBe(true);

    // Canonical originals are restored from titleFallbacks instead of "0"
    expect(terms.commandsOriginal[18]).toBe('ニューゲーム');
    expect(terms.commandsOriginal[19]).toBe('コンティニュー');
    expect(terms.commandsOriginal[11]).toBe('オプション ');
    expect(terms.messagesOriginal.saveMessage).toBe('どのファイルにセーブしますか？ ');
    expect(terms.messagesOriginal.file).toBe('ファイル ');
    expect(terms.messagesOriginal.autosave).toBe('オートセーブ ');

    // Active runtime returns translated values and never "0"
    expect(terms.commands[18]).toBe('New Game');
    expect(terms.commands[19]).toBe('Continue');
    expect(terms.commands[11]).toBe('Options ');
    expect(terms.messages.saveMessage).toBe('Save to which file? ');
    expect(terms.messages.file).toBe('File ');
    expect(window.TextManager.command(18)).toBe('New Game');
    expect(window.TextManager.message('file')).toBe('File ');

    // Simulate GameArrays or SystemMessages writing "0" or static strings back into terms
    terms.commands[18] = '0';
    terms.messages.file = '0 ';
    expect(terms.commands[18]).toBe('New Game');
    expect(terms.messages.file).toBe('File ');

    // Disabling translation restores native Japanese fallback instead of "0"
    runtime.enabled = false;
    expect(terms.commands[18]).toBe('ニューゲーム');
    expect(terms.messages.file).toBe('ファイル ');
});

it('translates HS_RecallTitle gallery items, option help descriptions, and option labels without feedback loops', async () => {
    const {
        translator,
        runtime,
        cache,
        seen,
        Window_HSRecallList,
        Scene_Options,
    } = createSetup();

    expect(translator.enablePluginTranslation()).toBe(true);
    await translator.precomputeCounts();

    const pendingValues = translator.collectUntranslated({ runtime }).map((item) => item.value);
    expect(pendingValues).toContain('プロローグ');
    expect(pendingValues).toContain('孵化の名残が疼く夜');
    expect(pendingValues).toContain('？？？');
    expect(pendingValues).toContain('テキストや演出の待機を短縮します。');
    expect(pendingValues).toContain(
        '\\FS[14]\\C[2]章目標\\C[0]：想いを伝え、心を通わせる  \\C[0]あと \\C[6]\\V[108]\\C[0] 日'
    );
    // Pure variable template and non-JP branch should not be collected
    expect(pendingValues).not.toContain(
        '\\FS[12]\\V[111]: \\C[0]\\V[117] \\C[2]↑\\C[0] \\C[0]\\V[119] \\C[6]—\\C[0]'
    );
    expect(pendingValues).not.toContain(
        '\\FS[14]\\C[2]Chapter Goal\\C[0]: Share your feelings  \\C[0]\\C[6]\\V[108]\\C[0] days left'
    );

    cache.set('plugin_hs_custom_ui:プロローグ', 'Prologue');
    cache.set('plugin_hs_custom_ui:孵化の名残が疼く夜', 'Night of Aching Remnants');
    cache.set('plugin_hs_custom_ui:？？？', '???');
    cache.set(
        'plugin_hs_custom_ui:テキストや演出の待機を短縮します。',
        'Shortens wait times for text and effects.'
    );
    cache.set('command:ボイス 音量', 'Voice Volume (PL)');
    cache.set('command:高速モード', 'High Speed Mode (PL)');
    cache.set('command:既読スキップ', 'Skip Read Text (PL)');

    const recallWindow = new Window_HSRecallList();
    expect(recallWindow.drawItem('プロローグ')).toBe('Prologue');
    expect(recallWindow.drawItem('Prologue')).toBe('Prologue');
    expect(recallWindow.drawItem('孵化の名残が疼く夜')).toBe('Night of Aching Remnants');
    expect(recallWindow.drawItem('？？？')).toBe('???');
    expect(recallWindow.drawItem('????')).toBe('???');

    const sceneOptions = new Scene_Options();
    sceneOptions.updateHsOptionHelp();
    expect(sceneOptions._hsOptionHelpWindow._text).toBe(
        'Shortens wait times for text and effects.'
    );

    sceneOptions._optionsWindow.refresh();
    expect(sceneOptions._optionsWindow._list.map((i) => i.name)).toEqual([
        'Voice Volume (PL)',
        'High Speed Mode (PL)',
        'Skip Read Text (PL)',
    ]);

    // Repeated redraws must only track canonical original keys, never translated outputs
    seen.length = 0;
    recallWindow.drawItem('プロローグ');
    recallWindow.drawItem('孵化の名残が疼く夜');
    expect(seen).toEqual([
        'plugin_hs_custom_ui:プロローグ',
        'plugin_hs_custom_ui:孵化の名残が疼く夜',
    ]);

    // Disabling translation preserves original display
    runtime.enabled = false;
    expect(recallWindow.drawItem('プロローグ')).toBe('プロローグ');
});

it('translates MEG_PictureTooltipMZ templates and converts \\IS icon escape codes inside expanded variables to ESC', () => {
    const { translator, cache, Window_HoverTooltip } = createSetup();
    cache.set(
        'plugin_hs_custom_ui:\\FS[14]\\C[2]章目標\\C[0]：想いを伝え、心を通わせる  \\C[0]あと \\C[6]\\V[108]\\C[0] 日',
        '\\FS[14]\\C[2]Chapter Goal\\C[0]: Connect hearts  \\C[0]\\C[6]\\V[108]\\C[0] days left'
    );

    expect(translator.enablePluginTranslation()).toBe(true);

    const tooltip = new Window_HoverTooltip();
    const staticResult = tooltip.drawTextEx(
        '\\FS[14]\\C[2]章目標\\C[0]：想いを伝え、心を通わせる  \\C[0]あと \\C[6]\\V[108]\\C[0] 日'
    );
    expect(staticResult).toContain('Chapter Goal');

    // Variable 117 expands to "\\IS[12,18]Affection" after initial backslash->ESC replacement;
    // hook must convert \IS[12,18] to \x1bIS[12,18] so processEscapeCharacter draws the icon.
    const varTooltipResult = tooltip.drawTextEx(
        '\\FS[12]\\V[111]: \\C[0]\\V[117] \\C[2]↑\\C[0] \\C[0]\\V[119] \\C[6]—\\C[0]'
    );
    expect(varTooltipResult).toBe(
        '\x1bFS[12]Talk to her: \x1bC[0]\x1bIS[12,18]Affection \x1bC[2]↑\x1bC[0] \x1bC[0]\x1bIS[14,18]Comfort \x1bC[6]—\x1bC[0]'
    );
});

it('translates HS_BacklogCore_Simple entries at presentation time without mutating stored backlog state', () => {
    const { translator, cache, Window_HS_BacklogList } = createSetup();
    cache.set('actor_name:透花', 'Touka');
    cache.set('message:……おはよう。', '...Good morning.');

    expect(translator.enablePluginTranslation()).toBe(true);

    const entry = { speaker: '透花', text: '……おはよう。', faceName: '' };
    const backlogWindow = new Window_HS_BacklogList([entry]);

    expect(backlogWindow.drawAllItems()).toEqual(['Touka:...Good morning.']);
    expect(entry.speaker).toBe('透花');
    expect(entry.text).toBe('……おはよう。');
});
