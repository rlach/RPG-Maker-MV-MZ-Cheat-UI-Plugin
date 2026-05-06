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
import { GetInformationTranslator } from './translators/GetInformationTranslator.js';
import { DestinationWindowTranslator } from './translators/DestinationWindowTranslator.js';
import { KmsMapActiveMessageTranslator } from './translators/KmsMapActiveMessageTranslator.js';
import { KekeVariableActorCommandTranslator } from './translators/KekeVariableActorCommandTranslator.js';
import { ManoInputConfigTranslator } from './translators/ManoInputConfigTranslator.js';
import { LLStandingPictureTranslator } from './translators/LLStandingPictureTranslator.js';
import { MgpExternChoicesTranslator } from './translators/MgpExternChoicesTranslator.js';
import { MogBattleCommandsTranslator } from './translators/MogBattleCommandsTranslator.js';
import { MessageWindowPopupTranslator } from './translators/MessageWindowPopupTranslator.js';
import { NameBoxNoUseTranslator } from './translators/NameBoxNoUseTranslator.js';
import { MppChoiceExTranslator } from './translators/MppChoiceExTranslator.js';
import { MppMessageExTranslator } from './translators/MppMessageExTranslator.js';
import { MultipleWindowSkinSystemTranslator } from './translators/MultipleWindowSkinSystemTranslator.js';
import { NrpMapTravelTranslator } from './translators/NrpMapTravelTranslator.js';
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
            GetInformationTranslator,
            DestinationWindowTranslator,
            KmsMapActiveMessageTranslator,
            KekeVariableActorCommandTranslator,
            LLStandingPictureTranslator,
            ManoInputConfigTranslator,
            MgpExternChoicesTranslator,
            MessageWindowPopupTranslator,
            MogBattleCommandsTranslator,
            NameBoxNoUseTranslator,
            MppChoiceExTranslator,
            MppMessageExTranslator,
            MultipleWindowSkinSystemTranslator,
            NrpMapTravelTranslator,
            OriginMenuStatusTranslator,
            PandaProgressTextWindowTranslator,
            QuestSystemTranslator,
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

    getDetectedPluginSummaries(panel) {
        return this.getDetectedTranslatorInstances().map((translator) => {
            const pluginName = translator.getPluginName();
            const counts = translator.countAmountSync({ panel });

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

    resolveMessageCacheSourceText(context = {}) {
        const contextObject = context && typeof context === 'object' ? context : {};
        const runtime = contextObject['runtime'] || null;
        const sourceText =
            typeof contextObject['text'] === 'string'
                ? contextObject['text']
                : contextObject['text'] !== null && contextObject['text'] !== undefined
                  ? String(contextObject['text'])
                  : '';

        if (!sourceText) {
            return sourceText;
        }

        this.ensureDetectionStarted({ runtime });

        let resolvedText = sourceText;
        const translators = this.getDetectedTranslatorInstances();
        for (const translator of translators) {
            if (!translator || typeof translator.resolveMessageCacheSourceText !== 'function') {
                continue;
            }

            if (!translator.isActive({ panel: runtime })) {
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
