import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * SoR_BattleRingCommand_MZ_Alpha v1.21 (MZ).
 * Loads Com_<command name>[_disabled] through loadBattleCommandSprite.
 * Restore command/skill-type cache sources before the existing loader so game
 * patches (including EUL's ASCII filename mapping) still run normally.
 * Standard database scanning already collects these labels; no extra scan is needed.
 */
export class SoRBattleRingCommandTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'SoR_BattleRingCommand_MZ_Alpha';
    }

    getCacheType() {
        return 'plugin_sor_battle_ring_command';
    }

    collectUntranslated() {
        return [];
    }

    resolveCommandName(name, runtime) {
        let original;
        const keys = [];
        for (const type of ['command', 'skillType']) {
            const prefix = runtime.getCacheKey('', type);
            for (const [key, translated] of runtime.translationCache) {
                if (!key.startsWith(prefix) || !this.isUsableText(translated)) continue;
                const source = key.slice(prefix.length);
                if (!source || translated.trim() !== name.trim()) continue;
                // A shared translated label must not select an arbitrary asset.
                if (original !== undefined && original !== source) return name;
                original = source;
                keys.push(key);
            }
        }
        for (const key of keys) runtime.trackCacheKeyUsage(key, { harvestMissing: false });
        return original ?? name;
    }

    enablePluginTranslation() {
        if (typeof window.ImageManager?.loadBattleCommandSprite !== 'function') return false;
        const translator = this;
        const load = window.ImageManager.loadBattleCommandSprite;
        window.ImageManager.loadBattleCommandSprite = function (filename, ...args) {
            const runtime = translator.getRuntime();
            if (
                translator.isRuntimeTranslationActive(runtime) &&
                typeof filename === 'string' &&
                filename.startsWith('Com_')
            ) {
                const suffix = filename.endsWith('_disabled') ? '_disabled' : '';
                const name = filename.slice(4, suffix ? -suffix.length : undefined);
                filename = 'Com_' + translator.resolveCommandName(name, runtime) + suffix;
            }
            return load.call(this, filename, ...args);
        };
        return true;
    }
}
