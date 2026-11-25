import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/**
 * YEP_BattleEngineCore translator
 *
 * Supported plugin versions:
 * - YEP_BattleEngineCore.js v1.46 (MV)
 * - YEP_BattleEngineCore.js v1.51 (MV)
 *
 * Translation notes:
 * - Source strings are collected from YEP_BattleEngineCore's Selection Help
 *   parameters (User Help Text, Ally Help Text, Allies Help Text, Enemy Help Text,
 *   Enemies Help Text, All Help Text, Random Help Text) and <Display Text: x> /
 *   <Display Name: x> skill/item notetags.
 * - Does not hook Window_PartyCommand / Window_ActorCommand makeCommandList to
 *   harvest into plugin_yep_battle_engine_core, because standard party/actor
 *   commands come from TextManager / $dataSystem.terms.commands and are already
 *   translated by CommandTranslationManager (hooking them after
 *   CommandTranslationManager previously harvested already-translated English
 *   command names like "Attack", "Defend", and "Item" as new source keys).
 * - Hooks Window_Help.prototype.drawSpecialSelectionText and
 *   Window_BattleLog.prototype.displayText at runtime.
 */

const PLUGIN_NAME = 'YEP_BattleEngineCore';
const CACHE_TYPE = 'plugin_yep_battle_engine_core';

const HELP_PARAM_TO_YANFLY_KEY = [
    ['User Help Text', 'BECHelpUserTx'],
    ['Ally Help Text', 'BECHelpAllyTx'],
    ['Allies Help Text', 'BECHelpAlliesTx'],
    ['Enemy Help Text', 'BECHelpEnemyTx'],
    ['Enemies Help Text', 'BECHelpEnemiesTx'],
    ['All Help Text', 'BECHelpAllTx'],
    ['Random Help Text', 'BECHelpRandTx'],
];

const TRANSLATABLE_PARAM_KEYS = new Set(HELP_PARAM_TO_YANFLY_KEY.map(([key]) => key));

const DISPLAY_TEXT_NOTE_RE = /<(?:DISPLAY NAME|DISPLAY TEXT):\s*(.*)>/gi;

const HOOK_FLAG_HELP = '__CHEAT_YEP_BATTLE_ENGINE_CORE_HELP_HOOKED__';
const HOOK_FLAG_DISPLAY_TEXT = '__CHEAT_YEP_BATTLE_ENGINE_CORE_DISPLAY_TEXT_HOOKED__';

const DATABASE_NOTE_SOURCES = [
    ['Skills', '$dataSkills', 'skill_name'],
    ['Items', '$dataItems', 'item_name'],
];

export class YepBattleEngineCoreTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
        this._originalYanflyHelpParams = null;
    }

    getPluginName() {
        return PLUGIN_NAME;
    }

    getPluginLabel() {
        return 'YEP Battle Engine Core';
    }

    getCacheType() {
        return CACHE_TYPE;
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
                console.warn('[YepBattleEngineCoreTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];
        this._collectSyncEntries(entries);

        for (const [fileName, globalKey] of DATABASE_NOTE_SOURCES) {
            if (Array.isArray(window[globalKey]) || typeof fetch !== 'function') {
                continue;
            }

            try {
                const response = await fetch(`data/${fileName}.json`);
                if (response?.ok) {
                    const parsed = parseJsonSafely(await response.text(), null);
                    if (Array.isArray(parsed)) {
                        this._appendNotetagEntries(entries, parsed, fileName);
                    }
                }
            } catch {
                // Ignore missing database files in partial test environments
            }
        }

        return entries;
    }

    _collectSyncEntries(entries) {
        const pluginEntry = this.findPluginEntry(this.getPluginName());
        this._appendParameterEntries(entries, pluginEntry?.parameters, 'pluginEntry');

        if (typeof window.PluginManager?.parameters === 'function') {
            this._appendParameterEntries(
                entries,
                window.PluginManager.parameters(this.getPluginName()),
                'runtimeParameters'
            );
        }

        for (const [fileName, globalKey] of DATABASE_NOTE_SOURCES) {
            if (Array.isArray(window[globalKey])) {
                this._appendNotetagEntries(entries, window[globalKey], fileName);
            }
        }
    }

    _appendNotetagEntries(output, list, scope) {
        if (!Array.isArray(list)) {
            return;
        }

        for (const item of list) {
            if (!item || typeof item !== 'object') {
                continue;
            }

            const noteText =
                typeof item._translateOriginal?.note === 'string'
                    ? item._translateOriginal.note
                    : item.note;
            if (!this.isUsableText(noteText)) {
                continue;
            }

            DISPLAY_TEXT_NOTE_RE.lastIndex = 0;
            let match;
            while ((match = DISPLAY_TEXT_NOTE_RE.exec(noteText)) !== null) {
                const displayText = String(match[1] || '').trim();
                if (this.isUsableText(displayText)) {
                    output.push({
                        text: displayText,
                        source: {
                            scope,
                            field: 'battleDisplayText',
                            id: item.id,
                        },
                    });
                }
            }
        }
    }

    collectUntranslated({ runtime }) {
        if (!runtime) {
            return [];
        }

        if (!this._scanPrepared && this._scanEntries.length === 0) {
            this._collectSyncEntries(this._scanEntries);
        }

        const items = this._buildUniquePendingItems(runtime);
        return items.filter((item) => !this._isEntryTranslated(item.value, runtime));
    }

    getCachedCountsSync({ runtime }) {
        if (!runtime) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        if (!this._scanPrepared && this._scanEntries.length === 0) {
            this._collectSyncEntries(this._scanEntries);
        }

        const items = this._buildUniquePendingItems(runtime);
        const totalStrings = items.length;
        const leftStrings = items.filter(
            (item) => !this._isEntryTranslated(item.value, runtime)
        ).length;

        return {
            total: totalStrings,
            left: leftStrings,
            totalStrings,
            leftStrings,
        };
    }

    _isEntryTranslated(text, runtime) {
        return [CACHE_TYPE, 'actor_name', 'skill_name', 'item_name'].some((cacheType) =>
            runtime.hasUsableCacheValue(runtime.getCacheKey(text, cacheType))
        );
    }

    resolveYepText(text, runtime, fallbackCacheTypes = [CACHE_TYPE, 'actor_name']) {
        if (!this.isUsableText(text) || !this.isRuntimeTranslationActive(runtime)) {
            return text;
        }

        const translated = this.resolveRuntimeTranslation(text, runtime, fallbackCacheTypes, {
            requireRuntimeTranslationActive: true,
            missValue: null,
            harvestMissing: false,
        });
        if (this.isUsableText(translated)) {
            return translated;
        }

        const primaryKey = runtime.getCacheKey(text, CACHE_TYPE);
        runtime.trackCacheKeyUsage(primaryKey, { harvestMissing: true });
        return text;
    }

    enablePluginTranslation() {
        const helpProto = window.Window_Help?.prototype;
        const battleLogProto = window.Window_BattleLog?.prototype;

        const canHookHelp = helpProto && typeof helpProto.drawSpecialSelectionText === 'function';
        const canHookDisplayText =
            battleLogProto && typeof battleLogProto.displayText === 'function';

        if (!canHookHelp && !canHookDisplayText) {
            return false;
        }

        const translator = this;

        if (canHookHelp && !helpProto[HOOK_FLAG_HELP]) {
            const originalDrawSpecialSelectionText = helpProto.drawSpecialSelectionText;
            helpProto.drawSpecialSelectionText = function () {
                const runtime = translator.getRuntime();
                const yanflyParam = window.Yanfly?.Param;
                if (!yanflyParam || !translator.isRuntimeTranslationActive(runtime)) {
                    return originalDrawSpecialSelectionText.apply(this, arguments);
                }

                if (!translator._originalYanflyHelpParams) {
                    translator._originalYanflyHelpParams = {};
                    for (const [, prop] of HELP_PARAM_TO_YANFLY_KEY) {
                        if (typeof yanflyParam[prop] === 'string') {
                            translator._originalYanflyHelpParams[prop] = yanflyParam[prop];
                        }
                    }
                }

                const saved = {};
                try {
                    for (const [prop, sourceVal] of Object.entries(
                        translator._originalYanflyHelpParams
                    )) {
                        saved[prop] = yanflyParam[prop];
                        if (translator.isUsableText(sourceVal)) {
                            yanflyParam[prop] = translator.resolveYepText(sourceVal, runtime, [
                                CACHE_TYPE,
                                'actor_name',
                            ]);
                        }
                    }
                    return originalDrawSpecialSelectionText.apply(this, arguments);
                } finally {
                    for (const [prop, prevVal] of Object.entries(saved)) {
                        yanflyParam[prop] = prevVal;
                    }
                }
            };

            Object.defineProperty(helpProto, HOOK_FLAG_HELP, {
                value: true,
                configurable: true,
                enumerable: false,
                writable: false,
            });
        }

        if (canHookDisplayText && !battleLogProto[HOOK_FLAG_DISPLAY_TEXT]) {
            const originalDisplayText = battleLogProto.displayText;
            battleLogProto.displayText = function (item) {
                if (
                    item &&
                    typeof item === 'object' &&
                    typeof item.battleDisplayText === 'string'
                ) {
                    if (typeof item._yepOriginalBattleDisplayText !== 'string') {
                        const origName = item._translateOriginal?.name;
                        const currentDisplay = item.battleDisplayText;
                        // If battleDisplayText defaulted to item.name before DataObjects translated item.name in-place,
                        // keep original Japanese name as canonical source.
                        item._yepOriginalBattleDisplayText =
                            typeof origName === 'string' && currentDisplay === origName
                                ? origName
                                : currentDisplay;
                    }
                }

                const rawText = originalDisplayText.apply(this, arguments);
                const runtime = translator.getRuntime();
                if (!translator.isRuntimeTranslationActive(runtime) || !item) {
                    return item?._yepOriginalBattleDisplayText || rawText;
                }

                const sourceText = item._yepOriginalBattleDisplayText || rawText;
                if (!translator.isUsableText(sourceText)) {
                    return rawText;
                }

                // If the skill/item has no custom <Display Text: x> override, prefer its already-translated item.name
                const origItemName = item._translateOriginal?.name ?? item.name;
                if (
                    sourceText === origItemName &&
                    translator.isUsableText(item.name) &&
                    item.name !== sourceText
                ) {
                    return item.name;
                }

                return translator.resolveYepText(sourceText, runtime, [
                    CACHE_TYPE,
                    'skill_name',
                    'item_name',
                ]);
            };

            Object.defineProperty(battleLogProto, HOOK_FLAG_DISPLAY_TEXT, {
                value: true,
                configurable: true,
                enumerable: false,
                writable: false,
            });
        }

        return true;
    }

    _appendParameterEntries(output, parameters, scope) {
        if (!Array.isArray(output) || !parameters || typeof parameters !== 'object') {
            return;
        }

        for (const [field, rawValue] of Object.entries(parameters)) {
            if (!TRANSLATABLE_PARAM_KEYS.has(String(field))) {
                continue;
            }

            if (!this._isTranslatableParameterText(rawValue)) {
                continue;
            }

            output.push({
                text: String(rawValue),
                source: {
                    scope,
                    field,
                },
            });
        }
    }

    _isTranslatableParameterText(value) {
        if (!this.isUsableText(value)) {
            return false;
        }

        const text = String(value);
        const trimmed = text.trim();

        if (/^(true|false)$/i.test(trimmed)) {
            return false;
        }

        if (/^[+-]?\d+(?:\.\d+)?$/.test(trimmed)) {
            return false;
        }

        if (
            /[{};]|\$game|\$data|\$gameSwitches|\$gameVariables|\bMath\b|=>|\bthis\b/.test(trimmed)
        ) {
            return false;
        }

        return true;
    }

    _buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = entry?.text;
            if (!this.isUsableText(text)) {
                continue;
            }

            const sourceText = String(text);
            const cacheKey = runtime.getCacheKey(sourceText, this.getCacheType());
            if (byCacheKey.has(cacheKey)) {
                continue;
            }

            byCacheKey.set(cacheKey, {
                type: this.getCacheType(),
                id: `plugin_yep_battle_engine_core_${byCacheKey.size}`,
                value: sourceText,
                cacheKey,
            });
        }

        return Array.from(byCacheKey.values());
    }
}
