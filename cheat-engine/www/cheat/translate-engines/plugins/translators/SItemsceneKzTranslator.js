import { TAG_TYPE } from '../../ai-engine/constants.js';
import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * S_Itemscene_kz translator.
 *
 * Supported plugin versions:
 * - Unknown version (header does not declare version): MV target.
 *
 * Translation notes:
 * - Plugin displays item note tags `<br:...>` (description) and `<ill:...>` (image file name)
 *   in a custom item info window.
 * - Mass translation is intentionally not re-scanned here: this translator reuses entries already
 *   collected in the standard `item_note` cache.
 * - Runtime hook point is `Scene_Item.prototype.update` after original plugin behavior runs;
 *   we only replace visible description payload in `Window_Info.setText(...)` arguments.
 */

const PLUGIN_NAME = 'S_Itemscene_kz';
const CACHE_TYPE = 'plugin_s_itemscene_kz';
const ITEM_NOTE_CACHE_TYPE = 'item_note';
const RUNTIME_HOOK_FLAG = '__CHEAT_S_ITEMSCENE_KZ_TRANSLATOR_HOOKED__';

const S_ITEMSCENE_KZ_TAGS = [
    {
        description: 'Image file name displayed by S_Itemscene_kz <ill:...> item note tag.',
        style: 'xml',
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        tagSymbol: 'ill',
        bracket: 'none',
        maskValue: true,
        requiredConsistency: true,
        alwaysTranslate: false,
        alwaysAddToKnowledgeBase: false,
    },
    {
        description: 'Description text displayed by S_Itemscene_kz <br:...> item note tag.',
        style: 'xml',
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        tagSymbol: 'br',
        bracket: 'none',
        maskValue: false,
        requiredConsistency: true,
        alwaysTranslate: true,
        alwaysAddToKnowledgeBase: true,
    },
];

function extractNoteTagValue(noteText, tagSymbol) {
    const source = String(noteText || '');
    const symbol = String(tagSymbol || '').trim();
    if (!source || !symbol) {
        return '';
    }

    const escapedTag = symbol.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
    const matcher = new RegExp(String.raw`<\s*${escapedTag}\s*[:：]([\s\S]*?)>`, 'i');
    const match = matcher.exec(source);
    return String(match?.[1] || '').trim();
}

function getOriginalItemNote(item) {
    if (!item || typeof item !== 'object') {
        return '';
    }

    const originalNote = item._translateOriginal?.note;
    if (typeof originalNote === 'string' && originalNote.trim() !== '') {
        return originalNote;
    }

    return '';
}

export class SItemsceneKzTranslator extends BasePluginTranslator {
    getPluginName() {
        return PLUGIN_NAME;
    }

    getPluginLabel() {
        return 'S Itemscene kz';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    async precomputeCounts() {
        return;
    }

    async buildScanEntries() {
        return [];
    }

    collectUntranslated() {
        return [];
    }

    getCachedCountsSync() {
        return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
    }

    enablePluginTranslation() {
        if (
            !window.Scene_Item?.prototype ||
            typeof window.Scene_Item.prototype.update !== 'function'
        ) {
            return false;
        }

        const sceneItemPrototype = window.Scene_Item.prototype;
        if (sceneItemPrototype[RUNTIME_HOOK_FLAG]) {
            this.registerPluginCustomTags(S_ITEMSCENE_KZ_TAGS);
            return true;
        }

        const originalUpdate = sceneItemPrototype.update;
        const getRuntime = this.getRuntime.bind(this);
        const isUsableText = this.isUsableText.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);

        sceneItemPrototype.update = function () {
            const result = originalUpdate.apply(this, arguments);

            try {
                const runtime = getRuntime();
                if (!runtime || typeof this.item !== 'function') {
                    return result;
                }

                const infoWindow = this._InfoWindow;
                if (!infoWindow || typeof infoWindow.setText !== 'function') {
                    return result;
                }

                const item = this.item();
                const currentNote = String(item?.note || '');
                const sourceDescription = extractNoteTagValue(currentNote, 'br');
                const sourceIll = extractNoteTagValue(currentNote, 'ill');

                let resolvedNote = currentNote;
                const originalNote = getOriginalItemNote(item);
                if (isUsableText(originalNote)) {
                    const cacheKey = runtime.getCacheKey(originalNote, ITEM_NOTE_CACHE_TYPE);
                    runtime.trackCacheKeyUsage(cacheKey);

                    if (isRuntimeTranslationActive(runtime)) {
                        resolvedNote = resolveRuntimeTranslation(
                            originalNote,
                            runtime,
                            ITEM_NOTE_CACHE_TYPE,
                            {
                                requireRuntimeTranslationActive: true,
                                missValue: currentNote,
                                harvestMissing: true,
                            }
                        );
                    }
                }

                const translatedDescription = extractNoteTagValue(resolvedNote, 'br');
                const translatedIll = extractNoteTagValue(resolvedNote, 'ill');

                const nextDescription =
                    (isUsableText(translatedDescription) && translatedDescription) ||
                    (isUsableText(sourceDescription) && sourceDescription) ||
                    String(item?.meta?.br || '');

                if (!isUsableText(nextDescription)) {
                    return result;
                }

                const nextIll =
                    (isUsableText(translatedIll) && translatedIll) ||
                    (isUsableText(sourceIll) && sourceIll) ||
                    String(item?.meta?.ill || '');

                infoWindow.setText(nextDescription, nextIll);
            } catch (error) {
                console.warn(
                    '[SItemsceneKzTranslator] Failed to apply runtime item description translation',
                    error
                );
            }

            return result;
        };

        sceneItemPrototype[RUNTIME_HOOK_FLAG] = true;
        this.registerPluginCustomTags(S_ITEMSCENE_KZ_TAGS);
        return true;
    }
}
