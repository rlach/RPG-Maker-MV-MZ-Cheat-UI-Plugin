import { BasePluginTranslator } from '../BasePluginTranslator.js';

function toSafeString(value) {
    if (typeof value === 'string') {
        return value;
    }

    if (value === null || value === undefined) {
        return '';
    }

    return String(value);
}

function parseBoolean(value, defaultValue = false) {
    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') {
            return true;
        }

        if (normalized === 'false') {
            return false;
        }
    }

    return !!defaultValue;
}

export class NameBoxNoUseTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'NameBoxNoUse';
    }

    getPluginLabel() {
        return 'NameBoxNoUse';
    }

    getCacheType() {
        return 'plugin_name_box_no_use';
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

    resolveSpeakerName(gameMessage) {
        if (!gameMessage || typeof gameMessage !== 'object') {
            return '';
        }

        if (typeof gameMessage.speakerName === 'function') {
            try {
                const name = gameMessage.speakerName();
                if (typeof name === 'string') {
                    return name;
                }
            } catch (_error) {
                // Ignore speakerName accessor failures and fall back to internal field.
            }
        }

        if (typeof gameMessage._speakerName === 'string') {
            return gameMessage._speakerName;
        }

        return '';
    }

    buildSpeakerPrefix(speakerName, parameters) {
        const safeSpeakerName = toSafeString(speakerName);
        if (!safeSpeakerName) {
            return '';
        }

        const speakerFormat = toSafeString(parameters && parameters.speakerFormat);
        const wrap = parseBoolean(parameters && parameters.wrap, true);
        const formattedSpeaker = speakerFormat
            ? speakerFormat.replace(/%1/g, safeSpeakerName)
            : safeSpeakerName;

        if (!formattedSpeaker) {
            return '';
        }

        return formattedSpeaker + (wrap ? '\n' : '');
    }

    resolveMessageCacheSourceText(context = {}) {
        const contextObject = context && typeof context === 'object' ? context : {};
        const runtime = contextObject['runtime'] || null;
        const text = contextObject['text'];
        const gameMessage = contextObject['gameMessage'];

        if (!this.isRuntimeTranslationActive(runtime)) {
            return null;
        }

        const sourceText = toSafeString(text);
        if (!sourceText || !sourceText.trim()) {
            return null;
        }

        const pluginEntry = this.findPluginEntry();
        if (!pluginEntry || !pluginEntry.status) {
            return null;
        }

        const speakerName = this.resolveSpeakerName(
            gameMessage || (typeof $gameMessage !== 'undefined' ? $gameMessage : null)
        );
        if (!speakerName) {
            return null;
        }

        const prefix = this.buildSpeakerPrefix(speakerName, pluginEntry.parameters || {});
        if (!prefix || !sourceText.startsWith(prefix)) {
            return null;
        }

        const stripped = sourceText.slice(prefix.length);
        if (!stripped) {
            return null;
        }

        return stripped;
    }
}
