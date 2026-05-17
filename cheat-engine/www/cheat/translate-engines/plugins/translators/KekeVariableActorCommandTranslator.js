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
        if (!window.Window_ActorCommand || !Window_ActorCommand.prototype) {
            return false;
        }

        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);

        /**
         * Temporarily patches skillTypes.indexOf to fall back to the original
         * (pre-translation) array when a lookup fails, then calls fn(), then
         * restores indexOf.  This lets Keke's skill-type-name → index resolution
         * work correctly even after skillTypes has been translated in-place.
         */
        const withOriginalSkillTypeIndexOf = (fn) => {
            const currentSkillTypes = window.$dataSystem?.skillTypes;
            const originalSkillTypes = window.$dataSystem?.skillTypesOriginal;
            if (!Array.isArray(currentSkillTypes) || !Array.isArray(originalSkillTypes)) {
                return fn();
            }

            const savedIndexOf = currentSkillTypes.indexOf;
            currentSkillTypes.indexOf = function (searchElement, fromIndex) {
                const idx = savedIndexOf.call(this, searchElement, fromIndex);
                if (idx >= 0) {
                    return idx;
                }
                return originalSkillTypes.indexOf(searchElement, fromIndex);
            };

            try {
                return fn();
            } finally {
                currentSkillTypes.indexOf = savedIndexOf;
            }
        };

        if (typeof Window_ActorCommand.prototype.makeCommandListFreeKe === 'function') {
            // Old version (≤1.1.0): skill-type lookup lives in the prototype method.
            const original = Window_ActorCommand.prototype.makeCommandListFreeKe;
            Window_ActorCommand.prototype.makeCommandListFreeKe = function () {
                const runtime = getRuntime();
                if (!isRuntimeTranslationActive(runtime)) {
                    return original.apply(this, arguments);
                }
                return withOriginalSkillTypeIndexOf(() => original.apply(this, arguments));
            };
        } else {
            // New version (1.2.7+): makeCommandListFree is a private module closure
            // called from makeCommandList; we patch makeCommandList as the entry point.
            const original = Window_ActorCommand.prototype.makeCommandList;
            Window_ActorCommand.prototype.makeCommandList = function () {
                const runtime = getRuntime();
                if (!isRuntimeTranslationActive(runtime)) {
                    return original.apply(this, arguments);
                }
                return withOriginalSkillTypeIndexOf(() => original.apply(this, arguments));
            };
        }
        return true;
    }

    async precomputeCounts() {
        return;
    }

    async buildScanEntries() {
        return [];
    }

    collectUntranslated() {
        return [];
    }

    getCachedCountsSync() {
        return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
    }
}
