import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

const MODULES = [
    'CageOfOrder_RandomNPCDialogue',
    'CageOfOrder_TownRumors',
    'CageOfOrder_MenuUI',
    'CageOfOrder_QuestBoard',
    'CageOfOrder_ObjectiveCore',
    'CageOfOrder_NextObjective',
    'CageOfOrder_MenuDashboard',
    'CageOfOrder_SkillTree',
    'JobChangeSystem',
    'CageOfOrder_JobProficiency',
    'CageOfOrder_ExplorationHUD',
    'CageOfOrder_ExplorationGauge',
    'CageOfOrder_DungeonNodeMap',
    'CageOfOrder_MapPortrait',
    'CageOfOrder_StatusFrame',
    'CageOfOrder_FastTravel',
    'CageOfOrder_NPCProgress',
];

/**
 * Cage of Order MZ plugins shipped with game v1.56:
 * RandomNPCDialogue v1.0, MenuUI v1.0.0, JobChangeSystem v3.0.0 and the
 * bundled quest/objective/dashboard/skill-tree/exploration modules.
 * Private JS tables, literals and template expressions supply these screens.
 * Parse scripts without executing them; translate at presentation boundaries so
 * command symbols, game logic, job IDs, images and persistent state stay original.
 * COT parameters preserve evaluated template values in either LLM tag format.
 */
export class CageOfOrderTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'CageOfOrder';
    }
    getPluginAliases() {
        return MODULES;
    }
    getPluginLabel() {
        return 'Cage of Order UI and dialogue';
    }
    getCacheType() {
        return 'plugin_cage_of_order';
    }
}
