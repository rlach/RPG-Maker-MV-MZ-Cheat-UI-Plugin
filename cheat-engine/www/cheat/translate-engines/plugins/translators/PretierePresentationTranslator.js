import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/** Deep Abyss Pretiere 1.01: scripted form names and troop introductions. */
export class PretierePresentationTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'PretierePresentation';
    }
    getPluginLabel() {
        return 'Pretiere form names and battle introductions';
    }
    getCacheType() {
        return 'plugin_pretiere_presentation';
    }
    detectPlugin() {
        return (
            this.findPluginEntry('MenuCommandSort')?.parameters?.['Add Common 4'] ===
                'jisseki2,その他の実績,362' &&
            this.findPluginEntry('LL_MenuScreenCustom')?.status === true
        );
    }
    getSourcePluginNames() {
        return [];
    }
    shouldScanEventData() {
        return false;
    }
    async collectAdditionalTexts() {
        const response = await fetch('data/Troops.json');
        if (!response.ok) throw new Error(`Cannot read Troops: ${response.status}`);
        const troops = await response.json();
        for (const troop of troops) {
            for (const page of troop?.pages || []) {
                // The shared catalog recognizes addLog as a display call.
                this.collectCommandTexts(
                    (page.list || []).map((command) =>
                        [355, 655].includes(command.code)
                            ? {
                                  ...command,
                                  parameters: [
                                      command.parameters[0].replace(/\.addText\s*\(/g, '.addLog('),
                                  ],
                              }
                            : command
                    )
                );
            }
        }
    }
    enablePluginTranslation() {
        const actor = window.Game_Actor?.prototype;
        const log = window.Window_BattleLog?.prototype;
        if (typeof actor?.name !== 'function' || typeof log?.addText !== 'function') return false;
        const translator = this;
        const name = actor.name;
        actor.name = function (...args) {
            const source = name.apply(this, args);
            if (this._actorId !== 1 || !['ひなた', 'プリティエール'].includes(source))
                return source;
            return translator.resolveRuntimeTranslation(
                source,
                translator.getRuntime(),
                'actor_name',
                {
                    requireRuntimeTranslationActive: true,
                }
            );
        };
        const addText = log.addText;
        log.addText = function (text, ...args) {
            return addText.call(
                this,
                translator.resolveText(text, translator.getRuntime()),
                ...args
            );
        };
        return true;
    }
}
