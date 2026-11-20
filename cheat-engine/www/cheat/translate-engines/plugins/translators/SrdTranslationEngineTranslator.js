import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { extractMessageEntryAt } from '../../../js/EventCommandTraversal.js';

const DATABASES = [
    ['Actors', 'actor', ['name', 'nickname', 'profile']],
    ['Classes', 'class', ['name']],
    ['Skills', 'skill', ['name', 'description', 'message1', 'message2']],
    ['Items', 'item', ['name', 'description']],
    ['Weapons', 'weapon', ['name', 'description']],
    ['Armors', 'armor', ['name', 'description']],
    ['Enemies', 'enemy', ['name']],
    ['States', 'state', ['name', 'message1', 'message2', 'message3', 'message4']],
];

/** SRD TranslationEngine 1.04: native localization remains the source owner. */
export class SrdTranslationEngineTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this.entries = new Map();
        this.normalizedEntries = new WeakSet();
    }
    getPluginName() {
        return 'SRD_TranslationEngine';
    }
    getPluginLabel() {
        return 'SRD Translation Engine';
    }
    getCacheType() {
        return 'plugin_srd_translation_engine';
    }

    language() {
        const config = window.ConfigManager;
        return config?.isDefaultLanguage?.() ? null : config?.getLanguage?.() || null;
    }

    nativeText(group, text) {
        const lang = this.language();
        const dictionary = window.$dataTranslations || this.sourceDictionary;
        return (lang && dictionary?.[group]?.[text]?.[lang]) || text;
    }

    nativeCustom(text) {
        // Counts can be requested before SRD's database file finishes loading.
        // Mirror its literal/regex lookup against our detached source snapshot.
        if (!window.$dataTranslations && this.sourceDictionary) {
            const custom = this.sourceDictionary.custom?.[this.language()];
            if (custom?.[text]) return custom[text];
            for (const regex of custom?._regex || []) {
                if (!regex || typeof text !== 'string') continue;
                try {
                    text = text.replace(new RegExp(regex[0], regex[1]), regex[2]);
                } catch {
                    /* Native SRD also skips invalid custom regular expressions. */
                }
            }
            return text;
        }
        const native = window.SRD?.TranslationEngine;
        const translate = this.nativeTranslate || native?.translate;
        return typeof translate === 'function' ? translate.call(native, text) : text;
    }

    addSource(text, type = this.getCacheType(), original = text) {
        if (!this.isUsableText(text) || /^[\d\s.,+-]+$/.test(text)) return;
        let entry = this.entries.get(text);
        if (!entry) this.entries.set(text, (entry = { types: new Set(), originals: new Set() }));
        entry.types.add(type);
        entry.originals.add(original);
    }

    resolveDisplay(text, runtime = this.getRuntime()) {
        if (!this.isRuntimeTranslationActive(runtime)) return text;
        const entry = this.entries.get(text);
        if (!entry) return text; // Never harvest rendered digits or individual glyphs.
        const types = [...entry.types];
        const translated = this.resolveRuntimeTranslation(text, runtime, types);
        if (translated !== text) return translated;
        // Reuse caches made before this adapter, without harvesting Chinese aliases.
        for (const original of entry.originals) {
            if (original === text) continue;
            const cached = this.resolveRuntimeTranslation(original, runtime, types, {
                harvestMissing: false,
            });
            if (cached !== original) return cached;
        }
        return text;
    }

    resolveMessageCacheSourceText({ text }) {
        // Native allText() already localized the runtime message. In particular,
        // do not follow another dictionary key if that result is also a key.
        return text;
    }

    normalizeTranslationEntry(entry, { runtime } = {}) {
        if (!entry || !this.isActive({ runtime }) || this.normalizedEntries.has(entry))
            return entry;
        const group =
            entry.type === 'choice'
                ? 'cmd'
                : ['message', 'message_portrait'].includes(entry.type)
                  ? 'msg'
                  : null;
        if (!group) return entry;
        const normalized = { ...entry, value: this.nativeText(group, entry.value) };
        this.normalizedEntries.add(normalized);
        return normalized;
    }

    async readData(name) {
        const response = await fetch(`data/${name}.json`);
        if (!response.ok) throw new Error(`Cannot read ${name}: ${response.status}`);
        return response.json();
    }

    scanCommands(list = []) {
        for (let index = 0; index < list.length; index++) {
            const command = list[index];
            if (command?.code === 101) {
                const entry = extractMessageEntryAt(list, index);
                if (entry?.text)
                    this.addSource(
                        this.nativeText('msg', entry.text),
                        entry.hasPortrait ? 'message_portrait' : 'message',
                        entry.text
                    );
                index = (entry?.nextIndex || index + 1) - 1;
            } else if (command?.code === 102) {
                for (const text of command.parameters[0] || [])
                    this.addSource(this.nativeText('cmd', text), 'choice', text);
            }
        }
    }

    async buildCatalog() {
        this.entries.clear();
        const data = window.$dataTranslations || (await this.readData('Translations'));
        this.sourceDictionary = data;
        const lang = this.language();
        for (const [text, translations] of Object.entries(data.cmd || {}))
            this.addSource((lang && translations[lang]) || text, 'command', text);
        for (const translations of Object.values(data.terms || {}))
            if (lang) this.addSource(translations[lang]);
        for (const [text, value] of Object.entries(data.custom?.[lang] || {}))
            if (text !== '_regex') this.addSource(value, this.getCacheType(), text);
        await Promise.all(
            DATABASES.map(async ([name, prefix, fields]) => {
                const rows = await this.readData(name);
                for (const row of rows || []) {
                    if (!row) continue;
                    // SRD's parser reads note literals only; use detached JSON records.
                    const detached = JSON.parse(JSON.stringify(row));
                    window.SRD.TranslationEngine.parseNoteData(detached);
                    for (const field of fields) {
                        const source =
                            (lang && detached._tt_translations?.[lang]?.[field]) || row[field];
                        this.addSource(this.nativeCustom(source), `${prefix}_${field}`, row[field]);
                    }
                }
            })
        );
        const system = await this.readData('System');
        for (const [group, values] of Object.entries(system.terms || {})) {
            for (const [id, original] of Object.entries(values || {})) {
                const termGroup =
                    group === 'messages' ? 'message' : group === 'params' ? 'param' : group;
                const key = `${termGroup}-${id}`;
                const source =
                    group === 'commands'
                        ? this.nativeText('cmd', original)
                        : (lang && data.terms?.[key]?.[lang]) || this.nativeCustom(original);
                this.addSource(
                    source,
                    group === 'commands' ? 'command' : this.getCacheType(),
                    original
                );
            }
        }
        const [common, maps] = await Promise.all([
            this.readData('CommonEvents'),
            this.readData('MapInfos'),
        ]);
        for (const event of common || []) this.scanCommands(event?.list);
        const mapIds = (maps || []).filter((map) => map?.id).map((map) => map.id);
        for (let start = 0; start < mapIds.length; start += 8)
            await Promise.all(
                mapIds.slice(start, start + 8).map(async (id) => {
                    const map = await this.readData(`Map${String(id).padStart(3, '0')}`);
                    for (const event of map.events || [])
                        for (const page of event?.pages || []) this.scanCommands(page.list);
                })
            );
        // Include authored dictionary messages not currently referenced by a map.
        for (const [text, translations] of Object.entries(data.msg || {})) {
            const source = (lang && translations[lang]) || text;
            if (!this.entries.has(source)) this.addSource(source, 'message', text);
        }
    }

    precomputeCounts() {
        const lang = this.language();
        if (!this.scanPromise || this.scanLanguage !== lang) {
            this.scanLanguage = lang;
            this.scanPromise = this.buildCatalog().catch((error) => {
                this.scanPromise = null;
                throw error;
            });
        }
        return this.scanPromise;
    }

    collectUntranslated({ runtime }) {
        const items = [];
        for (const [text, entry] of this.entries)
            for (const type of entry.types) {
                const cacheKey = runtime.getCacheKey(text, type);
                if (!runtime.hasUsableCacheValue(cacheKey))
                    items.push({ type, value: text, cacheKey, id: `srd_${items.length}` });
            }
        return items;
    }
    getCachedCountsSync({ runtime }) {
        const total = [...this.entries.values()].reduce((sum, entry) => sum + entry.types.size, 0);
        const left = this.collectUntranslated({ runtime }).length;
        return { total, left, totalStrings: total, leftStrings: left };
    }

    enablePluginTranslation() {
        const native = window.SRD?.TranslationEngine;
        if (typeof native?.translate !== 'function' || typeof native.parseNoteData !== 'function')
            return false;
        this.nativeTranslate = native.translate;
        const translator = this;
        native.translate = function (text) {
            return translator.resolveDisplay(translator.nativeCustom(text));
        };
        for (const method of ['basic', 'param', 'message']) {
            const original = window.TextManager?.[method];
            if (typeof original !== 'function') continue;
            window.TextManager[method] = function (...args) {
                return translator.resolveDisplay(original.apply(this, args));
            };
        }
        const message = window.Game_Message?.prototype;
        if (typeof message?.setChoices === 'function') {
            const setChoices = message.setChoices;
            message.setChoices = function (choices, ...args) {
                return setChoices.call(
                    this,
                    translator.isRuntimeTranslationActive()
                        ? choices.map((text) => translator.nativeText('cmd', text))
                        : choices,
                    ...args
                );
            };
        }
        this.precomputeCounts().catch((error) =>
            console.error('[SRDTranslationEngineTranslator] Scan failed', error)
        );
        return true;
    }
}
