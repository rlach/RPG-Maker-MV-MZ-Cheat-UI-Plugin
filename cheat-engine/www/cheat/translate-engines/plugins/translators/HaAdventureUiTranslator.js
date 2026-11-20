import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { walkNestedJsonLike, parseJsonSafely } from './TranslatorHelpers.js';

/** HA adventure scenes: translate presentation, never route IDs or game tables. */
export function haAlbumTitle(event) {
    const quoted = /「([^」]+)」/.exec(event.name);
    if (/^純愛：/.test(event.name)) return event.name.replace(/^純愛：/, '');
    if (event.id >= 26 && event.id <= 30) return quoted ? quoted[1] : event.name;
    let text = event.name.replace(/^本編：E\d+b?\s*/, '').replace(/^Lv\d命令[①②③]?：?/, '');
    const suffix = /：(慣れ|定着)$/.exec(text);
    if (suffix) text = text.slice(0, -3) + (suffix[1] === '慣れ' ? '②' : '③');
    else if (/^Lv[2345]命令/.test(event.name)) text += '①';
    return text || event.name;
}

export class HaAdventureUiTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'HA_AdvHome';
    }
    getPluginLabel() {
        return 'HA adventure menus, phone, endings and mind tree';
    }
    getPluginAliases() {
        return [
            'HA_AdvHome',
            'HA_Story',
            'HA_WindowStyle',
            'HA_MindTreeData',
            'HA_MindTree',
            'HA_Tutorial',
            'HA_Message',
            'HA_Help',
            'HA_Memo',
            'HA_Album',
            'HA_Title',
            'HA_SaveLoad',
            'HA_Options',
            'HA_Backlog',
            'HA_QuickMenu',
            'HA_Endings',
            'HA_Notice',
        ];
    }
    getCacheType() {
        return 'plugin_ha_adventure_ui';
    }
    collectMapTexts() {}
    collectParameterTexts(parameters) {
        walkNestedJsonLike(parameters, (value, { path }) => {
            if (
                typeof value !== 'string' ||
                !value.trim() ||
                parseJsonSafely(value, value) !== value
            )
                return;
            const field = [...path].reverse().find((part) => !/^\d+$/.test(part)) || '';
            if (
                /^(?:.*(?:name|text|label|profile).*|title|message|desc|description|hint|help)$/i.test(
                    field
                )
            )
                this.addDisplayVariants(value);
        });
    }
    addDisplayVariants(text) {
        this.entries.set(text, { text });
        for (const block of text.split(/\n\s*\n/)) {
            if (block.trim()) this.entries.set(block, { text: block });
            const lines = block.split('\n');
            for (const line of lines) if (line.trim()) this.entries.set(line, { text: line });
            // HA_WindowStyle removes a standalone speaker line before rendering.
            if (lines.length > 1 && /^[「『]/.test(lines[1].trim())) {
                const body = lines.slice(1).join('\n');
                this.entries.set(body, { text: body });
            }
        }
    }
    async collectAdditionalTexts() {
        let events = window.$dataCommonEvents;
        if (!Array.isArray(events)) {
            const response = await fetch('data/CommonEvents.json');
            if (!response.ok) throw new Error(`Cannot read CommonEvents: ${response.status}`);
            events = JSON.parse(await response.text());
        }
        for (const event of events) {
            if (
                !event ||
                (!/^(?:Lv[2345]命令|純愛：|本編：)/.test(event.name) &&
                    !(event.id >= 26 && event.id <= 30))
            )
                continue;
            const caption = haAlbumTitle(event);
            (this.albumCaptions ||= new Set()).add(caption);
            this.addDisplayVariants(caption);
        }
        for (const entry of [...this.entries.values()])
            if (!entry.parts) this.addDisplayVariants(entry.text);
    }
    collectUntranslated({ runtime }) {
        const pending = super.collectUntranslated({ runtime });
        const keys = new Set(pending.map((item) => item.cacheKey));
        for (const item of this.buildPendingItems(runtime)) {
            if (
                !this.albumCaptions?.has(item.value) ||
                !/[\u3040-\u30ff\u3400-\u9fff]/.test(item.value) ||
                keys.has(item.cacheKey)
            )
                continue;
            if (runtime.translationCache.get(item.cacheKey) === item.value) pending.push(item);
        }
        return pending;
    }
    resolveText(text, runtime, depth = 0, allowFragments = true) {
        const translated = super.resolveText(text, runtime, depth, allowFragments);
        if (
            translated !== text ||
            !this.albumCaptions?.has(text) ||
            !this.isRuntimeTranslationActive(runtime)
        )
            return translated;
        // An identity-valued caption must not hide an existing translation of
        // its command label. Native captions append variant markers to it.
        const suffix = /[①-⑳]$/.exec(text)?.[0] || '';
        if (suffix) {
            const stem = text.slice(0, -suffix.length);
            const resolved = super.resolveText(stem, runtime, depth, allowFragments);
            if (resolved !== stem) return resolved + suffix;
        }
        return text;
    }
    collectSourceCatalog(source) {
        const catalog = super.collectSourceCatalog(source);
        // Native message and mind-tree renderers expand relationship-dependent
        // names before layout. Harvest every display variant with matching keys.
        for (const entry of [...catalog.entries]) {
            if (!/\{(?:悠くん|遥|三上さん)\}/.test(entry.text)) continue;
            for (const named of [false, true])
                for (const lovers of [false, true]) {
                    const text = entry.text
                        .replace(/\{悠くん\}/g, named ? '悠くん' : '桐山くん')
                        .replace(/\{遥\}/g, lovers ? '遥' : '三上さん')
                        .replace(/\{三上さん\}/g, named || lovers ? '遥' : '三上さん');
                    catalog.entries.push({ text });
                    for (const line of text.split('\n'))
                        if (line.trim()) catalog.entries.push({ text: line });
                }
        }
        return catalog;
    }
    enablePluginTranslation() {
        const initialized = super.enablePluginTranslation();
        if (!initialized) return false;
        const translator = this;
        const context = window.CanvasRenderingContext2D?.prototype;
        for (const method of ['fillText', 'strokeText', 'measureText']) {
            if (typeof context?.[method] !== 'function') continue;
            this.hookDrawing(context, method);
        }
        // The phone computes bubble height and width from whole text here.
        const phone = window.Scene_HaMessage?.prototype;
        if (typeof phone?.wrap === 'function') {
            const wrap = phone.wrap;
            phone.wrap = function (bitmap, text, ...args) {
                return wrap.call(
                    this,
                    bitmap,
                    translator.resolveText(text, translator.getRuntime()),
                    ...args
                );
            };
        }
        // Window_MindText is private to the plugin. Hook its instance before
        // Scene_MindTree.create invokes start on the first-visit description.
        const base = window.Window_Base.prototype;
        if (typeof base.initialize === 'function') {
            const initialize = base.initialize;
            base.initialize = function (...args) {
                const result = initialize.apply(this, args);
                if (
                    this.constructor?.name === 'Window_MindText' &&
                    typeof this.start === 'function'
                ) {
                    const start = this.start;
                    this.start = function (text, ...rest) {
                        return start.call(
                            this,
                            translator.resolveText(text, translator.getRuntime()),
                            ...rest
                        );
                    };
                }
                return result;
            };
        }
        return true;
    }
}
