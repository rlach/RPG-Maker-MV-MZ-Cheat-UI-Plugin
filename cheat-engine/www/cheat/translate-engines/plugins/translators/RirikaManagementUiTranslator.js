import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { createPositionalFormatCatalogEntry } from './TranslatorHelpers.js';

/** Ririka management family, MV v1.11. Translate presentation without changing
 * staff identities, schedule rules, ranking data or saved actor names.
 */
export class RirikaManagementUiTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'StaffList';
    }
    getPluginLabel() {
        return 'Ririka management UI';
    }
    getCacheType() {
        return 'plugin_ririka_management_ui';
    }
    detectPlugin() {
        return ['StaffList', 'Satsuei', 'RankingParams', 'ActorParam'].every(
            (name) => this.findPluginEntry(name)?.status
        );
    }
    getSourcePluginNames() {
        return [
            'vocab',
            'Status_Window',
            'EroStatus_Window',
            'Saba_EroStatus',
            'ActorSelectWindow',
            'Equip',
            'Layout',
            'Kigae',
            'Description',
            'ScenarioPlus',
            'Ninshin',
            'Option',
            'Menu',
            'Button',
            'Engine',
            'Upgrade',
            'Dialog',
            'Common',
            'Chokyo',
            'EroParams',
            'SkillTree',
            'Av',
            'AvResult',
            'Recording',
            'Balance',
            'Baisyun',
            'BaisyunParam',
            'AvHistory',
            'ClientParam',
            'AvParam',
            'AvJacket',
            'EroStatusParam',
            'Yado',
            'StaffList',
            'ActorParam',
            'Norm',
            'Ranking',
            'RankingParams',
            'WeekMenu',
            'Dousei',
            'Play',
            'Kumi',
            'Client',
            'Satsuei',
            'Recording2',
            'ReviewParams',
            'ScoreParams',
            'Info',
            'Arrange',
            'Schedule',
            'Calendar',
            'Property',
            'Ending',
            'Syusan',
            'Item',
            'Shop',
            'BalanceResult',
            'Medal',
            'SaveWindow',
        ];
    }
    shouldScanEventData() {
        return false;
    }
    collectSourceCatalog(source) {
        const catalog = super.collectSourceCatalog(source);
        catalog.entries = catalog.entries.map((entry) =>
            /%\d+/.test(entry.text)
                ? { ...entry, ...createPositionalFormatCatalogEntry(entry.text) }
                : entry
        );
        return catalog;
    }
    enablePluginTranslation() {
        if (!super.enablePluginTranslation()) return false;
        const prototype = window.Window_Base.prototype;
        const actorName = prototype.actorName;
        if (typeof actorName === 'function') {
            const translator = this;
            prototype.actorName = function (...args) {
                const name = actorName.apply(this, args);
                const runtime = translator.getRuntime();
                return translator.isRuntimeTranslationActive(runtime)
                    ? translator.resolveRuntimeTranslation(name, runtime, [
                          'actor_name',
                          translator.getCacheType(),
                      ])
                    : name;
            };
        }
        return true;
    }
}
