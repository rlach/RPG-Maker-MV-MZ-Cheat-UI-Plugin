import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/**
 * Nore rogue UI family, unversioned TypeScript-compiled MZ build (RJ333870).
 * Catalogs enabled Nore plugin display literals, vocabulary tables, format
 * templates and database hint/desc metadata. Source metadata, item identities,
 * gallery unlock rules, assets and scenario commands are never rewritten.
 * Nore_Tes scenario extraction remains owned by SabaSimpleScenarioTranslator.
 */
export class NoreRogueUiTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'Nore_RogueMenu';
    }

    getPluginLabel() {
        return 'Nore Rogue menus and statistics';
    }

    getCacheType() {
        return 'plugin_nore_rogue_ui';
    }

    getSourcePluginNames() {
        return window.$plugins
            .filter(
                (plugin) =>
                    plugin.status &&
                    /^(?:Nore_|VocabQuest$|VocabEro$|RecollectionMode$)/.test(plugin.name)
            )
            .map((plugin) => plugin.name);
    }

    shouldScanEventData() {
        return false;
    }

    collectSourceCatalog(source) {
        const catalog = super.collectSourceCatalog(source);
        for (const entry of catalog.entries) {
            if (entry.parts || !/%\d+/.test(entry.text)) continue;
            entry.parts = entry.text.split(/%\d+/);
            entry.text = entry.parts
                .map(
                    (part, index) =>
                        part + (index < entry.parts.length - 1 ? `\\COT[${index}]` : '')
                )
                .join('');
        }
        return catalog;
    }

    async collectAdditionalTexts() {
        for (const name of ['Items', 'Armors', 'Weapons', 'Skills', 'Enemies', 'States']) {
            const response = await fetch(`data/${name}.json`);
            if (!response.ok) throw new Error(`Cannot read ${name}: ${response.status}`);
            const rows = parseJsonSafely(await response.text());
            if (!Array.isArray(rows)) throw new Error(`Invalid ${name} database`);
            for (const row of rows) {
                // Database files have notes but no DataManager-generated meta yet.
                for (const match of (row?.note || '').matchAll(/<(?:hint|get|desc\d+):([^>]+)>/g)) {
                    const text = match[1];
                    if (this.isUsableText(text)) this.entries.set(text, { text });
                    for (const line of text.split('\n'))
                        if (this.isUsableText(line)) this.entries.set(line, { text: line });
                }
            }
        }
    }

    enablePluginTranslation() {
        if (typeof window.Window_Fukidashi?.prototype.startMessage !== 'function') return false;
        if (!super.enablePluginTranslation()) return false;
        const translator = this;
        for (const prototype of [
            window.Window_Fukidashi.prototype,
            window.Window_Message2?.prototype,
        ]) {
            if (!prototype || !Object.prototype.hasOwnProperty.call(prototype, 'startMessage'))
                continue;
            const start = prototype.startMessage;
            prototype.startMessage = function (...args) {
                const message = window.$gameMessage;
                const texts = message._texts;
                const source = texts.join('\n');
                const runtime = translator.getRuntime();
                const originalText = message._translateOriginalText;
                const applied = translator.isUsableText(originalText)
                    ? runtime.getPreferredMessageCacheEntry(originalText)?.value
                    : null;
                if (
                    translator.isUsableText(applied) &&
                    applied.replace(/\n+$/, '') === source.replace(/\n+$/, '')
                ) {
                    return start.apply(this, args);
                }
                // These windows override startMessage and never invoke the core
                // implementation. Resolve every message, independent of stale
                // _translationApplied state left on a reused message window.
                const translated = translator.resolveRuntimeMessageTranslation(source, runtime);
                if (translated !== source) message._texts = translated.split('\n');
                try {
                    return start.apply(this, args);
                } finally {
                    message._texts = texts;
                }
            };
        }
        return true;
    }
}
