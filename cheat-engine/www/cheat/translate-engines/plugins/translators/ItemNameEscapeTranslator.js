import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * ItemNameEscape.js translator
 *
 * Supported plugin versions:
 * - 1.1.0 - 1.1.2 (MZ)
 *
 * Translation notes:
 * - ItemNameEscape stores control-character source strings in data.preName and
 *   data.preDescription, then restores display values from those fields through
 *   DataManager.convertName().
 * - This translator patches DataManager.convertName() so cached translations are
 *   applied to preName/preDescription before PluginManagerEx escape conversion.
 * - No additional scan/collection is performed; existing database cache keys are reused.
 */

const NAME_CACHE_TYPES = Object.freeze([
    'actor_name',
    'item_name',
    'skill_name',
    'class_name',
    'enemy_name',
    'armor_name',
    'weapon_name',
    'state_name',
]);

const DESCRIPTION_CACHE_TYPES = Object.freeze([
    'item_description',
    'skill_description',
    'armor_description',
    'weapon_description',
    'state_description',
]);

export class ItemNameEscapeTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'ItemNameEscape';
    }

    getPluginLabel() {
        return 'ItemNameEscape';
    }

    getCacheType() {
        return 'plugin_item_name_escape';
    }

    enablePluginTranslation() {
        if (typeof DataManager === 'undefined' || typeof DataManager.convertName !== 'function') {
            return false;
        }

        const originalConvertName = DataManager.convertName;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);
        const isUsableText = this.isUsableText.bind(this);

        DataManager.convertName = function (data) {
            try {
                const runtime = getRuntime();
                if (
                    runtime &&
                    isRuntimeTranslationActive(runtime) &&
                    data &&
                    typeof data === 'object'
                ) {
                    if (isUsableText(data.preName) && !!data.preName.set) {
                        const translatedPreName = resolveRuntimeTranslation(
                            data.preName,
                            runtime,
                            NAME_CACHE_TYPES,
                            {
                                requireRuntimeTranslationActive: true,
                                missValue: data.preName,
                                harvestMissing: false,
                            }
                        );

                        if (isUsableText(translatedPreName)) {
                            data.preName = translatedPreName;
                        }
                    }

                    if (isUsableText(data.preDescription) && !!data.preDescription.set) {
                        const translatedPreDescription = resolveRuntimeTranslation(
                            data.preDescription,
                            runtime,
                            DESCRIPTION_CACHE_TYPES,
                            {
                                requireRuntimeTranslationActive: true,
                                missValue: data.preDescription,
                                harvestMissing: false,
                            }
                        );

                        if (isUsableText(translatedPreDescription)) {
                            data.preDescription = translatedPreDescription;
                        }
                    }
                }
            } catch (error) {
                console.warn(
                    '[ItemNameEscapeTranslator] Failed to apply cached translation to preName/preDescription',
                    data
                );
                throw error;
            }

            return originalConvertName.apply(this, arguments);
        };

        return true;
    }

    collectUntranslated() {
        return [];
    }
}
