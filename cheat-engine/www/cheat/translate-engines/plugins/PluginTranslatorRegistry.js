import { AutoNamePopupTranslator } from './translators/AutoNamePopupTranslator.js';
import { BasePluginTranslator } from './BasePluginTranslator.js';
import { CategorySynthesisTranslator } from './translators/CategorySynthesisTranslator.js';
import { ChronusTranslator } from './translators/ChronusTranslator.js';
import { CbrEroStatusTranslator } from './translators/CbrEroStatusTranslator.js';
import { ExternMessageTranslator } from './translators/ExternMessageTranslator.js';
import { CbrEroStatusMvTranslator } from './translators/CbrEroStatusMvTranslator.js';
import { DarkPlasmaCharacterTextTranslator } from './translators/DarkPlasmaCharacterTextTranslator.js';
import { DTextPictureTranslator } from './translators/DTextPictureTranslator.js';
import { DynamicDatabaseTranslator } from './translators/DynamicDatabaseTranslator.js';
import { EventLabelTranslator } from './translators/EventLabelTranslator.js';
import { ExtraWindowTranslator } from './translators/ExtraWindowTranslator.js';
import { GetInformationTranslator } from './translators/GetInformationTranslator.js';
import { HelpWindowPluginTranslator } from './translators/HelpWindowPluginTranslator.js';
import { DestinationWindowTranslator } from './translators/DestinationWindowTranslator.js';
import { KmsMapActiveMessageTranslator } from './translators/KmsMapActiveMessageTranslator.js';
import { KzPictureChoicesTranslator } from './translators/KzPictureChoicesTranslator.js';
import { KekeVariableActorCommandTranslator } from './translators/KekeVariableActorCommandTranslator.js';
import { LunatlazurActorNameWindowTranslator } from './translators/LunatlazurActorNameWindowTranslator.js';
import { LLGalgeChoiceWindowTranslator } from './translators/LLGalgeChoiceWindowTranslator.js';
import { ManoInputConfigTranslator } from './translators/ManoInputConfigTranslator.js';
import { LLMenuScreenTranslator } from './translators/LLMenuScreenTranslator.js';
import { LLStandingPictureTranslator } from './translators/LLStandingPictureTranslator.js';
import { MgpExternChoicesTranslator } from './translators/MgpExternChoicesTranslator.js';
import { MogSceneMenuFileRenameTranslator } from './translators/MogSceneMenuFileRenameTranslator.js';
import { MogSceneMenuTranslator } from './translators/MogSceneMenuTranslator.js';
import { MogSceneItemTranslator } from './translators/MogSceneItemTranslator.js';
import { MogBattleCommandsTranslator } from './translators/MogBattleCommandsTranslator.js';
import { MogEventTextTranslator } from './translators/MogEventTextTranslator.js';
import { MessageWindowPopupTranslator } from './translators/MessageWindowPopupTranslator.js';
import { NameBoxNoUseTranslator } from './translators/NameBoxNoUseTranslator.js';
import { MppChoiceExTranslator } from './translators/MppChoiceExTranslator.js';
import { MppMessageExTranslator } from './translators/MppMessageExTranslator.js';
import { MultipleWindowSkinSystemTranslator } from './translators/MultipleWindowSkinSystemTranslator.js';
import { NrpMapTravelTranslator } from './translators/NrpMapTravelTranslator.js';
import { NuunSaveScreenTranslator } from './translators/NuunSaveScreenTranslator.js';
import { OriginMenuStatusTranslator } from './translators/OriginMenuStatusTranslator.js';
import { PandaProgressTextWindowTranslator } from './translators/PandaProgressTextWindowTranslator.js';
import { QuestSystemTranslator } from './translators/QuestSystemTranslator.js';
import { SceneCustomMenuTranslator } from './translators/SceneCustomMenuTranslator.js';
import { SceneGlossaryTranslator } from './translators/SceneGlossaryTranslator.js';
import { SetMessageFontSizeTranslator } from './translators/SetMessageFontSizeTranslator.js';
import { SHMessageWindowBgTranslator } from './translators/SHMessageWindowBgTranslator.js';
import { SkillCPSystemTranslator } from './translators/SkillCPSystemTranslator.js';
import { TextPictureTranslator } from './translators/TextPictureTranslator.js';
import { TMMenuLabelTranslator } from './translators/TMMenuLabelTranslator.js';
import { TMNamePopTranslator } from './translators/TMNamePopTranslator.js';
import { TMStatusMenuExTranslator } from './translators/TMStatusMenuExTranslator.js';
import { TorigoyaAchievement2Translator } from './translators/TorigoyaAchievement2Translator.js';
import { TorigoyaAchievementTranslator } from './translators/TorigoyaAchievementTranslator.js';
import { TorigoyaNotifyMessageTranslator } from './translators/TorigoyaNotifyMessageTranslator.js';
import { TRPSkitTranslator } from './translators/TrpSkitTranslator.js';
import { UoTesEventTranslator } from './translators/UoTesEventTranslator.js';
import { YedWordWrapTranslator } from './translators/YedWordWrapTranslator.js';
import { YEPCoreEngineScriptTranslator } from './translators/YEPCoreEngineScriptTranslator.js';
import { YepMessageCoreTranslator } from './translators/YepMessageCoreTranslator.js';
import { YepQuestJournalTranslator } from './translators/YepQuestJournalTranslator.js';
import { YepEventMiniLabelTranslator } from './translators/YepEventMiniLabelTranslator.js';
import { SabaSimpleScenarioTranslator } from './translators/SabaSimpleScenarioTranslator.js';
import { SabaTachieTranslator } from './translators/SabaTachieTranslator.js';
import { YepGabWindowTranslator } from './translators/YepGabWindowTranslator.js';

class PluginTranslatorRegistry {
    constructor() {
        this.translatorClasses = [
            AutoNamePopupTranslator,
            CategorySynthesisTranslator,
            ChronusTranslator,
            CbrEroStatusTranslator,
            ExternMessageTranslator,
            CbrEroStatusMvTranslator,
            DarkPlasmaCharacterTextTranslator,
            DTextPictureTranslator,
            DynamicDatabaseTranslator,
            EventLabelTranslator,
            ExtraWindowTranslator,
            GetInformationTranslator,
            HelpWindowPluginTranslator,
            DestinationWindowTranslator,
            KmsMapActiveMessageTranslator,
            KzPictureChoicesTranslator,
            KekeVariableActorCommandTranslator,
            LunatlazurActorNameWindowTranslator,
            LLGalgeChoiceWindowTranslator,
            LLMenuScreenTranslator,
            LLStandingPictureTranslator,
            ManoInputConfigTranslator,
            MgpExternChoicesTranslator,
            MogSceneMenuFileRenameTranslator,
            MogSceneMenuTranslator,
            MogSceneItemTranslator,
            MessageWindowPopupTranslator,
            MogBattleCommandsTranslator,
            MogEventTextTranslator,
            NameBoxNoUseTranslator,
            MppChoiceExTranslator,
            MppMessageExTranslator,
            MultipleWindowSkinSystemTranslator,
            NrpMapTravelTranslator,
            NuunSaveScreenTranslator,
            OriginMenuStatusTranslator,
            PandaProgressTextWindowTranslator,
            QuestSystemTranslator,
            SabaSimpleScenarioTranslator,
            SabaTachieTranslator,
            SceneCustomMenuTranslator,
            SceneGlossaryTranslator,
            SetMessageFontSizeTranslator,
            SHMessageWindowBgTranslator,
            SkillCPSystemTranslator,
            TextPictureTranslator,
            TMMenuLabelTranslator,
            TMNamePopTranslator,
            TMStatusMenuExTranslator,
            TorigoyaAchievement2Translator,
            TorigoyaAchievementTranslator,
            TorigoyaNotifyMessageTranslator,
            TRPSkitTranslator,
            UoTesEventTranslator,
            YedWordWrapTranslator,
            YEPCoreEngineScriptTranslator,
            YepGabWindowTranslator,
            YepEventMiniLabelTranslator,
            YepMessageCoreTranslator,
            YepQuestJournalTranslator,
        ];
        this.translatorInstances = new Map();
        this.detectedPluginNames = new Set();
        this.detectionPromise = null;
        this.detectionCompleted = false;
    }

    ensureDetectionStarted(context = {}) {
        BasePluginTranslator.ensureGlobalRuntimeContract();

        if (this.detectionPromise !== null) {
            return this.detectionPromise;
        }

        this.detectionPromise = this.runDetection(context)
            .catch((error) => {
                console.warn('[PluginTranslatorRegistry] Plugin detection failed', error);
            })
            .finally(() => {
                this.detectionCompleted = true;
            });

        return this.detectionPromise;
    }

    async ensureDetectionCompleted(context = {}) {
        const promise = this.ensureDetectionStarted(context);
        if (typeof promise?.then === 'function') {
            await promise;
        }
    }

    async runDetection(context = {}) {
        // Phase 1 (sync): instantiate all translators and run detection immediately.
        // This ensures translatorInstances + detectedPluginNames are populated before
        // any async work begins, so resolveMessageCacheSourceText never misses a
        // translator due to a slow prepareTranslator() call on an earlier entry.
        const detectedTranslators = [];
        for (const TranslatorClass of this.translatorClasses) {
            const translator = new TranslatorClass();
            const pluginName = String(translator.getPluginName() || '').trim();
            if (!pluginName) {
                continue;
            }

            this.translatorInstances.set(pluginName, translator);

            const detected = translator.ensureDetection();
            if (!detected) {
                continue;
            }

            this.detectedPluginNames.add(pluginName);
            detectedTranslators.push({ pluginName, translator });
        }

        // Phase 2 (async): prepare detected translators sequentially.
        for (const { pluginName, translator } of detectedTranslators) {
            try {
                await translator.prepareTranslator();
            } catch (error) {
                console.warn(
                    `[PluginTranslatorRegistry] Failed to prepare translator ${pluginName}`,
                    error
                );
            }
        }
    }

    isPluginDetected(pluginName) {
        const key = String(pluginName || '').trim();
        return !!key && this.detectedPluginNames.has(key);
    }

    getDetectedTranslatorInstances() {
        const result = [];
        for (const pluginName of this.detectedPluginNames) {
            const translator = this.translatorInstances.get(pluginName);
            if (translator) {
                result.push(translator);
            }
        }
        return result;
    }

    getDetectedPluginSummaries(runtime) {
        return this.getDetectedTranslatorInstances().map((translator) => {
            const pluginName = translator.getPluginName();
            const counts = translator.countAmountSync({ runtime });

            return {
                pluginName,
                label: translator.getPluginLabel(),
                total: Math.max(0, Number(counts.total) || 0),
                left: Math.max(0, Number(counts.left) || 0),
                totalStrings: Math.max(0, Number(counts.totalStrings) || 0),
                leftStrings: Math.max(0, Number(counts.leftStrings) || 0),
            };
        });
    }

    _normalizeResolveContext(context = {}) {
        return context && typeof context === 'object' ? context : {};
    }

    _extractResolveSourceText(contextObject) {
        const sourceValue = contextObject?.text;
        if (typeof sourceValue === 'string') {
            return sourceValue;
        }

        if (sourceValue === null || sourceValue === undefined) {
            return '';
        }

        return String(sourceValue);
    }

    _canResolveWithTranslator(translator, runtime) {
        if (!translator || typeof translator.resolveMessageCacheSourceText !== 'function') {
            return false;
        }

        return translator.isActive({ runtime });
    }

    resolveMessageCacheSourceText(context = {}) {
        const contextObject = this._normalizeResolveContext(context);
        const runtime = contextObject['runtime'] || null;
        const sourceText = this._extractResolveSourceText(contextObject);

        if (!sourceText) {
            return sourceText;
        }

        this.ensureDetectionStarted({ runtime });

        let resolvedText = sourceText;
        const translators = this.getDetectedTranslatorInstances();
        for (const translator of translators) {
            if (!this._canResolveWithTranslator(translator, runtime)) {
                continue;
            }

            try {
                const nextValue = translator.resolveMessageCacheSourceText({
                    ...context,
                    runtime,
                    text: resolvedText,
                });

                if (typeof nextValue === 'string' && nextValue !== resolvedText) {
                    resolvedText = nextValue;
                }
            } catch (error) {
                console.warn(
                    `[PluginTranslatorRegistry] Failed to normalize message cache source for ${translator.getPluginName()}`,
                    error
                );
            }
        }

        return resolvedText;
    }
}

export const PLUGIN_TRANSLATOR_REGISTRY = new PluginTranslatorRegistry();
