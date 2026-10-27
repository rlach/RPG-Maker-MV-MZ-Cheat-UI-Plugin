import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { parseJsonSafely, parseStructArraySafely } from './TranslatorHelpers.js';

/**
 * Seed Presser v1.0.8, MV: SceneCustomMenu 1.26.4 authored UI.
 * Gallery captions/profiles and equipment details live in note metadata;
 * shop quantity labels are evaluated JavaScript templates. Translate rendering
 * only, preserving actor identities, switches, assets and executable scripts.
 */
export class SeedPresserUITranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'SeedPresserUI';
    }
    getPluginAliases() {
        return ['SceneCustomMenu'];
    }
    getPluginLabel() {
        return 'Seed Presser gallery, equipment and shop';
    }
    getCacheType() {
        return 'plugin_seed_presser_ui';
    }
    getSourcePluginNames() {
        return [];
    }
    shouldScanEventData() {
        return false;
    }
    detectPlugin() {
        const plugin = this.findPluginEntry('SceneCustomMenu');
        return (
            !!plugin?.status &&
            Object.values(plugin.parameters || {}).some(
                (value) => parseJsonSafely(value)?.Id === 'Scene_Site'
            )
        );
    }
    async collectAdditionalTexts() {
        const plugin = this.findPluginEntry('SceneCustomMenu');
        const fields = new Set();
        for (const value of Object.values(plugin.parameters)) {
            const scene = parseJsonSafely(value);
            if (!scene?.Id) continue;
            for (const win of parseStructArraySafely(scene.WindowList)) {
                const lines = parseJsonSafely(win.ItemDrawScript, []);
                const script = Array.isArray(lines) ? lines.join('\n') : '';
                if (!script) continue;
                for (const entry of this.extractCatalog(script).entries)
                    this.entries.set(entry.text, entry);
                for (const match of script.matchAll(/drawNoteText\(\s*['"]([^'"]+)['"]/g))
                    fields.add(match[1]);
                // These two metadata fields are explicitly composed into the
                // equipment description by this game's rendering script.
                for (const field of ['plus', 'minus'])
                    if (script.includes(`item.meta.${field}`)) fields.add(field);
            }
        }
        await Promise.all(
            ['Actors', 'Items', 'Weapons', 'Armors'].map(async (name) => {
                const response = await fetch(`data/${name}.json`);
                if (!response.ok) throw new Error(`Cannot read ${name}: ${response.status}`);
                for (const record of await response.json()) {
                    for (const match of (record?.note || '').matchAll(/<([^<>:]+):([^<>]*)>/g)) {
                        if (fields.has(match[1]) && this.isUsableText(match[2]))
                            this.entries.set(match[2], { text: match[2] });
                    }
                }
            })
        );
        // The shop uses D_TEXT in common events rather than SceneCustomMenu.
        // Keep escape-controlled values dynamic and share the visible label
        // across the three shop slots (each uses a different variable ID).
        const response = await fetch('data/CommonEvents.json');
        if (!response.ok) throw new Error(`Cannot read CommonEvents: ${response.status}`);
        for (const event of await response.json()) {
            for (const command of event?.list || []) {
                if (command.code !== 356) continue;
                const match = /^D_TEXT\s+([\s\S]*?)\s+\d+\s*$/i.exec(command.parameters[0]);
                if (!match) continue;
                for (const text of match[1].split(/\\[a-z]+\[[^\]]*\]/i)) {
                    if (this.isUsableText(text) && /\p{L}/u.test(text))
                        this.entries.set(text, { text });
                }
            }
        }
    }
}
