import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * AB_EnemyBook translator
 *
 * Plugin: AB_EnemyBook.js
 * Version: 1.27
 * Target: MV
 *
 * Notes:
 * - This plugin stores most UI terms/messages in plugin parameters, then captures them in
 *   closure variables inside the plugin IIFE.
 * - Runtime translation is applied at display-time draw points (enemy book windows / battle
 *   command additions), because rewriting plugin parameters after load does not update captured
 *   closure values.
 */

const CACHE_TYPE = 'plugin_ab_enemy_book';
const PLUGIN_NAME = 'AB_EnemyBook';

const TRANSLATABLE_PARAMETER_KEYS = [
    'EnemyBookCommandName',
    'EnemyBookAllCommandName',
    'Achievement',
    'UnknownEnemy',
    'UnknownData',
    'WeakElementName',
    'ResistElementName',
    'WeakStateName',
    'ResistStateName',
    'NoEffectStateName',
    'DefeatNumberName',
    'HitRateName',
    'AddEnemySkillMessage',
    'FailToAddEnemySkillMessage',
    'MissToAddEnemySkillMessage',
    'FailToCheckEnemySkillMessage',
];

export class ABEnemyBookTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
        this._enemyDescLineLookupCache = null;
        this._enemyDescLineLookupCacheSize = -1;
    }

    getPluginName() {
        return PLUGIN_NAME;
    }

    getPluginLabel() {
        return 'AB EnemyBook';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    _appendEntriesFromParameters(parameters, scope, output) {
        if (!parameters || typeof parameters !== 'object' || !Array.isArray(output)) {
            return;
        }

        for (const key of TRANSLATABLE_PARAMETER_KEYS) {
            const value = String(parameters[key] || '').trim();
            if (!this.isUsableText(value)) {
                continue;
            }

            output.push({
                text: value,
                source: {
                    scope,
                    key,
                },
            });
        }
    }

    _collectKnownSourceTexts() {
        const output = [];
        const pluginEntry = this.findPluginEntry();

        if (pluginEntry?.parameters) {
            this._appendEntriesFromParameters(
                pluginEntry.parameters,
                'pluginEntryParameter',
                output
            );
        }

        if (window.PluginManager && typeof PluginManager.parameters === 'function') {
            const runtimeParameters = PluginManager.parameters(this.getPluginName());
            this._appendEntriesFromParameters(
                runtimeParameters,
                'runtimePluginManagerParameter',
                output
            );
        }

        return output;
    }

    _buildKnownSourceTextSet(entries) {
        const set = new Set();
        if (!Array.isArray(entries)) {
            return set;
        }

        for (const entry of entries) {
            const text = String(entry?.text || '').trim();
            if (text) {
                set.add(text);
            }
        }

        return set;
    }

    _translateKnownPluginText(text, runtime, knownSourceTexts) {
        if (!this.isUsableText(text)) {
            return text;
        }

        const sourceText = String(text).trim();
        if (!knownSourceTexts.has(sourceText)) {
            return text;
        }

        return this.resolveRuntimeTranslation(sourceText, runtime, this.getCacheType(), {
            requireRuntimeTranslationActive: true,
        });
    }

    _parseDescLinesFromEnemyNote(noteText) {
        const descByLine = new Map();
        const note = typeof noteText === 'string' ? noteText : '';
        if (!note) {
            return descByLine;
        }

        const descTagPattern = /<desc(\d+)\s*:\s*([^>]+)>/gi;
        let match = null;
        while ((match = descTagPattern.exec(note)) !== null) {
            const lineNumber = Number(match[1]);
            const value = String(match[2] || '');
            if (!lineNumber || !this.isUsableText(value)) {
                continue;
            }

            descByLine.set(lineNumber, value);
        }

        return descByLine;
    }

    _resolveLineFromDescMaps(sourceLineText, sourceDescByLine, translatedDescByLine) {
        if (!this.isUsableText(sourceLineText)) {
            return sourceLineText;
        }

        const normalizedSourceLine = String(sourceLineText).trim();
        for (const [lineNumber, lineText] of sourceDescByLine.entries()) {
            if (String(lineText).trim() !== normalizedSourceLine) {
                continue;
            }

            const translatedLine = translatedDescByLine.get(lineNumber);
            if (this.isUsableText(translatedLine)) {
                return translatedLine;
            }
        }

        return sourceLineText;
    }

    _buildEnemyDescLineLookupFromCache(runtime) {
        const lookup = new Map();
        if (!runtime || !(runtime.translationCache instanceof Map)) {
            return lookup;
        }

        const prefix = runtime.getCacheKey('', 'enemy_note');
        for (const [cacheKey, translatedNote] of runtime.translationCache.entries()) {
            if (typeof cacheKey !== 'string' || !cacheKey.startsWith(prefix)) {
                continue;
            }

            if (!this.isUsableText(translatedNote)) {
                continue;
            }

            const sourceNote = cacheKey.slice(prefix.length);
            if (!this.isUsableText(sourceNote)) {
                continue;
            }

            const sourceDescByLine = this._parseDescLinesFromEnemyNote(sourceNote);
            const translatedDescByLine = this._parseDescLinesFromEnemyNote(translatedNote);
            if (sourceDescByLine.size <= 0 || translatedDescByLine.size <= 0) {
                continue;
            }

            for (const [lineNumber, sourceLine] of sourceDescByLine.entries()) {
                if (!this.isUsableText(sourceLine)) {
                    continue;
                }

                const translatedLine = translatedDescByLine.get(lineNumber);
                if (!this.isUsableText(translatedLine)) {
                    continue;
                }

                const normalizedSourceLine = String(sourceLine).trim();
                if (!lookup.has(normalizedSourceLine)) {
                    lookup.set(normalizedSourceLine, translatedLine);
                }
            }
        }

        return lookup;
    }

    _getEnemyDescLineLookup(runtime) {
        const currentCacheSize =
            runtime && runtime.translationCache instanceof Map ? runtime.translationCache.size : 0;

        if (
            this._enemyDescLineLookupCache &&
            this._enemyDescLineLookupCacheSize === currentCacheSize
        ) {
            return this._enemyDescLineLookupCache;
        }

        this._enemyDescLineLookupCache = this._buildEnemyDescLineLookupFromCache(runtime);
        this._enemyDescLineLookupCacheSize = currentCacheSize;
        return this._enemyDescLineLookupCache;
    }

    _resolveTranslatedEnemyDescriptionLine(enemy, sourceLineText, runtime) {
        if (!enemy || !this.isUsableText(sourceLineText)) {
            return sourceLineText;
        }

        const dataEnemy = typeof enemy.enemy === 'function' ? enemy.enemy() : null;
        const sourceNote = typeof dataEnemy?.note === 'string' ? dataEnemy.note : '';
        if (!this.isUsableText(sourceNote)) {
            return sourceLineText;
        }

        const translatedNote = this.resolveRuntimeTranslation(sourceNote, runtime, 'enemy_note', {
            requireRuntimeTranslationActive: true,
            harvestMissing: false,
        });

        if (!this.isUsableText(translatedNote) || translatedNote === sourceNote) {
            const fallbackLookup = this._getEnemyDescLineLookup(runtime);
            const fallbackTranslated = fallbackLookup.get(String(sourceLineText).trim());
            return this.isUsableText(fallbackTranslated) ? fallbackTranslated : sourceLineText;
        }

        const sourceDescByLine = this._parseDescLinesFromEnemyNote(sourceNote);
        const translatedDescByLine = this._parseDescLinesFromEnemyNote(translatedNote);
        if (sourceDescByLine.size <= 0 || translatedDescByLine.size <= 0) {
            const fallbackLookup = this._getEnemyDescLineLookup(runtime);
            const fallbackTranslated = fallbackLookup.get(String(sourceLineText).trim());
            return this.isUsableText(fallbackTranslated) ? fallbackTranslated : sourceLineText;
        }

        const directResolved = this._resolveLineFromDescMaps(
            sourceLineText,
            sourceDescByLine,
            translatedDescByLine
        );
        if (directResolved !== sourceLineText) {
            return directResolved;
        }

        const fallbackLookup = this._getEnemyDescLineLookup(runtime);
        const fallbackTranslated = fallbackLookup.get(String(sourceLineText).trim());
        return this.isUsableText(fallbackTranslated) ? fallbackTranslated : sourceLineText;
    }

    _wrapWindowDrawMethodsWithKnownTextTranslation(windowProto, methodName, knownSourceTexts) {
        if (!windowProto || typeof windowProto[methodName] !== 'function') {
            return false;
        }

        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const translateKnownPluginText = this._translateKnownPluginText.bind(this);
        const resolveTranslatedEnemyDescriptionLine =
            this._resolveTranslatedEnemyDescriptionLine.bind(this);
        const original = windowProto[methodName];
        windowProto[methodName] = function () {
            const runtime = getRuntime();
            if (!runtime || !isRuntimeTranslationActive(runtime)) {
                return original.apply(this, arguments);
            }

            const originalDrawText = this.drawText;
            const originalDrawTextEx = this.drawTextEx;

            try {
                if (typeof originalDrawText === 'function') {
                    const callOriginalDrawText = /** @type {any} */ (originalDrawText);
                    this.drawText = function (text, x, y, maxWidth, align) {
                        const translated = translateKnownPluginText(
                            text,
                            runtime,
                            knownSourceTexts
                        );
                        return callOriginalDrawText.call(this, translated, x, y, maxWidth, align);
                    };
                }

                if (typeof originalDrawTextEx === 'function') {
                    const callOriginalDrawTextEx = /** @type {any} */ (originalDrawTextEx);
                    this.drawTextEx = function (text, x, y) {
                        const descTranslated = resolveTranslatedEnemyDescriptionLine(
                            this['_enemy'],
                            text,
                            runtime
                        );
                        const translated = translateKnownPluginText(
                            descTranslated,
                            runtime,
                            knownSourceTexts
                        );
                        return callOriginalDrawTextEx.call(this, translated, x, y);
                    };
                }

                return original.apply(this, arguments);
            } catch (error) {
                console.warn(
                    `[ABEnemyBookTranslator] Failed to apply runtime translation in ${methodName}`,
                    error
                );
                return original.apply(this, arguments);
            } finally {
                this.drawText = originalDrawText;
                this.drawTextEx = originalDrawTextEx;
            }
        };

        return true;
    }

    _translatePartyCommandBySymbol(windowInstance, symbol, runtime, knownSourceTexts) {
        if (!windowInstance || !Array.isArray(windowInstance._list)) {
            return;
        }

        const command = windowInstance._list.find((entry) => entry?.symbol === symbol);
        if (!command || !this.isUsableText(command.name)) {
            return;
        }

        command.name = this._translateKnownPluginText(command.name, runtime, knownSourceTexts);
    }

    enablePluginTranslation() {
        const globalScope = /** @type {any} */ (globalThis);
        const EnemyBookPercentWindow = globalScope.Window_EnemyBookPercent;
        const EnemyBookIndexWindow = globalScope.Window_EnemyBookIndex;
        const EnemyBookStatusWindow = globalScope.Window_EnemyBookStatus;
        const PartyCommandWindow = globalScope.Window_PartyCommand;
        const BattleLogWindow = globalScope.Window_BattleLog;

        const hasPercentRefresh =
            !!EnemyBookPercentWindow &&
            !!EnemyBookPercentWindow.prototype &&
            typeof EnemyBookPercentWindow.prototype.refresh === 'function';
        const hasIndexDrawItem =
            !!EnemyBookIndexWindow &&
            !!EnemyBookIndexWindow.prototype &&
            typeof EnemyBookIndexWindow.prototype.drawItem === 'function';
        const hasStatusRefresh =
            !!EnemyBookStatusWindow &&
            !!EnemyBookStatusWindow.prototype &&
            typeof EnemyBookStatusWindow.prototype.refresh === 'function';
        const hasPartyCommandHooks =
            !!PartyCommandWindow &&
            !!PartyCommandWindow.prototype &&
            typeof PartyCommandWindow.prototype.addEnemyBookCommand === 'function' &&
            typeof PartyCommandWindow.prototype.addAllEnemyBookCommand === 'function';
        const hasBattleLogPush =
            !!BattleLogWindow &&
            !!BattleLogWindow.prototype &&
            typeof BattleLogWindow.prototype.push === 'function';

        if (
            !hasPercentRefresh ||
            !hasIndexDrawItem ||
            !hasStatusRefresh ||
            !hasPartyCommandHooks ||
            !hasBattleLogPush
        ) {
            return false;
        }

        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const collectKnownSourceTexts = this._collectKnownSourceTexts.bind(this);
        const translateKnownPluginText = this._translateKnownPluginText.bind(this);
        const translatePartyCommandBySymbol = this._translatePartyCommandBySymbol.bind(this);

        const getKnownSourceTexts = () => {
            return this._buildKnownSourceTextSet(collectKnownSourceTexts());
        };

        this._wrapWindowDrawMethodsWithKnownTextTranslation(
            EnemyBookPercentWindow.prototype,
            'refresh',
            getKnownSourceTexts()
        );
        this._wrapWindowDrawMethodsWithKnownTextTranslation(
            EnemyBookIndexWindow.prototype,
            'drawItem',
            getKnownSourceTexts()
        );
        this._wrapWindowDrawMethodsWithKnownTextTranslation(
            EnemyBookStatusWindow.prototype,
            'refresh',
            getKnownSourceTexts()
        );

        const originalAddEnemyBookCommand = PartyCommandWindow.prototype.addEnemyBookCommand;
        PartyCommandWindow.prototype.addEnemyBookCommand = function () {
            const result = originalAddEnemyBookCommand.apply(this, arguments);
            try {
                const runtime = getRuntime();
                if (runtime && isRuntimeTranslationActive(runtime)) {
                    translatePartyCommandBySymbol(
                        this,
                        'enemybook',
                        runtime,
                        getKnownSourceTexts()
                    );
                }
            } catch (error) {
                console.warn(
                    '[ABEnemyBookTranslator] Failed to apply runtime translation for enemybook command',
                    error
                );
            }

            return result;
        };

        const originalAddAllEnemyBookCommand = PartyCommandWindow.prototype.addAllEnemyBookCommand;
        PartyCommandWindow.prototype.addAllEnemyBookCommand = function () {
            const result = originalAddAllEnemyBookCommand.apply(this, arguments);
            try {
                const runtime = getRuntime();
                if (runtime && isRuntimeTranslationActive(runtime)) {
                    translatePartyCommandBySymbol(
                        this,
                        'allenemybook',
                        runtime,
                        getKnownSourceTexts()
                    );
                }
            } catch (error) {
                console.warn(
                    '[ABEnemyBookTranslator] Failed to apply runtime translation for allenemybook command',
                    error
                );
            }

            return result;
        };

        const originalLogPush = BattleLogWindow.prototype.push;
        BattleLogWindow.prototype.push = function (methodName) {
            try {
                if (methodName === 'addText' && arguments.length > 1) {
                    const runtime = getRuntime();
                    const knownSourceTexts = getKnownSourceTexts();
                    arguments[1] = translateKnownPluginText(
                        arguments[1],
                        runtime,
                        knownSourceTexts
                    );
                }
            } catch (error) {
                console.warn(
                    '[ABEnemyBookTranslator] Failed to apply runtime translation for battle log text',
                    error
                );
            }

            return originalLogPush.apply(this, arguments);
        };

        return true;
    }

    async precomputeCounts() {
        if (!this.ensureDetection()) {
            return;
        }

        if (this._scanPrepared) {
            return;
        }

        if (this._scanPromise) {
            return this._scanPromise;
        }

        this._scanPromise = Promise.resolve(this.buildScanEntries())
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[ABEnemyBookTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        return this._collectKnownSourceTexts();
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_ab_enemy_book_${byCacheKey.size}`,
                    value: text,
                    cacheKey,
                });
            }
        }

        return Array.from(byCacheKey.values());
    }

    collectUntranslated({ runtime }) {
        if (!runtime) {
            return [];
        }

        const items = this.buildUniquePendingItems(runtime);
        return items.filter((item) => !runtime.hasUsableCacheValue(item.cacheKey));
    }

    getCachedCountsSync({ runtime }) {
        if (!runtime) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        const items = this.buildUniquePendingItems(runtime);
        const totalStrings = items.length;
        const leftStrings = items.filter(
            (item) => !runtime.hasUsableCacheValue(item.cacheKey)
        ).length;

        return {
            total: totalStrings,
            left: leftStrings,
            totalStrings,
            leftStrings,
        };
    }
}
