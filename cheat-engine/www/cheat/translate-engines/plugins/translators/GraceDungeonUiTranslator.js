import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/** Mabo dungeon UI, unversioned MV build shipped in RJ309974 Ver1.13.
 * This family implements its windows and item/log messages in modified core
 * scripts as well as plugins. Read display catalogs without executing scripts;
 * translate at drawing time, preserving item identities, stats and stored logs.
 */
export class GraceDungeonUiTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'Game_Dungeon';
    }

    getPluginLabel() {
        return 'Grace dungeon menus and item details';
    }

    getCacheType() {
        return 'plugin_grace_dungeon_ui';
    }

    getSourcePluginNames() {
        return [
            'Game_Dungeon',
            'GenerateDungeon',
            'Game_BackLog',
            'SkillTree',
            'ItemInfo',
            'ItemBook',
            'WeaponSkill',
            'EnemyBook',
            'EnemyList',
            'EnemyAction',
        ];
    }

    async collectAdditionalTexts() {
        for (const name of ['rpg_windows', 'rpg_objects', 'rpg_scenes', 'rpg_managers']) {
            const response = await fetch(`js/${name}.js`);
            if (!response.ok) throw new Error(`Cannot read ${name}: ${response.status}`);
            const catalog = this.collectSourceCatalog(await response.text());
            for (const entry of catalog.entries)
                if (!this.entries.has(entry.text)) this.entries.set(entry.text, entry);
        }
    }
}
