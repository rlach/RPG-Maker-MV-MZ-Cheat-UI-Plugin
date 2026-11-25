import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/**
 * BattleEro (MZ, RJ01751300 custom battle erotic mechanics plugin)
 *
 * Translates battle log messages (clothing destruction stages, pleasure gauge thresholds,
 * climax messages, bonus gold messages), the pleasure gauge label ("快感"), and the
 * "戦闘カットイン" option command label.
 */
export class BattleEroTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'BattleEro';
    }

    getPluginLabel() {
        return 'BattleEro';
    }

    getCacheType() {
        return 'plugin_battle_ero';
    }

    shouldScanEventData() {
        return false;
    }

    getCatalogCacheTypes() {
        return [this.getCacheType(), 'command', 'enemy_name', 'actor_name'];
    }

    resolveText(text, runtime, depth = 0, allowFragments = true) {
        const resolved = super.resolveText(text, runtime, depth, allowFragments);
        if (
            depth > 0 &&
            resolved === text &&
            this.isUsableText(text) &&
            this.isRuntimeTranslationActive(runtime)
        ) {
            return this.resolveRuntimeTranslation(
                text,
                runtime,
                ['enemy_name', 'actor_name', this.getCacheType()],
                {
                    requireRuntimeTranslationActive: true,
                    missValue: text,
                    harvestMissing: false,
                }
            );
        }
        return resolved;
    }
}
