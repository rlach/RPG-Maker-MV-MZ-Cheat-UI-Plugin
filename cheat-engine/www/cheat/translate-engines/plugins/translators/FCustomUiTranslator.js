import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { parseJsonSafely, walkNestedJsonLike } from './TranslatorHelpers.js';

/**
 * F_ custom menu/gallery suite (MV, unversioned sources shipped in RJ404094).
 * Collects presentation parameters only: gallery titles, menu descriptions,
 * skill/weapon-slot labels, second-status labels, quotes and reward templates.
 * Source map display names also cover existing save headers. Shared drawing
 * hooks translate presentation without changing asset IDs, unlockers or scripts.
 * Gallery tabs and second-status backgrounds remain image assets.
 */
export class FCustomUiTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'CustomMadeMenu';
    }

    getPluginLabel() {
        return 'F_ custom menus / gallery / second status';
    }

    getPluginAliases() {
        return [
            'CustomMadeMenu',
            'CustomMadeSkill',
            'CustomMadeStatus',
            'GalleryScene',
            'SecondStatusScene',
        ];
    }

    getSourcePluginNames() {
        return [...this.getPluginAliases(), 'CustomMenuCommands', 'AssetDatabase_Gallery'];
    }

    getCacheType() {
        return 'plugin_f_custom_ui';
    }

    collectCommandTexts() {
        // This suite stores UI text in parameters. Keep event scripts out of
        // its catalog while retaining the shared scan of map display names.
    }

    collectParameterTexts(parameters) {
        walkNestedJsonLike(parameters, (value, { path }) => {
            if (!this.isUsableText(value) || parseJsonSafely(value, value) !== value) return;
            const root = path[0];
            const field = path[path.length - 1];
            const selected =
                [
                    'InfoLabels',
                    'DishNames',
                    'AtkLabels',
                    'SkillLabel',
                    'AbilityLabel',
                    'SlotLabel',
                ].includes(root) ||
                (['CGList', 'SceneList', 'MovieList', 'SkitList'].includes(root) &&
                    field === 'title') ||
                (root === 'Commands' && field === 'description') ||
                (root === 'CommonEvents' && field === 'name') ||
                (root === 'AdvancedSettings' && field === 'loadCommandName') ||
                root === 'CommonTexts' ||
                (root === 'BonusList' && field === 'display') ||
                (root === 'ActorList' && path.includes('quotes') && field === 'text');
            if (!selected) return;
            if (root === 'CommonTexts' && /\{\w+\}/.test(value)) {
                this.collectDisplayTemplate(value);
                return;
            }
            this.entries.set(value, { text: value });
            if (root === 'SlotLabel') {
                const text = value + '\\COT[0]';
                this.entries.set(text, { text, parts: [value, ''] });
            }
        });
    }

    collectDisplayTemplate(value) {
        // F_'s [optional segments] disappear when their values are zero/one.
        // Register both rendered forms, never expose the template DSL to LLMs.
        const variants = [value.replaceAll(/\[|\]/g, ''), value.replaceAll(/\[[^\]]*\]/g, '')];
        for (const variant of variants) {
            const parts = variant.split(/\{\w+\}/g);
            if (!parts.join('').trim()) continue;
            const text = parts
                .map((part, index) => part + (index < parts.length - 1 ? `\\COT[${index}]` : ''))
                .join('');
            this.entries.set(text, parts.length > 1 ? { text, parts } : { text });
        }
    }

    isDisplayFragment() {
        // Full titles/quotes and explicit dynamic templates only. A translated
        // title containing another source word must not be translated twice.
        return false;
    }
}
