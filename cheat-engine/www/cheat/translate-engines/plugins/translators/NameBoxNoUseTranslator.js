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

    resolveMessageCacheSourceText({ text, mode, gameMessage } = {}) {
        // The event text is the canonical source. allText adds presentation only.
        // Static formats (including whitespace-only formats) do not require a
        // speaker lookup: TRP_Skit can resolve that field differently at runtime.
        if (mode === 'collection' || !text) return null;
        const parameters = this.findPluginEntry(this.getPluginName())?.parameters || {};
        const format = toSafeString(parameters.speakerFormat);
        const speaker =
            format && !format.includes('%1')
                ? '_'
                : this.resolveSpeakerName(gameMessage || window.$gameMessage);
        const prefix = this.buildSpeakerPrefix(speaker, parameters);
        return prefix && text.startsWith(prefix) ? text.slice(prefix.length) : null;
    }
}
