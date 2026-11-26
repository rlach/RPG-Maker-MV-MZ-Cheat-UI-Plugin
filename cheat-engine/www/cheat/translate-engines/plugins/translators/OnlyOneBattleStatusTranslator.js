import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { isVariableDisplayContext } from '../../../js/translation-runtime/VariableDisplayContext.js';

/** OnlyOneBattleStatus (unversioned MZ author plugin, DESIRE FORCE).
 * Includes card tabs, fusion notices, confirmation text and the author's
 * event-installed battle command. Identify item-name variables from original
 * assignments; resolve them through item_name only during escape rendering.
 */
export class OnlyOneBattleStatusTranslator extends SourceTextCatalogTranslator {
    cardNameVariableIds = new Set();
    getPluginName() {
        return 'OnlyOneBattleStatus';
    }
    getCacheType() {
        return 'plugin_only_one_battle_status';
    }
    shouldScanEventData() {
        return false;
    }
    collectParameterTexts() {}
    async collectAdditionalTexts() {
        const response = await fetch('data/CommonEvents.json');
        if (!response.ok) throw new Error('Cannot read original battle command scripts');
        for (const event of await response.json()) {
            const list = event?.list || [];
            for (let index = 0; index < list.length; index++) {
                const command = list[index];
                if (
                    command.code === 122 &&
                    command.parameters[3] === 4 &&
                    /^\s*\$dataItems\s*\[[\s\S]+\]\.name\s*;?\s*$/.test(command.parameters[4])
                ) {
                    for (let id = command.parameters[0]; id <= command.parameters[1]; id++)
                        this.cardNameVariableIds.add(id);
                }
                if (list[index].code !== 355) continue;
                let script = list[index].parameters[0];
                while (list[index + 1]?.code === 655) script += '\n' + list[++index].parameters[0];
                if (!/Window_(?:ActorCommand|BattleItem|BattleSkill)\.prototype/.test(script))
                    continue;
                for (const entry of this.extractCatalog(script).entries)
                    this.entries.set(entry.text, entry);
            }
        }
    }
    enablePluginTranslation() {
        const variables = window.Game_Variables?.prototype;
        // Install outside the core variable getter, so it cannot harvest an
        // already-translated item name as a new variable_value source.
        if (
            typeof variables?._translateOriginalValue !== 'function' ||
            typeof variables?.value !== 'function'
        )
            return false;
        if (!super.enablePluginTranslation()) return false;
        const value = variables.value;
        const translator = this;
        variables.value = function (id) {
            const displayed = value.call(this, id);
            const variableId = Number(id);
            if (!translator.cardNameVariableIds.has(variableId) || !isVariableDisplayContext())
                return displayed;
            const runtime = translator.getRuntime();
            if (!translator.isRuntimeTranslationActive(runtime)) return displayed;
            const source = runtime.getRawGameVariableValue(variableId);
            if (displayed !== source || typeof source !== 'string') return displayed;
            // Assignments can already contain a translated database name.
            // Only a known item-name cache source is eligible for this bridge.
            if (!runtime.hasUsableCacheValue(runtime.getCacheKey(source, 'item_name')))
                return displayed;
            return translator.resolveRuntimeTranslation(source, runtime, 'item_name', {
                harvestMissing: false,
            });
        };
        return true;
    }
}
