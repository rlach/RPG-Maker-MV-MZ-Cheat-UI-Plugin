import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * ItemNameEscape.js translator
 *
 * Supported plugin versions:
 * - 1.0.1 (MV), native escape conversion without PluginManagerEx
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

function isWritable(object, field) {
    for (let owner = object; owner; owner = Object.getPrototypeOf(owner)) {
        const descriptor = Object.getOwnPropertyDescriptor(owner, field);
        if (descriptor) return 'value' in descriptor ? descriptor.writable : !!descriptor.set;
    }
    return Object.isExtensible(object);
}

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
        const translator = this;
        DataManager.convertName = function (data) {
            const target = data;
            if (
                data &&
                ['name', 'description', 'preName', 'preDescription', '_translateOriginal'].some(
                    (field) => !isWritable(data, field)
                )
            ) {
                // DynamicDatabase owns getter-only fields. Convert on a plain
                // working copy without replacing its live property descriptors.
                data = { ...data };
            }
            const convert = () => {
                const result = originalConvertName.call(this, data);
                if (data && data !== target) {
                    for (const field of ['name', 'description', '_translateOriginal'])
                        if (isWritable(target, field)) target[field] = data[field];
                }
                return result;
            };
            if (data) {
                for (const [field, sourceField] of [
                    ['name', 'preName'],
                    ['description', 'preDescription'],
                ]) {
                    if (translator.isUsableText(data[sourceField])) {
                        data._translateOriginal = {
                            ...data._translateOriginal,
                            [field]: data[sourceField],
                        };
                    }
                }
            }
            const runtime = translator.getRuntime();
            if (!data || !translator.isRuntimeTranslationActive(runtime)) return convert();
            const preName = data.preName;
            const preDescription = data.preDescription;
            try {
                for (const [field, sourceField, types] of [
                    ['name', 'preName', NAME_CACHE_TYPES],
                    ['description', 'preDescription', DESCRIPTION_CACHE_TYPES],
                ]) {
                    const source = data[sourceField] ?? data._translateOriginal?.[field];
                    if (!translator.isUsableText(source)) continue;
                    const translated = translator.resolveRuntimeTranslation(
                        source,
                        runtime,
                        types,
                        {
                            harvestMissing: false,
                        }
                    );
                    if (data[sourceField] != null) data[sourceField] = translated;
                    else data[field] = translated;
                }
                return convert();
            } finally {
                // The native plugin re-evaluates these sources on scene changes.
                // Keep their control codes available for future variable updates.
                if (preName !== undefined) data.preName = preName;
                if (preDescription !== undefined) data.preDescription = preDescription;
            }
        };

        const runtime = this.getRuntime();
        const originalApplyField = runtime.applyTranslatedFieldValueSafely;
        if (typeof originalApplyField === 'function') {
            runtime.applyTranslatedFieldValueSafely = function (options) {
                const assigned = originalApplyField.call(this, options);
                const sourceField = {
                    name: 'preName',
                    description: 'preDescription',
                }[options.field];
                if (assigned && sourceField && options.item[sourceField] != null) {
                    // Cache refreshes can run after the native scene/map refresh.
                    DataManager.convertName(options.item);
                }
                return assigned;
            };
        }

        return true;
    }

    collectUntranslated() {
        return [];
    }
}
