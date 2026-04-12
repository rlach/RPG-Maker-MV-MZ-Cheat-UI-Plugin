import { CbrEroStatusTranslator } from './translators/CbrEroStatusTranslator.js';
import { ExternMessageTranslator } from './translators/ExternMessageTranslator.js';
import { CbrEroStatusMvTranslator } from './translators/CbrEroStatusMvTranslator.js';
import { DTextPictureTranslator } from './translators/DTextPictureTranslator.js';
import { DynamicDatabaseTranslator } from './translators/DynamicDatabaseTranslator.js';
import { DestinationWindowTranslator } from './translators/DestinationWindowTranslator.js';
import { KmsMapActiveMessageTranslator } from './translators/KmsMapActiveMessageTranslator.js';
import { MgpExternChoicesTranslator } from './translators/MgpExternChoicesTranslator.js';
import { MppChoiceExTranslator } from './translators/MppChoiceExTranslator.js';
import { MultipleWindowSkinSystemTranslator } from './translators/MultipleWindowSkinSystemTranslator.js';
import { OriginMenuStatusTranslator } from './translators/OriginMenuStatusTranslator.js';
import { PandaProgressTextWindowTranslator } from './translators/PandaProgressTextWindowTranslator.js';
import { SceneGlossaryTranslator } from './translators/SceneGlossaryTranslator.js';
import { TextPictureTranslator } from './translators/TextPictureTranslator.js';
import { TMMenuLabelTranslator } from './translators/TMMenuLabelTranslator.js';
import { TMNamePopTranslator } from './translators/TMNamePopTranslator.js';
import { TorigoyaAchievement2Translator } from './translators/TorigoyaAchievement2Translator.js';
import { TorigoyaAchievementTranslator } from './translators/TorigoyaAchievementTranslator.js';
import { YEPCoreEngineScriptTranslator } from './translators/YEPCoreEngineScriptTranslator.js';

class PluginTranslatorRegistry {
    constructor() {
        this.translatorClasses = [
            CbrEroStatusTranslator,
            ExternMessageTranslator,
            CbrEroStatusMvTranslator,
            DTextPictureTranslator,
            DynamicDatabaseTranslator,
            DestinationWindowTranslator,
            KmsMapActiveMessageTranslator,
            MgpExternChoicesTranslator,
            MppChoiceExTranslator,
            MultipleWindowSkinSystemTranslator,
            OriginMenuStatusTranslator,
            PandaProgressTextWindowTranslator,
            SceneGlossaryTranslator,
            TextPictureTranslator,
            TMMenuLabelTranslator,
            TMNamePopTranslator,
            TorigoyaAchievement2Translator,
            TorigoyaAchievementTranslator,
            YEPCoreEngineScriptTranslator,
        ];
        this.translatorInstances = new Map();
        this.detectedPluginNames = new Set();
        this.detectionPromise = null;
        this.detectionCompleted = false;
    }

    ensureDetectionStarted(context = {}) {
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
}

export const PLUGIN_TRANSLATOR_REGISTRY = new PluginTranslatorRegistry();
