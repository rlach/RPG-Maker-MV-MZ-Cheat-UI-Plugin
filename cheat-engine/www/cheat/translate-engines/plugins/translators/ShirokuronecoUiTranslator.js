import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { walkNestedJsonLike } from './TranslatorHelpers.js';

/**
 * ShirokuronecoSystem v1.0.3 (MV, RJ01547841) and its game-authored UI extensions.
 * Source catalogs cover skill-card summaries, dungeon selection, battle details/logs,
 * HUD labels and event scripts. Values and executable expressions remain untouched.
 */
export class ShirokuronecoUiTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'ShirokuronecoSystem';
    }
    getPluginLabel() {
        return 'Shirokuroneco game UI';
    }
    getCacheType() {
        return 'plugin_shirokuroneco_ui';
    }
    getSourcePluginNames() {
        return [
            this.getPluginName(),
            'SkillCards_attack',
            'SkillCardShop',
            'GameTopHUD_AllEX',
            'InfiniteDungeon',
            'EnemyDetailWindow',
            'BattleLog',
            'EquipStateShopDisplay',
            'EquipDisplayState',
            'WafuPerkTreeMV',
            'NovelUI_AllScenesMV',
            'BossHandPreview_MV',
            'MagatamaDraw',
            'TreasureRoll',
            'AutoSaveSlotProtect',
        ];
    }
    collectSourceCatalog(source, name) {
        const catalog = super.collectSourceCatalog(source);
        if (name === 'BattleLog') {
            this.displayFragments ??= new Set();
            for (const entry of catalog.entries) {
                if (!entry.parts && entry.text.trim().length >= 2 && !entry.text.includes('\n'))
                    this.displayFragments.add(entry.text);
            }
        }
        return catalog;
    }
    collectParameterTexts(parameters) {
        super.collectParameterTexts(parameters);
        this.displayFragments ??= new Set();
        walkNestedJsonLike(parameters, (text, { path }) => {
            const field = path.at(-1);
            if (
                /^(?:DungeonName|ScenarioName|Character[12]Name|LustStateText(?:Pure|Normal|Lewd|Corrupt)|DayInfinityText|DebtLabel|MoneyLabel|Name[12]|PartyLabel)$/.test(
                    field
                ) &&
                this.isUsableText(text)
            ) {
                this.entries.set(text, { text });
                this.displayFragments.add(text);
            }
        });
    }
    isDisplayFragment(text) {
        return this.displayFragments?.has(text) && !text.includes('\\COT[');
    }
    collectMapTexts() {}
}
