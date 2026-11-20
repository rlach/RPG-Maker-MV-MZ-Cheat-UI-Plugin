import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { walkNestedJsonLike, parseJsonSafely } from './TranslatorHelpers.js';

class ParameterDisplayTranslator extends SourceTextCatalogTranslator {
    shouldScanEventData() {
        return false;
    }
    collectParameterTexts(parameters) {
        walkNestedJsonLike(parameters, (text, { path }) => {
            const field = [...path].reverse().find((p) => !/^\d+$/.test(p)) || '';
            if (typeof text !== 'string' || !text.trim() || parseJsonSafely(text, text) !== text)
                return;
            if (/^(?:label\w*|text\w*|\w*Text|Label|Name|ParamName)$/i.test(field))
                this.entries.set(text, { text });
        });
    }
}
export class ItemSortTranslator extends ParameterDisplayTranslator {
    getPluginName() {
        return 'ItemSort';
    }
    getCacheType() {
        return 'plugin_item_sort';
    }
}
export class EnemyAnalysisSkillTranslator extends ParameterDisplayTranslator {
    getPluginName() {
        return 'EnemyAnalysisSkill';
    }
    getCacheType() {
        return 'plugin_enemy_analysis';
    }
    resolveText(text, runtime, depth = 0, allowFragments = true) {
        let translated = super.resolveText(text, runtime, depth, allowFragments);
        if (typeof translated === 'string' && this.isRuntimeTranslationActive(runtime)) {
            // Single-character labels such as Luck must not become global glyph
            // replacements. Only target their numeric-stat colon boundary.
            for (const source of this.entries.keys()) {
                if (source.length !== 1) continue;
                const pattern = new RegExp(
                    `(^|\\s|\\])${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[:：])`,
                    'g'
                );
                translated = translated.replace(
                    pattern,
                    (_, prefix) => prefix + this.resolveRuntimeTranslation(source, runtime)
                );
            }
        }
        return translated;
    }
    enablePluginTranslation() {
        if (!super.enablePluginTranslation()) return false;
        const proto = window.Game_Message?.prototype;
        if (typeof proto?.add === 'function') {
            const original = proto.add;
            const translator = this;
            proto.add = function (text, ...args) {
                return original.call(
                    this,
                    translator.resolveText(text, translator.getRuntime()),
                    ...args
                );
            };
        }
        return true;
    }
}
export class ExtraGaugeTextTranslator extends ParameterDisplayTranslator {
    getPluginName() {
        return 'ExtraGauge';
    }
    getPluginAliases() {
        return ['ExtraGauge', 'NUUN_BattleStyleEX'];
    }
    getCacheType() {
        return 'plugin_extra_gauge_text';
    }
}
export class TinyGetInfoTranslator extends ParameterDisplayTranslator {
    getPluginName() {
        return 'TinyGetInfoWnd';
    }
    getCacheType() {
        return 'plugin_tiny_get_info';
    }
    async collectAdditionalTexts() {
        this.descriptionIndex = null;
        for (const database of [window.$dataItems, window.$dataWeapons, window.$dataArmors])
            for (const item of database || []) {
                const text = item?.meta?.info;
                if (this.isUsableText(text)) this.entries.set(text, { text });
            }
    }
    getDescriptionSources(text) {
        const databases = [window.$dataItems, window.$dataWeapons, window.$dataArmors];
        if (
            !this.descriptionIndex ||
            databases.some(
                (db, i) =>
                    db !== this.descriptionDatabases[i] || db?.length !== this.descriptionLengths[i]
            )
        ) {
            this.descriptionDatabases = databases;
            this.descriptionLengths = databases.map((db) => db?.length);
            this.descriptionIndex = new Map();
            databases.forEach((database, i) => {
                const type = ['item_description', 'weapon_description', 'armor_description'][i];
                for (const item of database || []) {
                    const source = item?._translateOriginal?.description ?? item?.description;
                    if (typeof source !== 'string' || !source) continue;
                    const firstLine = source.split(/[\r\n]/)[0];
                    const entries = this.descriptionIndex.get(firstLine) || [];
                    entries.push({ source, type });
                    this.descriptionIndex.set(firstLine, entries);
                }
            });
        }
        return this.descriptionIndex.get(text) || [];
    }
    resolveText(text, runtime, depth = 0, allowFragments = true) {
        if (
            typeof text === 'string' &&
            text.length > 1 &&
            this.isRuntimeTranslationActive(runtime)
        ) {
            for (const { source, type } of this.getDescriptionSources(text)) {
                const key = runtime.getCacheKey(source, type);
                if (runtime.hasUsableCacheValue(key)) {
                    runtime.trackCacheKeyUsage(key, { harvestMissing: false });
                    return runtime.translationCache.get(key).split(/[\r\n]/)[0];
                }
            }
        }
        return super.resolveText(text, runtime, depth, allowFragments);
    }
}
