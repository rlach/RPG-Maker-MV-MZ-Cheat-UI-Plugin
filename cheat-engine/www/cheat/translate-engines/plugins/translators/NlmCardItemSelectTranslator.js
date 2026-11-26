import { BasePluginTranslator } from '../BasePluginTranslator.js';

const PICTURE_TAGS = ['CIPic', 'CSPic', 'CILayer', 'BILayer', 'CSLayer'];

function pictureTags(note) {
    const tags = new Map();
    for (const match of String(note || '').matchAll(/<([^<>:]+):([^<>]*)>/g))
        if (PICTURE_TAGS.includes(match[1]) && match[2]) tags.set(match[1], match[2]);
    return tags;
}

/** NLM_CardItemSelectMZ 1.2.1 (MZ, compatible 1.0–1.2 asset tags).
 * Card backgrounds/layers are filenames, not translated display names.
 * Repair only proven translated metadata aliases at the image-load boundary,
 * including equipment previews and event scripts using these same card tags.
 * No database fields, cache entries, picture names or save data are mutated.
 */
export class NlmCardItemSelectTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'NLM_CardItemSelectMZ';
    }
    getPluginLabel() {
        return 'NLM Card Item Select';
    }
    getCacheType() {
        return 'plugin_nlm_card_item_select';
    }
    collectUntranslated() {
        return [];
    }

    resolvePictureSource(filename) {
        if (typeof filename !== 'string' || !filename) return filename;
        const originals = new Set();
        const candidates = new Set();
        const runtime = this.getRuntime();
        for (const [table, type] of [
            [window.$dataItems, 'item'],
            [window.$dataSkills, 'skill'],
            [window.$dataWeapons, 'weapon'],
            [window.$dataArmors, 'armor'],
        ]) {
            for (const item of table || []) {
                if (!item) continue;
                const sourceNote = item._translateOriginal?.note ?? item.note;
                const sourceTags = pictureTags(sourceNote);
                for (const source of sourceTags.values()) originals.add(source);
                // Only a canonical snapshot proves that another value is a translation.
                if (typeof item._translateOriginal?.note !== 'string') continue;
                const cachedNote = runtime.translationCache.get(
                    runtime.getCacheKey(sourceNote, `${type}_note`)
                );
                const displayNotes = [pictureTags(item.note), pictureTags(cachedNote)];
                for (const [tag, source] of sourceTags) {
                    if (
                        item.meta?.[tag] === filename ||
                        displayNotes.some((tags) => tags.get(tag) === filename)
                    )
                        candidates.add(source);
                }
            }
        }
        // Authored filenames win over aliases, and ambiguous aliases stay untouched.
        return originals.has(filename) || candidates.size !== 1 ? filename : [...candidates][0];
    }

    enablePluginTranslation() {
        const manager = window.ImageManager;
        if (typeof manager?.loadPicture !== 'function') return false;
        const load = manager.loadPicture;
        const translator = this;
        manager.loadPicture = function (filename, ...args) {
            return load.call(this, translator.resolvePictureSource(filename), ...args);
        };
        return true;
    }
}
