import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { parseCsvTable, parseJsonSafely } from './TranslatorHelpers.js';

/**
 * Hendrix_Localization v1.5.9 (MV/MZ), RJ01414782.
 * Catalog the Original CSV column, independent of the selected official language.
 * The native processMessageBuffer replaces entire dialogues before our core sees
 * them. Keep authored text in that buffer's output while cheat translation is on.
 * Legacy DKTools {references} in this game's Original column have no active DK
 * dictionary; use their payload as the canonical source. Gameus quest steps
 * still reference the bundled Chinese DKTools quest dictionary. No game edits.
 */
export class HendrixLocalizationTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'Hendrix_Localization';
    }
    getPluginLabel() {
        return 'Hendrix Localization';
    }
    getCacheType() {
        return 'plugin_hendrix_localization';
    }

    sourceText(text, resolveReference = (key) => this.questTexts?.[key] ?? key) {
        return (
            String(text)
                .replace(/\{\{LINEBREAK\}\}/g, '\n')
                // eslint-disable-next-line no-control-regex -- Preserve RPG Maker ESC-prefixed font controls.
                .replace(/(?<![\\\x1b])\{([^{}]*)\}/g, (_, key) => resolveReference(key))
        );
    }

    async buildCatalog() {
        if (this.findPluginEntry('GameusQuestSystem')?.status) {
            const quests = await fetch('locales/zh-CN/quests.json');
            if (quests.ok) this.questTexts = parseJsonSafely(await quests.text());
        }
        const response = await fetch('game_messages.csv');
        if (!response.ok) throw new Error(`Cannot read game_messages.csv: ${response.status}`);
        const content = (await response.text()).replace(/^\uFEFF/, '');
        const header = content.split(/\r?\n/, 1)[0];
        const separator = header.includes(';Original;') ? ';' : ',';
        const rows = parseCsvTable(content, separator);
        const originalIndex = rows[0]?.indexOf('Original') ?? -1;
        if (originalIndex < 0) throw new Error('Hendrix CSV has no Original column');
        this.entries.clear();
        for (const row of rows.slice(1)) {
            const text = this.sourceText(row[originalIndex] || '');
            // CSV also contains asset names and synthetic variable lookup IDs.
            if (
                !this.isUsableText(text) ||
                /\.(?:png|webm|ogg|m4a)$/i.test(text) ||
                /^__VARIABLE__\d+__$/.test(text)
            )
                continue;
            this.entries.set(text, { text });
        }
        for (const text of Object.values(this.questTexts || {})) {
            if (this.isUsableText(text)) this.entries.set(text, { text });
        }
    }

    resolveMessageCacheSourceText({ text }) {
        return this.sourceText(text);
    }

    normalizeTranslationEntry(entry) {
        if (entry.type !== 'choice' && entry.type !== 'command') return entry;
        return { ...entry, value: this.sourceText(entry.value) };
    }

    cacheMessageTranslation(text, message, runtime = this.getRuntime()) {
        this.messageSources ??= new Set();
        this.messageSources.add(this.sourceText(text));
        return super.cacheMessageTranslation(text, message, runtime);
    }

    resolveRuntimeTranslation(text, runtime, cacheType = this.getCacheType(), options = {}) {
        if (this.messageSources?.has(text)) {
            const key = runtime.getCacheKey(text, cacheType);
            return runtime.hasUsableCacheValue(key) ? runtime.translationCache.get(key) : text;
        }
        // Standard messages own runtime harvesting. CSV-only misses belong to
        // mass translation, not a second empty entry for every seen dialogue.
        return super.resolveRuntimeTranslation(text, runtime, cacheType, {
            harvestMissing: false,
            ...options,
        });
    }

    resolveText(text, runtime, ...args) {
        if (typeof text !== 'string' || !this.isRuntimeTranslationActive(runtime)) return text;
        const source = this.questTexts?.[text] ?? this.sourceText(text);
        const translated = super.resolveText(source, runtime, ...args);
        if (translated !== source || this.questTexts?.[text]) return this.sourceText(translated);
        return this.sourceText(text, (key) => {
            const value = this.questTexts?.[key];
            return value ? super.resolveText(value, runtime, ...args) : key;
        });
    }

    enablePluginTranslation() {
        const prototype = window.Game_Message?.prototype;
        if (typeof prototype?.processMessageBuffer !== 'function') return false;
        if (!super.enablePluginTranslation()) return false;
        const process = prototype.processMessageBuffer;
        const translator = this;
        const runtime = this.getRuntime();
        const canonicalCommand = runtime.getCanonicalSystemCommandName;
        if (typeof canonicalCommand === 'function') {
            runtime.getCanonicalSystemCommandName = function (name) {
                return canonicalCommand.call(
                    this,
                    translator.isRuntimeTranslationActive(this) ? translator.sourceText(name) : name
                );
            };
        }
        const setChoices = prototype.setChoices;
        if (typeof setChoices === 'function') {
            prototype.setChoices = function (choices, ...args) {
                if (!translator.isRuntimeTranslationActive(translator.getRuntime()))
                    return setChoices.call(this, choices, ...args);
                // Native localization may select a different official language.
                // Keep authored sources for the core choice translator instead.
                const result = setChoices.call(this, choices, ...args);
                this._choices = choices.map((text) => translator.sourceText(text));
                return result;
            };
        }
        prototype.processMessageBuffer = function (...args) {
            const runtime = translator.getRuntime();
            if (!translator.isRuntimeTranslationActive(runtime) || !this.messageBuffer.length)
                return process.apply(this, args);
            const source = translator.sourceText(this.messageBuffer.join('\n'));
            const start = this._texts.length;
            const result = process.apply(this, args);
            // Preserve YEP word-wrap presentation injected by the native handler.
            const prefix =
                this._texts[start]?.startsWith('<WordWrap>') && !source.startsWith('<WordWrap>')
                    ? '<WordWrap>'
                    : '';
            const canonical = prefix + source;
            this._texts.splice(start, this._texts.length - start, ...canonical.split('\n'));
            translator.cacheMessageTranslation(canonical, this, runtime);
            return result;
        };
        return true;
    }
}
