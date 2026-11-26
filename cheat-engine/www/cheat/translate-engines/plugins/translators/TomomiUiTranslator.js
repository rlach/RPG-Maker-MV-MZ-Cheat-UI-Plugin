import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/** TOMOMI author suite (MZ, RJ01319798): original custom window labels,
 * display-variable assignments and map captions. Translation is confined to
 * drawing; variables, event conditions and saved identifiers remain original.
 */
export class TomomiUiTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'TOMOMI_CustomMenuLayoutWithHelp';
    }
    getPluginAliases() {
        return NAMES;
    }
    getCacheType() {
        return 'plugin_tomomi_ui';
    }
    shouldScanEventData() {
        return false;
    }
    collectDisplayAssignments(list, ids) {
        for (let i = 0; i < (list || []).length; i++) {
            const command = list[i];
            const p = command.parameters || [];
            if (command.code === 122 && [...ids].some((id) => id >= p[0] && id <= p[1])) {
                if (p[3] === 0 && typeof p[4] === 'string') this.entries.set(p[4], { text: p[4] });
                if (p[3] === 4 && typeof p[4] === 'string') {
                    for (const entry of this.extractCatalog(p[4]).entries)
                        this.entries.set(entry.text, entry);
                }
            }
            if (command.code === 355) {
                let script = p[0];
                while (list[i + 1]?.code === 655) script += '\n' + list[++i].parameters[0];
                for (const match of script.matchAll(
                    /\$gameVariables\.setValue\(\s*(\d+)\s*,([^;]+)\);?/g
                ))
                    if (ids.has(Number(match[1])))
                        for (const entry of this.extractCatalog(match[0]).entries)
                            this.entries.set(entry.text, entry);
            }
        }
    }
    async collectAdditionalTexts() {
        const read = async (name) => {
            const response = await fetch('data/' + name + '.json');
            if (!response.ok) throw new Error('Cannot read TOMOMI display sources: ' + name);
            return parseJsonSafely(await response.text());
        };
        const goalId = Number(
            this.findPluginEntry(this.getPluginName())?.parameters?.VariableId || 0
        );
        const ids = new Set([goalId, 69, 75].filter((id) => id > 0));
        const [infos, common] = await Promise.all([read('MapInfos'), read('CommonEvents')]);
        for (const event of common || []) this.collectDisplayAssignments(event?.list, ids);
        await Promise.all(
            (infos || [])
                .filter((info) => info?.id)
                .map(async (info) => {
                    const map = await read('Map' + String(info.id).padStart(3, '0'));
                    for (const text of [info.name, map.displayName])
                        if (this.isUsableText(text))
                            this.entries.set(text, { text, cacheType: 'map_name' });
                    for (const event of map.events || [])
                        for (const page of event?.pages || [])
                            this.collectDisplayAssignments(page.list, ids);
                })
        );
    }
}
const NAMES = [
    'TOMOMI_CustomMenuLayoutWithHelp',
    'TOMOMI_FootstepSounds',
    'TOMOMI_BattleParticles',
    'TOMOMI_MapParticles',
    'TOMOMI_AutoPortrait',
    'TOMOMI_BattlerEffects',
    'TOMOMI_ReturnMapFromSave',
    'TOMOMI_CriticalSE',
    'TOMOMI_CustomActionSpeed',
    'TOMOMI_LevelUpHealing',
    'TOMOMI_EroStatus',
    'TOMOMI_EncounterBattle',
    'TOMOMI_SetLayout',
    'TOMOMI_LonelyPartyMenu',
    'TOMOMI_CustomBattleResult',
    'TOMOMI_TitleParticles',
    'TOMOMI_MultipleAttacks',
    'TOMOMI_ShopPriceControl',
    'TOMOMI_RequiredArmorType',
    'TOMOMI_ActorSpecificEquipment',
    'TOMOMI_NumInputCancelVal',
    'TOMOMI_CustomMapNameWindow',
    'TOMOMI_FlameFireEvent',
    'TOMOMI_EnemyGraphicPos',
    'TOMOMI_BattlePicture',
    'TOMOMI_SkillCriticalSet',
    'TOMOMI_SaveFileLimit',
];
