import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/** Keke_SpeedStarBattle (MZ, installed unversioned build).
 * Scans display literals and templates, preserving plugin configuration and logic.
 */
export class KekeSpeedStarBattleTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'Keke_SpeedStarBattle';
    }
    getPluginLabel() {
        return 'Keke Speed Star Battle';
    }
    getCacheType() {
        return 'plugin_keke_speed_star_battle';
    }
    shouldScanEventData() {
        return false;
    }
}
