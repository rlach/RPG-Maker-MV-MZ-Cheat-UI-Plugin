import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/**
 * ChangeSlot translator
 *
 * Plugin: ChangeSlot.js
 * Supported versions:
 * - v1.4.7 (MZ): custom equip-slot composition and slot filtering tags.
 *
 * Notes:
 * - This plugin resolves configured slot names to etype IDs by comparing against
 *   $dataSystem.equipTypes text values.
 * - When equip-type names are translated in-place, that lookup can fail and produce
 *   undefined slot IDs. Runtime hook preserves original lookup data while rendering
 *   translated slot labels through equipType cache.
 */

const PLUGIN_NAME = 'ChangeSlot';
const CACHE_TYPE = 'plugin_change_slot';

const TRANSLATABLE_PARAMETER_KEYS = Object.freeze(['Slots', 'Type', 'Limit']);

export class ChangeSlotTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
        this._knownTexts = null;
    }

    getPluginName() {
        return PLUGIN_NAME;
    }

    getPluginLabel() {
        return 'ChangeSlot';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    appendEntry(output, text, source) {
        if (!Array.isArray(output) || !this.isUsableText(text)) {
            return;
        }

        output.push({ text: String(text), source });
    }

    appendParameterEntries(output, parameters, scope) {
        if (!Array.isArray(output) || !parameters || typeof parameters !== 'object') {
            return;
        }

        for (const key of TRANSLATABLE_PARAMETER_KEYS) {
            const value = parameters[key];
            if (!this.isUsableText(value)) {
                continue;
            }

            if (key === 'Slots') {
                const parsed = parseJsonSafely(value, []);
                if (Array.isArray(parsed)) {
                    for (let index = 0; index < parsed.length; index++) {
                        this.appendEntry(output, parsed[index], {
                            scope,
                            field: key,
                            index,
                        });
                    }
                    continue;
                }
            }

            this.appendEntry(output, value, {
                scope,
                field: key,
            });
        }
    }

    buildScanEntries() {
        const entries = [];

        const pluginEntry = this.findPluginEntry(this.getPluginName());
        if (pluginEntry?.parameters) {
            this.appendParameterEntries(entries, pluginEntry.parameters, 'pluginEntryParameters');
        }

        const pluginManager = window.PluginManager;
        if (pluginManager && typeof pluginManager.parameters === 'function') {
            const runtimeParameters = pluginManager.parameters(this.getPluginName());
            this.appendParameterEntries(
                entries,
                runtimeParameters,
                'runtimePluginManagerParameters'
            );
        }

        return entries;
    }

    async precomputeCounts() {
        if (this._scanPrepared) {
            return;
        }

        if (this._scanPromise) {
            return this._scanPromise;
        }

        this._scanPromise = Promise.resolve(this.buildScanEntries())
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this._knownTexts = null;
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[ChangeSlotTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    getKnownTexts() {
        if (this._knownTexts instanceof Set) {
            return this._knownTexts;
        }

        const entries = this._scanPrepared ? this._scanEntries : this.buildScanEntries();
        const known = new Set();

        for (const entry of entries) {
            const text = entry?.text;
            if (this.isUsableText(text)) {
                known.add(String(text));
            }
        }

        this._knownTexts = known;
        return known;
    }

    resolveEquipTypeDisplayName(etypeId, runtime) {
        const numericId = Number(etypeId) || 0;
        if (numericId <= 0) {
            return '';
        }

        const system = window.$dataSystem;
        const originalName =
            (Array.isArray(system?.equipTypesOriginal) && system.equipTypesOriginal[numericId]) ||
            (Array.isArray(system?.equipTypes) && system.equipTypes[numericId]) ||
            '';

        if (!this.isUsableText(originalName)) {
            return '';
        }

        return this.resolveRuntimeTranslation(originalName, runtime, 'equipType', {
            requireRuntimeTranslationActive: true,
            missValue: originalName,
        });
    }

    installEquipSlotsLogicGuard() {
        const gameActorPrototype = window.Game_Actor?.prototype;
        if (!gameActorPrototype || typeof gameActorPrototype.equipSlots !== 'function') {
            return false;
        }

        if (gameActorPrototype.__CHEAT_CHANGE_SLOT_EQUIP_SLOTS_HOOKED__) {
            return true;
        }

        const originalEquipSlots = gameActorPrototype.equipSlots;
        gameActorPrototype.equipSlots = function () {
            const system = window.$dataSystem;
            const originalTypes = Array.isArray(system?.equipTypesOriginal)
                ? system.equipTypesOriginal
                : null;

            if (!originalTypes) {
                return originalEquipSlots.apply(this, arguments);
            }

            const translatedTypes = system.equipTypes;
            system.equipTypes = originalTypes;
            try {
                return originalEquipSlots.apply(this, arguments);
            } finally {
                system.equipTypes = translatedTypes;
            }
        };

        gameActorPrototype.__CHEAT_CHANGE_SLOT_EQUIP_SLOTS_HOOKED__ = true;
        return true;
    }

    enablePluginTranslation() {
        const canHookEquipSlots =
            !!window.Game_Actor?.prototype &&
            typeof window.Game_Actor.prototype.equipSlots === 'function';

        if (!canHookEquipSlots) {
            console.log(
                '[ChangeSlotTranslator] Required plugin hooks are not available. ' +
                    'Equip slot names will not be translated.',
                canHookEquipSlots,
                typeof window.Game_Actor.prototype.equipSlots
            );
            return false;
        }

        return this.installEquipSlotsLogicGuard();
    }

    buildUniquePendingItems(runtime) {
        const entries = this._scanPrepared ? this._scanEntries : this.buildScanEntries();
        const byCacheKey = new Map();

        for (const entry of entries) {
            const text = entry?.text;
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (byCacheKey.has(cacheKey)) {
                continue;
            }

            byCacheKey.set(cacheKey, {
                type: this.getCacheType(),
                id: `plugin_change_slot_${byCacheKey.size}`,
                value: text,
                cacheKey,
            });
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
