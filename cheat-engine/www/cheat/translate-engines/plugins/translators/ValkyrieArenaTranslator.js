import { DisplayVariableCatalogTranslator } from '../DisplayVariableCatalogTranslator.js';
import { parseJsonSafely, walkNestedJsonLike } from './TranslatorHelpers.js';

export class ValkyrieArenaTranslator extends DisplayVariableCatalogTranslator {
    getPluginName() {
        return 'ValkyrieArena';
    }
    getPluginAliases() {
        return ['SceneCustomMenu'];
    }
    detectPlugin() {
        const parameters = this.findPluginEntry('SceneCustomMenu')?.parameters;
        return (
            super.detectPlugin() &&
            parseJsonSafely(parameters?.Scene4, {})?.Id === 'Scene_Skillset' &&
            parseJsonSafely(parameters?.Scene8, {})?.Id === 'Scene_VS'
        );
    }
    getCacheType() {
        return 'plugin_valkyrie_arena';
    }
    getCatalogCacheTypes() {
        return [
            this.getCacheType(),
            'actor_name',
            'armor_name',
            'armor_description',
            'item_name',
            'item_description',
        ];
    }
    getSourcePluginNames() {
        return [];
    }
    collectMapTexts() {}
    async collectAdditionalTexts() {
        walkNestedJsonLike(
            this.findPluginEntry('SceneCustomMenu')?.parameters,
            (value, { path }) => {
                if (
                    value &&
                    typeof value === 'object' &&
                    typeof value.ListScript === 'string' &&
                    !/draw(?:Note)?Picture/i.test(String(value.ItemDrawScript || ''))
                ) {
                    for (const match of value.ListScript.matchAll(
                        /\$gameVariables\.value\((\d+)\)/g
                    ))
                        this.displayVariables.add(Number(match[1]));
                }
                if (
                    typeof value === 'string' &&
                    ['Text', 'HelpText', 'CommonHelpText'].includes(path.at(-1))
                )
                    this.collectDisplayReferences(value);
            }
        );
        await this.collectVariableTexts();
    }
    enablePluginTranslation() {
        const base = window.Window_Base?.prototype;
        if (typeof base?.convertEscapeCharacters !== 'function') return false;
        const translator = this;
        const convert = base.convertEscapeCharacters;
        base.convertEscapeCharacters = function (...args) {
            return translator.resolveText(convert.apply(this, args), translator.getRuntime());
        };
        for (const method of ['drawText', 'textWidth'])
            if (typeof base[method] === 'function') this.hookDrawing(base, method);
        this.precomputeCounts().catch((error) =>
            console.error('[ValkyrieArena] Catalog scan failed', error)
        );
        return true;
    }
}
