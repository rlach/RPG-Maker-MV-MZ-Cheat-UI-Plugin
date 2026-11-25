import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * FTKR_OriginalSceneWindow translator
 *
 * Supported versions:
 * - v1.5.1 (MV, Futokoro): OSW_コモン設定 / OSW_SET_COMMON, OSW_コマンド設定 / OSW_SET_COMMAND,
 *   OSW_セレクト設定 / OSW_SET_SELECT plugin commands.
 *
 * Translation notes:
 * - Collects display text from event plugin commands (code 356) across common events,
 *   troops, and map events:
 *   - テキスト / TEXT <line> <text>
 *   - コマンド追加 / ADD_COMMAND <name> <symbol> <enabled> <method>
 *   - リスト設定 / SET_LIST (テキスト / TEXT) <item1,item2,...>
 *   - 内容 / CONTENT (ステータス / STATUS) text(...) payloads
 * - Translates strictly at presentation time (drawCssText, Window_OswCommon/Command/Select
 *   draw paths) without mutating saved $gameOswData / $gameMap / $gameParty window state.
 */

const CACHE_TYPE = 'plugin_ftkr_original_scene_window';
const OSW_WINDOW_COMMANDS = new Set([
    'コモン設定',
    'SET_COMMON',
    'コマンド設定',
    'SET_COMMAND',
    'セレクト設定',
    'SET_SELECT',
]);

const OSW_CSS_TEXT_PATTERN = /\btext\(([^()]*)\)/gi;
const ESCAPE_ONLY_PATTERN =
    /^(?:\\(?:[A-Za-z]+(?:\[\d+\])?|[.$|!><^}{\\])|[\s\u3000/:,.;\-+()[\]0-9])*$/;

function hasTranslatableOswText(text) {
    if (typeof text !== 'string' || !text.trim()) {
        return false;
    }
    return !ESCAPE_ONLY_PATTERN.test(text);
}

function extractCssStatusTexts(statusTemplate, output) {
    if (typeof statusTemplate !== 'string' || !statusTemplate) {
        return;
    }
    OSW_CSS_TEXT_PATTERN.lastIndex = 0;
    let match = OSW_CSS_TEXT_PATTERN.exec(statusTemplate);
    while (match) {
        const inner = match[1];
        if (hasTranslatableOswText(inner)) {
            output.push(inner);
        }
        match = OSW_CSS_TEXT_PATTERN.exec(statusTemplate);
    }
}

export function extractOswCommandTexts(commandLine) {
    if (typeof commandLine !== 'string' || !commandLine.trim()) {
        return [];
    }

    const args = commandLine.trim().split(' ');
    const command = args.shift() || '';
    const oswMatch = /^OSW_(.+)$/i.exec(command);
    if (!oswMatch) {
        return [];
    }

    const subcommand = oswMatch[1].toUpperCase();
    if (!OSW_WINDOW_COMMANDS.has(subcommand)) {
        return [];
    }

    const isCommandWindow = subcommand === 'コマンド設定' || subcommand === 'SET_COMMAND';
    const results = [];

    for (let i = 2; i < args.length; i++) {
        const token = String(args[i] || '').toUpperCase();
        switch (token) {
            case '生成':
            case 'CREATE':
                return results;
            case '位置':
            case 'POSITION':
                i += 2;
                break;
            case 'サイズ':
            case 'SIZE':
                i += isCommandWindow ? 1 : 2;
                break;
            case 'カーソル残す':
            case 'LEAVE_CURSOR':
            case '表示':
            case 'SHOW':
            case '表示スイッチ':
            case 'SHOW_SWITCH':
            case 'アクティブ':
            case 'ACTIVE':
            case '最大列数':
            case 'MAX_COLS':
            case 'カーソル高さ':
            case 'CURSOR_HEIGHT':
            case 'コマンド位置':
            case 'COMMAND_ALIGN':
            case 'キャンセル実行設定':
            case 'ADD_CANCEL_ACTION':
            case 'アクター':
            case 'ACTOR':
            case 'パーティー':
            case 'PARTY':
            case 'セレクト参照':
            case 'REFERENCE_SELECT':
            case 'フォントサイズ':
            case 'FONT_SIZE':
            case '余白':
            case 'PADDING':
            case '行の高さ':
            case 'LINEHEIGHT':
            case '透明度':
            case 'OPACITY':
            case 'フレーム':
            case 'FRAME':
                i += 1;
                break;
            case 'コマンド初期化':
            case 'CLEAR_COMMAND':
            case 'リスト初期化':
            case 'CLEAR_LIST':
            case 'テキスト初期化':
            case 'CLEAR_TEXT':
            case '更新':
            case 'REFRESH':
            case 'カーソル位置初期化':
            case 'CLEAR_CURSOR':
                break;
            case 'コマンド追加':
            case 'ADD_COMMAND': {
                const name = args[i + 1];
                if (hasTranslatableOswText(name)) {
                    results.push(name);
                }
                i += 4;
                break;
            }
            case 'リスト設定':
            case 'SET_LIST': {
                const listKind = String(args[i + 1] || '').toUpperCase();
                if (listKind === 'テキスト' || listKind === 'TEXT') {
                    for (const item of String(args[i + 2] || '').split(',')) {
                        if (hasTranslatableOswText(item)) {
                            results.push(item);
                        }
                    }
                }
                i += 2;
                break;
            }
            case 'リスト実行設定':
            case 'SET_LIST_ACTION':
                i += 3;
                break;
            case 'テキスト':
            case 'TEXT': {
                const text = args[i + 2];
                if (hasTranslatableOswText(text)) {
                    results.push(text);
                }
                i += 2;
                break;
            }
            case '内容':
            case 'CONTENT': {
                let j = i + 1;
                while (j < args.length) {
                    const contentKey = String(args[j] || '').toUpperCase();
                    if (contentKey === 'ステータス' || contentKey === 'STATUS') {
                        extractCssStatusTexts(args[j + 1], results);
                        j += 2;
                    } else if (
                        contentKey === '描画間隔' ||
                        contentKey === 'DRAW_SPACE' ||
                        contentKey === '並列間隔' ||
                        contentKey === 'PARALLEL_SPACE' ||
                        contentKey === '幅比率' ||
                        contentKey === 'WIDTH_RATE'
                    ) {
                        j += 2;
                    } else {
                        break;
                    }
                }
                i = j - 1;
                break;
            }
            default:
                return results;
        }
    }

    return results;
}

export class FtkrOriginalSceneWindowTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
        this._drawingDepth = 0;
        this._hookedWindows = new WeakSet();
    }

    getPluginName() {
        return 'FTKR_OriginalSceneWindow';
    }

    getPluginLabel() {
        return 'FTKR OriginalSceneWindow';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    translateOswText(text) {
        if (!hasTranslatableOswText(text)) {
            return text;
        }
        const runtime = this.getRuntime();
        if (!this.isRuntimeTranslationActive(runtime)) {
            return text;
        }
        return this.resolveRuntimeTranslation(text, runtime, this.getCacheType());
    }

    hookCommonWindow(win) {
        if (!win || this._hookedWindows.has(win) || typeof win.drawTextEx !== 'function') {
            return;
        }
        this._hookedWindows.add(win);
        const translator = this;
        const originalDrawTextEx = win.drawTextEx;
        win.drawTextEx = function (text, ...args) {
            if (translator._drawingDepth > 0) {
                return originalDrawTextEx.call(this, text, ...args);
            }
            const translated = translator.translateOswText(text);
            translator._drawingDepth++;
            try {
                return originalDrawTextEx.call(this, translated, ...args);
            } finally {
                translator._drawingDepth--;
            }
        };
    }

    hookCommandWindow(win) {
        if (
            !win ||
            this._hookedWindows.has(win) ||
            typeof win.drawItem !== 'function' ||
            typeof win.commandName !== 'function'
        ) {
            return;
        }
        this._hookedWindows.add(win);
        const translator = this;
        const originalDrawItem = win.drawItem;
        win.drawItem = function (index, ...args) {
            const originalCommandName = this.commandName;
            this.commandName = function (cmdIndex) {
                const name = originalCommandName.call(this, cmdIndex);
                return translator.translateOswText(name);
            };
            try {
                return originalDrawItem.call(this, index, ...args);
            } finally {
                this.commandName = originalCommandName;
            }
        };
    }

    hookSelectWindow(win) {
        if (
            !win ||
            this._hookedWindows.has(win) ||
            typeof win.drawItem !== 'function' ||
            typeof win.drawTextEx !== 'function'
        ) {
            return;
        }
        this._hookedWindows.add(win);
        const translator = this;
        const originalDrawItem = win.drawItem;
        win.drawItem = function (index, ...args) {
            if (this._window?._drawType) {
                return originalDrawItem.call(this, index, ...args);
            }
            const originalDrawTextEx = this.drawTextEx;
            this.drawTextEx = function (text, ...rest) {
                const translated = translator.translateOswText(text);
                return originalDrawTextEx.call(this, translated, ...rest);
            };
            try {
                return originalDrawItem.call(this, index, ...args);
            } finally {
                this.drawTextEx = originalDrawTextEx;
            }
        };
    }

    enablePluginTranslation() {
        const sceneBase = window.Scene_Base?.prototype;
        const windowBase = window.Window_Base?.prototype;
        if (
            typeof sceneBase?.createCommonWindow !== 'function' ||
            typeof sceneBase?.createCommandWindow !== 'function' ||
            typeof sceneBase?.createSelectWindow !== 'function' ||
            typeof windowBase?.drawTextEx !== 'function'
        ) {
            return false;
        }

        const translator = this;

        if (typeof windowBase.drawCssText === 'function') {
            const originalDrawCssText = windowBase.drawCssText;
            windowBase.drawCssText = function (actor, x, y, width, text, ...args) {
                const ctorName = this.constructor?.name;
                if (
                    translator._drawingDepth > 0 ||
                    (ctorName !== 'Window_OswCommon' && ctorName !== 'Window_OswSelect')
                ) {
                    return originalDrawCssText.call(this, actor, x, y, width, text, ...args);
                }
                const translated = translator.translateOswText(text);
                translator._drawingDepth++;
                try {
                    return originalDrawCssText.call(this, actor, x, y, width, translated, ...args);
                } finally {
                    translator._drawingDepth--;
                }
            };
        }

        const originalCreateCommon = sceneBase.createCommonWindow;
        sceneBase.createCommonWindow = function (windowId, gameWindow, ...args) {
            const result = originalCreateCommon.call(this, windowId, gameWindow, ...args);
            translator.hookCommonWindow(this._oswCommonWindows?.[windowId]);
            return result;
        };

        const originalCreateCommand = sceneBase.createCommandWindow;
        sceneBase.createCommandWindow = function (windowId, gameWindow, ...args) {
            const result = originalCreateCommand.call(this, windowId, gameWindow, ...args);
            translator.hookCommandWindow(this._oswCommandWindows?.[windowId]);
            return result;
        };

        const originalCreateSelect = sceneBase.createSelectWindow;
        sceneBase.createSelectWindow = function (windowId, gameWindow, ...args) {
            const result = originalCreateSelect.call(this, windowId, gameWindow, ...args);
            translator.hookSelectWindow(this._oswSelectWindows?.[windowId]);
            return result;
        };

        const scene = window.SceneManager?._scene;
        for (const win of scene?._oswCommonWindows || []) translator.hookCommonWindow(win);
        for (const win of scene?._oswCommandWindows || []) translator.hookCommandWindow(win);
        for (const win of scene?._oswSelectWindows || []) translator.hookSelectWindow(win);

        return true;
    }

    collectFromCommandList(list, output) {
        if (!Array.isArray(list)) {
            return;
        }
        for (const command of list) {
            if (Number(command?.code) !== 356) {
                continue;
            }
            for (const text of extractOswCommandTexts(command.parameters?.[0])) {
                output.push(text);
            }
        }
    }

    async buildScanEntries() {
        const texts = [];
        for (const commonEvent of window.$dataCommonEvents || []) {
            this.collectFromCommandList(commonEvent?.list, texts);
        }
        for (const troop of window.$dataTroops || []) {
            for (const page of troop?.pages || []) {
                this.collectFromCommandList(page?.list, texts);
            }
        }
        const { loadMapDataById } =
            await import('../../../js/translation-runtime/ObjectTranslationModalMethods.js');
        for (const mapInfo of window.$dataMapInfos || []) {
            const mapId = Number(mapInfo?.id);
            if (!mapId) continue;
            try {
                const mapData = await loadMapDataById(mapId);
                for (const event of mapData?.events || []) {
                    for (const page of event?.pages || []) {
                        this.collectFromCommandList(page?.list, texts);
                    }
                }
            } catch (error) {
                console.warn(
                    `[FtkrOriginalSceneWindowTranslator] Failed to scan map ${mapId}`,
                    error
                );
            }
        }
        return texts;
    }

    async precomputeCounts() {
        if (this._scanPrepared) {
            return;
        }
        if (this._scanPromise) {
            return this._scanPromise;
        }

        this._scanPromise = this.buildScanEntries()
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[FtkrOriginalSceneWindowTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildUniqueItems(runtime) {
        const byKey = new Map();
        for (const text of this._scanEntries) {
            if (!this.isUsableText(text)) continue;
            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (!byKey.has(cacheKey)) {
                byKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_ftkr_osw_${byKey.size}`,
                    value: text,
                    cacheKey,
                });
            }
        }
        return Array.from(byKey.values());
    }

    collectUntranslated({ runtime }) {
        if (!runtime) return [];
        return this.buildUniqueItems(runtime).filter(
            (item) => !runtime.hasUsableCacheValue(item.cacheKey)
        );
    }

    getCachedCountsSync({ runtime }) {
        if (!runtime) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }
        const items = this.buildUniqueItems(runtime);
        const leftStrings = items.filter(
            (item) => !runtime.hasUsableCacheValue(item.cacheKey)
        ).length;
        return {
            total: items.length,
            left: leftStrings,
            totalStrings: items.length,
            leftStrings,
        };
    }
}
