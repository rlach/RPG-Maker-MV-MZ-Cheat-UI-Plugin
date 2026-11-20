import { VisuMenuCatalogTranslator } from '../VisuMenuCatalogTranslator.js';
import { walkNestedJsonLike, parseJsonSafely } from './TranslatorHelpers.js';
import { extractJavaScriptTextCatalog } from './JavaScriptTextCatalog.js';

/** VisuStella core interfaces: parameter vocabulary and display-only database names. */
export class VisuCoreInterfaceTranslator extends VisuMenuCatalogTranslator {
    getPluginName() {
        return 'VisuMZ_1_ItemsEquipsCore';
    }
    getPluginAliases() {
        return [
            'VisuMZ_0_CoreEngine',
            'VisuMZ_1_BattleCore',
            'VisuMZ_1_ItemsEquipsCore',
            'VisuMZ_1_MainMenuCore',
            'VisuMZ_1_SaveCore',
            'VisuMZ_3_FrontviewBattleUI',
            'VisuMZ_3_VictoryAftermath',
            'VisuMZ_4_FullFieldRecovery',
            'NUUN_ItemCategory',
        ];
    }
    getParameterPluginNames() {
        return this.getPluginAliases();
    }
    getCacheType() {
        return 'plugin_visu_core_interface';
    }
    isTargetWindow() {
        return true;
    }
    collectParameterTexts(parameters) {
        walkNestedJsonLike(parameters, (value, { path }) => {
            if (typeof value !== 'string' || !value.trim()) return;
            const parsed = parseJsonSafely(value, value);
            if (parsed && typeof parsed === 'object') return;
            const field = path.at(-1) || '';
            if (field.endsWith(':func')) {
                try {
                    for (const entry of extractJavaScriptTextCatalog(value).entries)
                        this.entries.set(entry.text, entry);
                } catch {
                    /* Expression-only configuration is not a JavaScript statement. */
                }
                return;
            }
            if (
                !/:str$|:json$/.test(field) &&
                !path.some((part) => /:arrayjson$/.test(part)) &&
                !/^(?:CategoryName|Name|Text)$/i.test(field)
            )
                return;
            if (/(?:image|picture|filename|folder|font|sound|se:|bgm|symbol|^type:)/i.test(field))
                return;
            const text = typeof parsed === 'string' ? parsed : value;
            if (!/[\u3040-\u30ff\u3400-\u9fff]/.test(text)) return;
            if (/%\d+/.test(text)) {
                const parts = text.split(/%\d+/);
                const template = parts
                    .map(
                        (part, index) => part + (index < parts.length - 1 ? `\\COT[${index}]` : '')
                    )
                    .join('');
                this.entries.set(template, { text: template, parts });
            } else this.entries.set(text, { text });
            for (const line of text.split('\n'))
                if (line.trim()) this.entries.set(line, { text: line });
        });
    }
    resolveText(text, runtime, depth = 0, allowFragments = true) {
        if (!this.isUsableText(text) || !this.isRuntimeTranslationActive(runtime)) return text;
        if (!/[\u3040-\u30ff\u3400-\u9fff]/.test(text)) return text;
        const name = this.resolveRuntimeTranslation(
            text,
            runtime,
            ['enemy_name', 'map_name', 'item_name', 'plugin_alchemy_system'],
            {
                harvestMissing: false,
            }
        );
        if (name !== text) return name;
        const suffix = /^(.*?)([ \u3000]+[A-Z]+)$/.exec(text);
        if (suffix) {
            const enemy = this.resolveRuntimeTranslation(suffix[1], runtime, 'enemy_name', {
                harvestMissing: false,
            });
            if (enemy !== suffix[1]) return enemy + suffix[2];
        }
        // Item notifications retain their icon/color escapes around the name.
        // eslint-disable-next-line no-control-regex -- RPG Maker converted escapes.
        const icon = /^((?:(?:\\|\x1b)[IC]\[\d+\]|\s)+)([\s\S]+)$/.exec(text);
        if (icon) {
            const item = this.resolveRuntimeTranslation(icon[2], runtime, 'item_name', {
                harvestMissing: false,
            });
            if (item !== icon[2]) return icon[1] + item;
        }
        return super.resolveText(text, runtime, depth, allowFragments);
    }
    async collectAdditionalTexts() {
        await super.collectAdditionalTexts();
        const response = await fetch('data/Enemies.json');
        if (!response.ok) throw Error(`Cannot read Enemies: ${response.status}`);
        const enemies = JSON.parse(await response.text());
        this.enemyNames = new Set(
            enemies
                .filter(Boolean)
                .map((enemy) => enemy.name)
                .filter(Boolean)
        );
    }
    collectUntranslated({ runtime }) {
        const pending = super.collectUntranslated({ runtime });
        // Source-copy enemy entries are nonempty but still untranslated.
        for (const name of this.enemyNames || []) {
            const cacheKey = runtime.getCacheKey(name, 'enemy_name');
            if (
                !runtime.hasUsableCacheValue(cacheKey) ||
                runtime.translationCache.get(cacheKey) === name
            )
                pending.push({
                    type: 'enemy_name',
                    id: `visu_enemy_${pending.length}`,
                    value: name,
                    cacheKey,
                });
        }
        return pending;
    }
    getCachedCountsSync({ runtime }) {
        const total = this.entries.size + (this.enemyNames?.size || 0);
        const left = this.collectUntranslated({ runtime }).length;
        return { total, left, totalStrings: total, leftStrings: left };
    }
    enablePluginTranslation() {
        if (!super.enablePluginTranslation()) return false;
        if (typeof window.Bitmap?.prototype.drawText === 'function')
            this.hookDrawing(window.Bitmap.prototype, 'drawText');
        return true;
    }
}
