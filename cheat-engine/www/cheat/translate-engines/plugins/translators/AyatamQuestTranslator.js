import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { parseJsonSafely, walkNestedJsonLike } from './TranslatorHelpers.js';

const WINDOWS = [
    'Window_HelpForQuest',
    'Window_QuestIconHorzCommand',
    'Window_QuestCategory',
    'Window_QuestCategoryLabel',
    'Window_QuestFilterCategory',
    'Window_MenuQuestList',
    'Window_QuestMapNavigation',
    'Window_QuestBoard',
    'Window_QuestBoardList',
    'Window_CheckQuestMust',
    'Window_CheckQuestMustSub',
    'Window_QuestData',
    'Window_QuestMenuNavCommand',
    'Window_QuestCancelingCommand',
    'Window_QuestAssenting',
    'Window_QuestReporting',
];

/**
 * Ayatam_HighQualityQuestSystem MVMZ v1.05 (verified MV).
 * GlobalSettings and QuestDatabase contain multiply serialized JSON structures.
 * Translate display strings only, retaining quest IDs, conditions and asset names.
 * Quest windows copy drawTextEx, so hook those overrides before glyph splitting.
 */
export class AyatamQuestTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'Ayatam_HighQualityQuestSystem';
    }
    getPluginLabel() {
        return 'Ayatam quest system';
    }
    getCacheType() {
        return 'plugin_ayatam_quest';
    }
    getSourcePluginNames() {
        return [this.getPluginName()];
    }

    collectParameterTexts(parameters) {
        walkNestedJsonLike(parameters, (value, { path }) => {
            if (!this.isUsableText(value) || parseJsonSafely(value, value) !== value) return;
            const key = [...path].reverse().find((key) => !/^\d+$/.test(key)) || '';
            if (
                !/(?:Label|Help|Command|QuestFlags|CategoryName|QuestName|QuestClientName|QuestLocation|PlaceInformation|QuestContent|ObjectiveContent|QuestClearContent|DifficultyText)/.test(
                    key
                )
            )
                return;
            this.entries.set(value, { text: value });
            for (const line of value.split('\n'))
                if (this.isUsableText(line)) this.entries.set(line, { text: line });
        });
    }

    enablePluginTranslation() {
        if (typeof window.Window_QuestData?.prototype.drawTextEx !== 'function') return false;
        if (!super.enablePluginTranslation()) return false;
        for (const name of WINDOWS) {
            const prototype = window[name]?.prototype;
            if (prototype && Object.prototype.hasOwnProperty.call(prototype, 'drawTextEx'))
                this.hookDrawing(prototype, 'drawTextEx');
        }
        return true;
    }
}
