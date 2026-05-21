/**
 * RJ269294 Game-Specific Translation Fix
 *
 * Fixes the 顔グラのっとり (Face Graphic Override) plugin which constructs
 * picture filenames from armor names. When armor names are translated,
 * the picture files can no longer be found on disk.
 *
 * This translator ensures the plugin always uses original (Japanese) armor
 * names for picture filename resolution while allowing translated names
 * to display everywhere else.
 *
 * Usage: Copy this file to www/cheat-settings/translate-cache/js/
 */

// Custom translators access BasePluginTranslator via the global reference
// exposed by the cheat engine loader. No fragile relative imports needed.
const BasePluginTranslator = globalThis.__CheatBasePluginTranslator;

export class RJ269294FaceGraphicFixTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._originalArmorNames = null;
    }

    getPluginName() {
        return '顔グラのっとり';
    }

    getPluginLabel() {
        return 'Face Graphic Override Fix (RJ269294)';
    }

    /**
     * Lazily captures original (untranslated) armor names from $dataArmors.
     * Called at detection time (before any translation mutates the data) and
     * again on first command101 invocation as a safety net.
     */
    _ensureOriginalArmorNames() {
        if (this._originalArmorNames !== null) {
            return this._originalArmorNames;
        }

        this._originalArmorNames = new Map();

        if (!Array.isArray(window.$dataArmors)) {
            return this._originalArmorNames;
        }

        for (const armor of window.$dataArmors) {
            if (armor && typeof armor.id === 'number' && typeof armor.name === 'string') {
                this._originalArmorNames.set(armor.id, armor.name);
            }
        }

        return this._originalArmorNames;
    }

    enablePluginTranslation() {
        // Capture original armor names now (before any translation pass mutates them).
        this._ensureOriginalArmorNames();

        if (typeof Game_Interpreter?.prototype?.command101 !== 'function') {
            return;
        }

        const translator = this;

        // The plugin already patched command101 to call 立ち絵表示 which reads
        // actor.equips()[1].name for picture filenames. We wrap the patched
        // version to temporarily restore original names during execution.
        const patchedCommand101 = Game_Interpreter.prototype.command101;

        Game_Interpreter.prototype.command101 = function () {
            const runtime = translator.getRuntime();
            if (!translator.isRuntimeTranslationActive(runtime)) {
                return patchedCommand101.apply(this, arguments);
            }

            const originals = translator._ensureOriginalArmorNames();
            const swapped = [];

            // Temporarily restore original armor names for picture filename resolution
            if (originals.size > 0 && Array.isArray(window.$dataArmors)) {
                for (const armor of window.$dataArmors) {
                    if (!armor || !originals.has(armor.id)) continue;

                    const current = armor.name;
                    const original = originals.get(armor.id);

                    if (current !== original) {
                        swapped.push({ armor, translated: current });
                        armor.name = original;
                    }
                }
            }

            try {
                return patchedCommand101.apply(this, arguments);
            } finally {
                // Restore translated names so everything else still shows translations
                for (const { armor, translated } of swapped) {
                    armor.name = translated;
                }
            }
        };
    }

    // This is a runtime fix only — no translatable strings to count.
    countPluginAmountSync() {
        return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
    }
}
