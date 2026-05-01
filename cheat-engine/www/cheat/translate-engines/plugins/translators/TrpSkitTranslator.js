import { TAG_BRACKET, TAG_TYPE } from '../../ai-engine/constants.js';
import { BasePluginTranslator } from '../BasePluginTranslator.js';

// TRP_Skit prepends a display-name control sequence (e.g. \N<CharacterName>) to message
// lines whose raw text starts with a known actor inputName.
//
// We keep using standard `message` / `message_portrait` cache types, but normalize scanned
// command text in collection mode so cache keys and LLM payloads contain the same prefixed
// form that appears at runtime.

const TRP_SKIT_PLUGIN_TAGS = [
    {
        description: 'TRP_Skit character name display (backslash-N angle-bracket CharacterName)',
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        tagSymbol: 'N',
        bracket: TAG_BRACKET.ANGLE,
        maskValue: false,
        requiredConsistency: true,
    },
];

export class TRPSkitTranslator extends BasePluginTranslator {
    constructor() {
        super();
        /** @type {Map<string, string>|null} inputName → displayName */
        this._actorInputToDisplayMap = null;
    }

    getPluginName() {
        return 'TRP_Skit';
    }

    getPluginLabel() {
        return 'TRP Skit';
    }

    enablePluginTranslation() {
        this.registerPluginCustomTags(TRP_SKIT_PLUGIN_TAGS);
    }

    // ---------------------------------------------------------------------------
    // Actor name maps
    // ---------------------------------------------------------------------------

    /**
     * Build inputName → displayName map. Only includes actors where the two differ
     * (i.e. actors whose displayName contains a control-character prefix like \N<…>).
     * @returns {Map<string, string>}
     */
    _buildActorInputToDisplayMap() {
        if (this._actorInputToDisplayMap) {
            return this._actorInputToDisplayMap;
        }

        const map = new Map();
        const actors = this._resolveActors();

        for (const actor of actors) {
            if (!actor || typeof actor !== 'object') {
                continue;
            }

            const displayName = String(actor.name || '');
            const inputName = String(actor.inputName || displayName);

            if (!inputName || !displayName || displayName === inputName) {
                continue;
            }

            map.set(inputName, displayName);
        }

        this._actorInputToDisplayMap = map;
        return map;
    }

    /**
     * Resolve actor data from the already-parsed TRP_CORE runtime when available,
     * falling back to raw plugin parameter parsing.
     * @returns {Array<{name: string, inputName: string}>}
     */
    _resolveActors() {
        const dataActors = window.TRP_CORE?.skitParameters?.dataActors;

        if (dataActors && typeof dataActors === 'object') {
            return /** @type {any[]} */ (Object.values(dataActors));
        }

        return this._parseActorSettingsFromPlugins();
    }

    _parseActorSettingsFromPlugins() {
        if (!Array.isArray(window.$plugins)) {
            return [];
        }

        const configPlugin = window.$plugins.find(
            (p) =>
                p && typeof p.name === 'string' && p.name.trim().toLowerCase() === 'trp_skitconfig'
        );

        const raw = configPlugin?.parameters?.SkitActorSettings;
        if (typeof raw !== 'string' || !raw.trim()) {
            return [];
        }

        try {
            const arr = JSON.parse(raw);
            if (!Array.isArray(arr)) {
                return [];
            }

            return arr
                .map((item) => {
                    if (typeof item === 'string') {
                        try {
                            return JSON.parse(item);
                        } catch {
                            return null;
                        }
                    }
                    return item;
                })
                .filter((item) => item && typeof item === 'object');
        } catch {
            return [];
        }
    }

    // ---------------------------------------------------------------------------
    // resolveMessageCacheSourceText
    // ---------------------------------------------------------------------------

    /**
     * Called by message key normalization flows.
     *
     * In collection mode (`context.mode === 'collection'`), convert raw source text
     * starting with actor inputName into the TRP_Skit-prefixed display form, so
     * message cache keys preserve the \N<...> sequence.
     *
     * In runtime lookup mode, return null so the original runtime text is used as-is.
     *
     * @param {object} context - { text, runtime, hasPortrait, mode, gameMessage }
     * @returns {string|null} normalized source text, or null when unchanged
     */
    resolveMessageCacheSourceText(context = {}) {
        const text = typeof context.text === 'string' ? context.text : '';
        if (!text.trim()) {
            return null;
        }

        if (context.mode !== 'collection') {
            return null;
        }

        const actorMap = this._buildActorInputToDisplayMap();
        if (actorMap.size === 0) {
            return null;
        }

        for (const [inputName, displayName] of actorMap) {
            if (text.startsWith(inputName)) {
                return displayName + text.slice(inputName.length);
            }
        }

        return null;
    }
}
