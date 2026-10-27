import { KeyValueStorage } from './KeyValueStorage.js';

// Portable game configuration travels with the split translation cache. Engine
// credentials, prompts and generation preferences stay in the local settings.
export const GAME_TRANSLATION_SETTINGS_KEYS = Object.freeze([
    'enableTextWrapping',
    'maxLineWidth',
    'maxLineWidthWithPortrait',
    'descriptionMaxLineWidth',
    'linkDescriptionMaxWidthToDialogue',
    'descriptionMaxRows',
    'addBoxWidthInfoToLlmPrompt',
    'removeNewlinesBeforeWrappingMaxCount',
    'textWrapFontScaleMultiplier',
    'enableImageReplacement',
    'autoSwitchNameInputLanguage',
    'enabledPluginTranslators',
    'nameProfilesByLangPair',
    'namePatternForEnforcing',
    'officialNameEnforcementMode',
    'officialNameEnforcementIncludeAllText',
]);

export const GAME_TAG_SETTINGS_KEYS = Object.freeze([
    'aiTagFormat',
    'aiCustomTags',
    'aiTagOverrides',
    'customTags',
    'tagOverrides',
]);

export function pickGameTranslationSettings(source) {
    return Object.fromEntries(
        GAME_TRANSLATION_SETTINGS_KEYS.filter((key) => source[key] !== undefined).map((key) => [
            key,
            source[key],
        ])
    );
}

export class GameTranslationSettings {
    constructor(directory = './www/cheat-settings/translate-cache') {
        this.directory = directory;
        this.storage = new KeyValueStorage(require('path').join(directory, 'game-settings.json'));
    }

    read() {
        const data = this.storage.getAll();
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            throw new Error('Invalid game translation settings');
        }
        return data;
    }

    updateSection(section, values, { missingOnly = false } = {}) {
        const data = this.read();
        const previous = data[section] || {};
        const next = missingOnly ? { ...values, ...previous } : { ...previous, ...values };
        if (JSON.stringify(previous) !== JSON.stringify(next) || !data[section]) {
            require('fs').mkdirSync(this.directory, { recursive: true });
            this.storage.setAll({ ...data, [section]: next });
        }
        return next;
    }
}
