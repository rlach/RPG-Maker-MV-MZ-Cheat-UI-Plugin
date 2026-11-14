import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { readJavaScriptLiteralData } from './JavaScriptTextCatalog.js';

/** LL_MenuScreenStatusMV (MV): drawn status labels and event-updated actor profiles/nicknames.
 * Resolve presentation at every read; never replace the actor's saved source fields.
 */
export class LlMenuScreenStatusMvTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'LL_MenuScreenStatusMV';
    }
    getPluginLabel() {
        return 'LL Menu Screen Status MV';
    }
    getCacheType() {
        return 'plugin_ll_menu_screen_status_mv';
    }
    collectCommandTexts(list = []) {
        super.collectCommandTexts(list);
        for (const command of list) {
            if ([324, 325].includes(command.code)) {
                const text = command.parameters[1];
                if (this.isUsableText(text)) this.entries.set(text, { text });
            }
            // This status layout reads descriptive strings from event variables.
            // Parse literal operands only, without executing game expressions.
            if (command.code === 122 && command.parameters[3] === 4) {
                const source = command.parameters[4];
                if (typeof source !== 'string' || !/^\s*['"]/.test(source)) continue;
                try {
                    const text = readJavaScriptLiteralData(`const value = ${source};`, ['value'])
                        .bindings.value;
                    if (this.isUsableText(text)) this.entries.set(text, { text });
                } catch {
                    // Non-literal expressions are handled by the normal event scanner.
                }
            }
        }
    }
    enablePluginTranslation() {
        const actor = window.Game_Actor?.prototype;
        if (typeof actor?.profile !== 'function' || typeof actor?.nickname !== 'function')
            return false;
        if (!super.enablePluginTranslation()) return false;
        const translator = this;
        for (const [method, type] of [
            ['profile', 'actor_profile'],
            ['nickname', 'actor_nickname'],
        ]) {
            const original = actor[method];
            actor[method] = function (...args) {
                const source = original.apply(this, args);
                return translator.resolveRuntimeTranslation(
                    source,
                    translator.getRuntime(),
                    [type, translator.getCacheType()],
                    {
                        requireRuntimeTranslationActive: true,
                    }
                );
            };
        }
        return true;
    }
}
