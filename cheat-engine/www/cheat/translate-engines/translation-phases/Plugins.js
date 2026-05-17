import { BasePhase } from './BasePhase.js';
import { PLUGIN_TRANSLATOR_REGISTRY } from '../plugins/PluginTranslatorRegistry.js';

export class Plugins extends BasePhase {
    getKind() {
        return 'plugins';
    }

    async createEntries({ runtime }) {
        await PLUGIN_TRANSLATOR_REGISTRY.ensureDetectionCompleted({ runtime: runtime });
        await PLUGIN_TRANSLATOR_REGISTRY.ensureCountsPrecomputed({ runtime: runtime });

        const translators = PLUGIN_TRANSLATOR_REGISTRY.getDetectedTranslatorInstances();
        const entries = [];

        for (const translator of translators) {
            if (!translator || !translator.isActive({ runtime })) {
                continue;
            }

            const counts = translator.countAmountSync({ runtime });
            const leftStrings = Math.max(
                0,
                Number((counts && counts.leftStrings) || (counts && counts.left) || 0)
            );
            if (leftStrings <= 0) {
                continue;
            }

            entries.push({
                priorityMapId: 0,
                strategy: translator,
            });
        }

        return entries;
    }

    countAmountSync({ runtime }) {
        PLUGIN_TRANSLATOR_REGISTRY.ensureDetectionStarted({ runtime: runtime });

        const translators = PLUGIN_TRANSLATOR_REGISTRY.getDetectedTranslatorInstances();
        let totalPlugins = 0;
        let leftPlugins = 0;
        let totalStrings = 0;
        let leftStrings = 0;

        for (const translator of translators) {
            if (!translator) {
                continue;
            }

            totalPlugins += 1;
            const counts = translator.countAmountSync({ runtime });
            const pluginTotalStrings = Math.max(
                0,
                Number((counts && counts.totalStrings) || (counts && counts.total) || 0)
            );
            const pluginLeftStrings = Math.max(
                0,
                Number((counts && counts.leftStrings) || (counts && counts.left) || 0)
            );

            totalStrings += pluginTotalStrings;
            if (translator.isActive({ runtime })) {
                leftStrings += pluginLeftStrings;
            }
            if (translator.isActive({ runtime }) && pluginLeftStrings > 0) {
                leftPlugins += 1;
            }
        }

        return {
            total: totalPlugins,
            left: leftPlugins,
            totalStrings,
            leftStrings,
        };
    }
}
