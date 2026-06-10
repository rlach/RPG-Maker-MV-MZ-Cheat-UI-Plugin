import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * FTKR_SkillExpansion translator
 *
 * Plugin: FTKR_SkillExpansion.js
 * Supported versions:
 * - v1.3.4 (MV): per-actor expanded skill objects (`sepSkill`) and dynamic skill descriptions.
 *
 * Notes:
 * - This translator is runtime-only by design and does not register plugin-specific
 *   mass-translation keys.
 * - FTKR_SkillExpansion can rebuild/clone skill payloads after base cache application;
 *   hooks below immediately re-apply cached skill translations when that happens.
 * - It reuses existing cache types (`skill_name`, `skill_description`, `skill_message1`,
 *   `skill_message2`) and does not introduce plugin-owned translation keys.
 */

const CACHE_TYPE = 'plugin_ftkr_skill_expansion';

const SKILL_FIELD_CACHE_TYPES = Object.freeze({
    name: ['skill_name'],
    description: ['skill_description'],
    message1: ['skill_message1'],
    message2: ['skill_message2'],
});

function resolveNumber(value) {
    return Number(value) || 0;
}

export class FtkrSkillExpansionTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'FTKR_SkillExpansion';
    }

    getPluginLabel() {
        return 'FTKR SkillExpansion';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    // Runtime-only translator: never contribute plugin-specific mass-translation entries.
    async precomputeCounts() {
        return;
    }

    collectUntranslated() {
        return [];
    }

    getCachedCountsSync() {
        return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
    }

    readSkillSourceText(skill, field) {
        const originalFromSkill = skill?._translateOriginal?.[field];
        if (this.isUsableText(originalFromSkill)) {
            return originalFromSkill;
        }

        const skillId = resolveNumber(skill?.id);
        const baseSkill = Array.isArray(globalThis.$dataSkills)
            ? globalThis.$dataSkills[skillId]
            : null;
        const originalFromBase = baseSkill?._translateOriginal?.[field];
        if (this.isUsableText(originalFromBase)) {
            return originalFromBase;
        }

        const baseValue = baseSkill?.[field];
        if (this.isUsableText(baseValue)) {
            return baseValue;
        }

        const currentValue = skill?.[field];
        return this.isUsableText(currentValue) ? currentValue : '';
    }

    translateSkillField(skill, field, runtime) {
        const sourceText = this.readSkillSourceText(skill, field);
        if (!this.isUsableText(sourceText)) {
            return false;
        }

        const cacheTypes = SKILL_FIELD_CACHE_TYPES[field] || [];
        if (!cacheTypes.length) {
            return false;
        }

        const translated = this.resolveRuntimeTranslation(sourceText, runtime, cacheTypes, {
            requireRuntimeTranslationActive: true,
            missValue: sourceText,
        });

        if (!this.isUsableText(translated) || translated === skill[field]) {
            return false;
        }

        skill[field] = translated;
        return true;
    }

    translateDescriptionSlots(skill, runtime) {
        const processList = (list) => {
            if (!Array.isArray(list)) {
                return;
            }

            for (const entry of list) {
                if (!entry || typeof entry !== 'object') {
                    continue;
                }

                const sourceDescription = this.isUsableText(entry._translateOriginalDescription)
                    ? entry._translateOriginalDescription
                    : entry.description;
                if (!this.isUsableText(sourceDescription)) {
                    continue;
                }

                if (!this.isUsableText(entry._translateOriginalDescription)) {
                    entry._translateOriginalDescription = sourceDescription;
                }

                const translated = this.resolveRuntimeTranslation(
                    sourceDescription,
                    runtime,
                    ['skill_description'],
                    {
                        requireRuntimeTranslationActive: true,
                        missValue: sourceDescription,
                    }
                );

                if (this.isUsableText(translated)) {
                    entry.description = translated;
                }
            }
        };

        processList(skill?.descs);
        processList(skill?.sep?.descs);
    }

    applyRuntimeTranslationsToSkill(skill, runtime = this.getRuntime()) {
        if (!skill || typeof skill !== 'object' || !this.isRuntimeTranslationActive(runtime)) {
            return skill;
        }

        for (const field of Object.keys(SKILL_FIELD_CACHE_TYPES)) {
            this.translateSkillField(skill, field, runtime);
        }

        this.translateDescriptionSlots(skill, runtime);
        return skill;
    }

    applyRuntimeTranslationsToSkillCollection(skills, runtime = this.getRuntime()) {
        if (!Array.isArray(skills) || !this.isRuntimeTranslationActive(runtime)) {
            return skills;
        }

        for (const skill of skills) {
            this.applyRuntimeTranslationsToSkill(skill, runtime);
        }

        return skills;
    }

    enablePluginTranslation() {
        const gameActorPrototype = globalThis.Game_Actor?.prototype;
        if (
            !gameActorPrototype ||
            typeof gameActorPrototype.setSepSkill !== 'function' ||
            typeof gameActorPrototype.getSkill !== 'function' ||
            typeof gameActorPrototype.skills !== 'function'
        ) {
            return false;
        }

        if (!globalThis.DataManager || typeof DataManager.makeSepData !== 'function') {
            return false;
        }

        if (
            globalThis.Window_Help?.prototype &&
            typeof Window_Help.prototype.setItem !== 'function'
        ) {
            return false;
        }

        const applyRuntimeTranslationsToSkill = this.applyRuntimeTranslationsToSkill.bind(this);
        const applyRuntimeTranslationsToSkillCollection =
            this.applyRuntimeTranslationsToSkillCollection.bind(this);

        if (!DataManager.__CHEAT_FTKR_SKILL_EXPANSION_MAKE_SEP_DATA_HOOKED__) {
            const originalMakeSepData = DataManager.makeSepData;

            DataManager.makeSepData = function (skill) {
                const result = originalMakeSepData.apply(this, arguments);

                try {
                    applyRuntimeTranslationsToSkill(skill);
                } catch (error) {
                    console.warn(
                        '[FtkrSkillExpansionTranslator] Failed to apply translation after DataManager.makeSepData',
                        error
                    );
                }

                return result;
            };

            Object.defineProperty(
                DataManager,
                '__CHEAT_FTKR_SKILL_EXPANSION_MAKE_SEP_DATA_HOOKED__',
                {
                    value: true,
                    configurable: true,
                    enumerable: false,
                    writable: false,
                }
            );
        }

        if (!gameActorPrototype.__CHEAT_FTKR_SKILL_EXPANSION_SET_SEP_SKILL_HOOKED__) {
            const originalSetSepSkill = gameActorPrototype.setSepSkill;

            gameActorPrototype.setSepSkill = function () {
                const sepSkill = originalSetSepSkill.apply(this, arguments);

                try {
                    applyRuntimeTranslationsToSkill(sepSkill);
                } catch (error) {
                    console.warn(
                        '[FtkrSkillExpansionTranslator] Failed to apply translation in Game_Actor.setSepSkill',
                        error
                    );
                }

                return sepSkill;
            };

            Object.defineProperty(
                gameActorPrototype,
                '__CHEAT_FTKR_SKILL_EXPANSION_SET_SEP_SKILL_HOOKED__',
                {
                    value: true,
                    configurable: true,
                    enumerable: false,
                    writable: false,
                }
            );
        }

        if (!gameActorPrototype.__CHEAT_FTKR_SKILL_EXPANSION_SEP_SKILL_HOOKED__) {
            const originalSepSkill = gameActorPrototype.sepSkill;

            gameActorPrototype.sepSkill = function () {
                const skill = originalSepSkill.apply(this, arguments);

                try {
                    applyRuntimeTranslationsToSkill(skill);
                } catch (error) {
                    console.warn(
                        '[FtkrSkillExpansionTranslator] Failed to apply translation in Game_Actor.sepSkill',
                        error
                    );
                }

                return skill;
            };

            Object.defineProperty(
                gameActorPrototype,
                '__CHEAT_FTKR_SKILL_EXPANSION_SEP_SKILL_HOOKED__',
                {
                    value: true,
                    configurable: true,
                    enumerable: false,
                    writable: false,
                }
            );
        }

        if (!gameActorPrototype.__CHEAT_FTKR_SKILL_EXPANSION_GET_SKILL_HOOKED__) {
            const originalGetSkill = gameActorPrototype.getSkill;

            gameActorPrototype.getSkill = function () {
                const skill = originalGetSkill.apply(this, arguments);

                try {
                    applyRuntimeTranslationsToSkill(skill);
                } catch (error) {
                    console.warn(
                        '[FtkrSkillExpansionTranslator] Failed to apply translation in Game_Actor.getSkill',
                        error
                    );
                }

                return skill;
            };

            Object.defineProperty(
                gameActorPrototype,
                '__CHEAT_FTKR_SKILL_EXPANSION_GET_SKILL_HOOKED__',
                {
                    value: true,
                    configurable: true,
                    enumerable: false,
                    writable: false,
                }
            );
        }

        if (!gameActorPrototype.__CHEAT_FTKR_SKILL_EXPANSION_SKILLS_HOOKED__) {
            const originalSkills = gameActorPrototype.skills;

            gameActorPrototype.skills = function () {
                const skills = originalSkills.apply(this, arguments);

                try {
                    applyRuntimeTranslationsToSkillCollection(skills);
                } catch (error) {
                    console.warn(
                        '[FtkrSkillExpansionTranslator] Failed to apply translation in Game_Actor.skills',
                        error
                    );
                }

                return skills;
            };

            Object.defineProperty(
                gameActorPrototype,
                '__CHEAT_FTKR_SKILL_EXPANSION_SKILLS_HOOKED__',
                {
                    value: true,
                    configurable: true,
                    enumerable: false,
                    writable: false,
                }
            );
        }

        if (
            globalThis.Window_Help?.prototype &&
            !Window_Help.prototype.__CHEAT_FTKR_SKILL_EXPANSION_HELP_SET_ITEM_HOOKED__
        ) {
            const originalSetItem = Window_Help.prototype.setItem;

            Window_Help.prototype.setItem = function () {
                const item = arguments[0];
                try {
                    applyRuntimeTranslationsToSkill(item);
                } catch (error) {
                    console.warn(
                        '[FtkrSkillExpansionTranslator] Failed to apply translation in Window_Help.setItem',
                        error
                    );
                }

                return originalSetItem.apply(this, arguments);
            };

            Object.defineProperty(
                Window_Help.prototype,
                '__CHEAT_FTKR_SKILL_EXPANSION_HELP_SET_ITEM_HOOKED__',
                {
                    value: true,
                    configurable: true,
                    enumerable: false,
                    writable: false,
                }
            );
        }

        return true;
    }
}
