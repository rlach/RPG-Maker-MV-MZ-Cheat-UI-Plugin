import { BasePluginTranslator } from '../BasePluginTranslator.js';

export class KekeVariableActorCommandTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'Keke_VariableActorCommand';
    }

    getPluginLabel() {
        return 'Keke VariableActorCommand';
    }

    getCacheType() {
        return 'plugin_keke_variable_actor_command';
    }

    enablePluginTranslation() {
        if (
            !window.Window_ActorCommand ||
            !Window_ActorCommand.prototype ||
            typeof Window_ActorCommand.prototype.makeCommandListFreeKe !== 'function'
        ) {
            return;
        }

        const originalMakeCommandListFreeKe = Window_ActorCommand.prototype.makeCommandListFreeKe;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);

        Window_ActorCommand.prototype.makeCommandListFreeKe = function () {
            const runtime = getRuntime();
            if (!isRuntimeTranslationActive(runtime)) {
                return originalMakeCommandListFreeKe.apply(this, arguments);
            }

            const currentSkillTypes = window.$dataSystem?.skillTypes;
            const originalSkillTypes = window.$dataSystem?.skillTypesOriginal;
            if (!Array.isArray(currentSkillTypes) || !Array.isArray(originalSkillTypes)) {
                return originalMakeCommandListFreeKe.apply(this, arguments);
            }

            const originalIndexOf = currentSkillTypes.indexOf;
            if (typeof originalIndexOf !== 'function') {
                return originalMakeCommandListFreeKe.apply(this, arguments);
            }

            currentSkillTypes.indexOf = function (searchElement, fromIndex) {
                const translatedIndex = originalIndexOf.call(this, searchElement, fromIndex);
                if (translatedIndex !== -1) {
                    return translatedIndex;
                }

                return originalSkillTypes.indexOf(searchElement, fromIndex);
            };

            try {
                return originalMakeCommandListFreeKe.apply(this, arguments);
            } finally {
                currentSkillTypes.indexOf = originalIndexOf;
            }
        };
    }

    async prepareTranslator() {
        return;
    }

    async buildScanEntries() {
        return [];
    }

    collectUntranslated() {
        return [];
    }

    countPluginAmountSync() {
        return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
    }
}