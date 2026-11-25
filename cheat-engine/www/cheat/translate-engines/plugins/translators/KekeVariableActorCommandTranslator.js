import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely, parseStructArraySafely } from './TranslatorHelpers.js';

const CACHE_TYPE = 'plugin_keke_variable_actor_command';

const COMMAND_CACHE_TYPES = [CACHE_TYPE, 'command', 'skillType', 'skill_name', 'item_name'];
const HELP_CACHE_TYPES = [CACHE_TYPE, 'skill_description', 'item_description'];

const DATABASE_SOURCES = [
    ['Actors', '$dataActors'],
    ['Classes', '$dataClasses'],
    ['Skills', '$dataSkills'],
    ['Items', '$dataItems'],
    ['Weapons', '$dataWeapons'],
    ['Armors', '$dataArmors'],
    ['States', '$dataStates'],
    ['Enemies', '$dataEnemies'],
];

const COMMAND_NOTE_REGEX = /<(?:コマンド|cmd|command)\s*:([^>]*)>/gi;

/**
 * Keke_VariableActorCommand (v1.1.0 - v1.2.8 MZ)
 *
 * Translates custom battle actor commands and help descriptions configured via
 * <コマンド:...>, <cmd:...>, and <command:...> note tags as well as plugin parameters
 * (用語・自動戦闘 and ヘルプ登録).
 *
 * Also preserves original skillType and database note lookups when skillTypes or notes
 * have been translated in-place, and resolves command display names against existing
 * skill_name, skillType, item_name, and command translation caches without harvesting
 * duplicate empty keys.
 */
export class KekeVariableActorCommandTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanPromise = null;
        this._scanEntries = [];
    }

    getPluginName() {
        return 'Keke_VariableActorCommand';
    }

    getPluginLabel() {
        return 'Keke VariableActorCommand';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    getPluginParameters() {
        const entry = this.findPluginEntry(this.getPluginName());
        if (entry?.parameters && typeof entry.parameters === 'object') {
            return entry.parameters;
        }

        const managerParams = window.PluginManager?.parameters?.(this.getPluginName());
        return managerParams && typeof managerParams === 'object' ? managerParams : null;
    }

    resolveFromCacheTypes(text, runtime, cacheTypes) {
        if (!this.isUsableText(text) || !this.isRuntimeTranslationActive(runtime)) {
            return text;
        }

        const translated = this.resolveRuntimeTranslation(text, runtime, cacheTypes, {
            requireRuntimeTranslationActive: true,
            missValue: null,
            harvestMissing: false,
        });

        if (this.isUsableText(translated)) {
            return translated;
        }

        const primaryCacheKey = runtime.getCacheKey(text, CACHE_TYPE);
        runtime.trackCacheKeyUsage(primaryCacheKey, { harvestMissing: true });
        return text;
    }

    translateActorCommandList(commandWindow, runtime) {
        if (!Array.isArray(commandWindow?._list)) {
            return;
        }

        const isActive = this.isRuntimeTranslationActive(runtime);
        for (const entry of commandWindow._list) {
            if (!entry || typeof entry !== 'object') {
                continue;
            }

            if (typeof entry.name === 'string' && entry.name.trim() !== '') {
                if (!this.isUsableText(entry._kekeOriginalName)) {
                    entry._kekeOriginalName = entry.name;
                }

                const sourceName = entry._kekeOriginalName;
                entry.name = isActive
                    ? this.resolveFromCacheTypes(sourceName, runtime, COMMAND_CACHE_TYPES)
                    : sourceName;
            }

            if (typeof entry.helpText === 'string' && entry.helpText.trim() !== '') {
                if (!this.isUsableText(entry._kekeOriginalHelpText)) {
                    entry._kekeOriginalHelpText = entry.helpText;
                }

                const sourceHelp = entry._kekeOriginalHelpText;
                entry.helpText = isActive
                    ? this.resolveFromCacheTypes(sourceHelp, runtime, HELP_CACHE_TYPES)
                    : sourceHelp;
            }
        }
    }

    extractCommandNoteEntriesFromText(noteText, addEntry) {
        if (!this.isUsableText(noteText)) {
            return;
        }

        COMMAND_NOTE_REGEX.lastIndex = 0;
        let match;
        while ((match = COMMAND_NOTE_REGEX.exec(noteText)) !== null) {
            const rawBody = String(match[1] || '').replace(/\s/g, '');
            if (!rawBody) {
                continue;
            }

            const parts = rawBody.split(',');
            const typePart = parts[0] || '';
            if (typePart.startsWith('-')) {
                continue;
            }

            const displayName = (parts[2] || '').trim();
            if (this.isUsableText(displayName)) {
                addEntry(displayName, COMMAND_CACHE_TYPES);
            }
        }
    }

    collectParameterEntries(addEntry) {
        const params = this.getPluginParameters();
        if (!params) {
            return;
        }

        const autoBattleWord = String(params['用語・自動戦闘'] || '').trim();
        if (this.isUsableText(autoBattleWord)) {
            addEntry(autoBattleWord, COMMAND_CACHE_TYPES);
        }

        for (const item of parseStructArraySafely(params['ヘルプ登録'])) {
            const helpText = String(item?.['テキスト'] || '');
            if (this.isUsableText(helpText)) {
                addEntry(helpText, HELP_CACHE_TYPES);
            }
        }
    }

    collectLoadedDatabaseEntries(addEntry) {
        let foundDatabase = false;
        for (const [, globalKey] of DATABASE_SOURCES) {
            const list = window[globalKey];
            if (!Array.isArray(list)) {
                continue;
            }

            foundDatabase = true;
            for (const item of list) {
                if (!item || typeof item !== 'object') {
                    continue;
                }

                const noteText =
                    typeof item._translateOriginal?.note === 'string'
                        ? item._translateOriginal.note
                        : item.note;
                this.extractCommandNoteEntriesFromText(noteText, addEntry);
            }
        }
        return foundDatabase;
    }

    enablePluginTranslation() {
        const actorCommandProto = window.Window_ActorCommand?.prototype;
        if (!actorCommandProto) {
            return false;
        }

        const translator = this;
        const getRuntime = this.getRuntime.bind(this);

        /**
         * Temporarily patches skillTypes.indexOf to fall back to the original
         * (pre-translation) array when a lookup fails, and temporarily restores
         * original database note fields if any notes were translated in-place.
         */
        const withOriginalSkillTypesAndNotes = (fn) => {
            const currentSkillTypes = window.$dataSystem?.skillTypes;
            const originalSkillTypes = window.$dataSystem?.skillTypesOriginal;
            let savedIndexOf = null;

            if (Array.isArray(currentSkillTypes) && Array.isArray(originalSkillTypes)) {
                savedIndexOf = currentSkillTypes.indexOf;
                currentSkillTypes.indexOf = function (searchElement, fromIndex) {
                    const idx = savedIndexOf.call(this, searchElement, fromIndex);
                    if (idx >= 0) {
                        return idx;
                    }
                    return originalSkillTypes.indexOf(searchElement, fromIndex);
                };
            }

            const restoredNotes = [];
            for (const [, globalKey] of DATABASE_SOURCES) {
                const list = window[globalKey];
                if (!Array.isArray(list)) {
                    continue;
                }

                for (const item of list) {
                    if (
                        item &&
                        typeof item._translateOriginal?.note === 'string' &&
                        item.note !== item._translateOriginal.note
                    ) {
                        restoredNotes.push({ item, translatedNote: item.note });
                        item.note = item._translateOriginal.note;
                    }
                }
            }

            try {
                return fn();
            } finally {
                if (savedIndexOf && Array.isArray(currentSkillTypes)) {
                    currentSkillTypes.indexOf = savedIndexOf;
                }
                for (let i = restoredNotes.length - 1; i >= 0; i--) {
                    const { item, translatedNote } = restoredNotes[i];
                    item.note = translatedNote;
                }
            }
        };

        if (typeof actorCommandProto.makeCommandListFreeKe === 'function') {
            // Old version (≤1.1.0): skill-type lookup lives in the prototype method.
            const original = actorCommandProto.makeCommandListFreeKe;
            actorCommandProto.makeCommandListFreeKe = function () {
                const runtime = getRuntime();
                const result = withOriginalSkillTypesAndNotes(() =>
                    original.apply(this, arguments)
                );
                translator.translateActorCommandList(this, runtime);
                return result;
            };
        } else if (typeof actorCommandProto.makeCommandList === 'function') {
            // New version (1.2.7+): makeCommandListFree is a private module closure
            // called from makeCommandList; we patch makeCommandList as the entry point.
            const original = actorCommandProto.makeCommandList;
            actorCommandProto.makeCommandList = function () {
                const runtime = getRuntime();
                const result = withOriginalSkillTypesAndNotes(() =>
                    original.apply(this, arguments)
                );
                translator.translateActorCommandList(this, runtime);
                return result;
            };
        } else {
            return false;
        }

        return true;
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
                console.warn('[KekeVariableActorCommandTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entriesByText = new Map();
        const addEntry = (text, candidateCacheTypes = COMMAND_CACHE_TYPES) => {
            if (!this.isUsableText(text) || entriesByText.has(text)) {
                return;
            }
            entriesByText.set(text, {
                text,
                candidateCacheTypes,
            });
        };

        this.collectParameterEntries(addEntry);

        for (const [fileName, globalKey] of DATABASE_SOURCES) {
            let list = window[globalKey];
            if (!Array.isArray(list) && typeof fetch === 'function') {
                try {
                    const response = await fetch(`data/${fileName}.json`);
                    if (response?.ok) {
                        const parsed = parseJsonSafely(await response.text(), null);
                        if (Array.isArray(parsed)) {
                            list = parsed;
                        }
                    }
                } catch {
                    // Ignore unavailable database files in partial test environments
                }
            }

            if (!Array.isArray(list)) {
                continue;
            }

            for (const item of list) {
                if (!item || typeof item !== 'object') {
                    continue;
                }

                const noteText =
                    typeof item._translateOriginal?.note === 'string'
                        ? item._translateOriginal.note
                        : item.note;
                this.extractCommandNoteEntriesFromText(noteText, addEntry);
            }
        }

        return Array.from(entriesByText.values());
    }

    getEffectiveScanEntries() {
        if (this._scanEntries.length > 0) {
            return this._scanEntries;
        }

        const entriesByText = new Map();
        const addEntry = (text, candidateCacheTypes = COMMAND_CACHE_TYPES) => {
            if (!this.isUsableText(text) || entriesByText.has(text)) {
                return;
            }
            entriesByText.set(text, {
                text,
                candidateCacheTypes,
            });
        };

        this.collectParameterEntries(addEntry);
        this.collectLoadedDatabaseEntries(addEntry);
        return Array.from(entriesByText.values());
    }

    isEntryTranslated(entry, runtime) {
        const candidateTypes = Array.isArray(entry?.candidateCacheTypes)
            ? entry.candidateCacheTypes
            : COMMAND_CACHE_TYPES;

        return candidateTypes.some((cacheType) =>
            runtime.hasUsableCacheValue(runtime.getCacheKey(entry.text, cacheType))
        );
    }

    buildPendingItems(runtime) {
        return this.getEffectiveScanEntries().map((entry, index) => ({
            type: CACHE_TYPE,
            id: `${CACHE_TYPE}_${index}`,
            value: entry.text,
            cacheKey: runtime.getCacheKey(entry.text, CACHE_TYPE),
            candidateCacheTypes: entry.candidateCacheTypes,
        }));
    }

    collectUntranslated({ runtime }) {
        if (!runtime) {
            return [];
        }

        return this.buildPendingItems(runtime).filter(
            (item) =>
                !item.candidateCacheTypes.some((cacheType) =>
                    runtime.hasUsableCacheValue(runtime.getCacheKey(item.value, cacheType))
                )
        );
    }

    getCachedCountsSync({ runtime }) {
        if (!runtime) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        const entries = this.getEffectiveScanEntries();
        const total = entries.length;
        const left = entries.filter((entry) => !this.isEntryTranslated(entry, runtime)).length;
        return {
            total,
            left,
            totalStrings: total,
            leftStrings: left,
        };
    }
}
