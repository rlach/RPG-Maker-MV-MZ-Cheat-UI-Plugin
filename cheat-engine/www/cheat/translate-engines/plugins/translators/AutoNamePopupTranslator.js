import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/**
 * AutoNamePopup translator (MV/MZ, plugin ver.5.x).
 *
 * AutoNamePopup can prepend a formatted name line and optionString to message
 * body text at runtime. Event traversal collects the original Show Text body,
 * so runtime cache lookup may miss when keys are built from unprefixed source.
 * This translator augments collection-time message keys with the same
 * AutoNamePopup-composed prefixes (name template + optionString) so translated
 * results preserve who is speaking.
 * v5.1.2 (MZ): resolve face-mapped popup names through actor_name before the
 * plugin applies its formatting template. Inline message prefixes stay original.
 */
export class AutoNamePopupTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'AutoNamePopup';
    }

    getPluginLabel() {
        return 'AutoNamePopup';
    }

    getCacheType() {
        return 'plugin_auto_name_popup';
    }

    enablePluginTranslation() {
        const prototype = window.Game_System?.prototype;
        const method =
            typeof prototype?.getNameKeyParam === 'function' ? 'getNameKeyParam' : 'getNamePopup';
        if (typeof prototype?.[method] !== 'function') return false;
        const original = prototype[method];
        const translator = this;
        const config = this._resolveRuntimeConfig();
        prototype[method] = function (key, prop) {
            const source = original.apply(this, arguments);
            if ((method === 'getNameKeyParam' && prop !== 'name') || config.inTheWindow)
                return source;
            const runtime = translator.getRuntime();
            if (!translator.isRuntimeTranslationActive(runtime)) return source;
            return translator.resolveRuntimeTranslation(source, runtime, 'actor_name');
        };
        return true;
    }

    _resolveRuntimeConfig(modeOverride) {
        const pluginEntry = this.findPluginEntry(this.getPluginName());
        const parameters = pluginEntry?.parameters || {};

        const configuredMode = Number(parameters.mode || 0);
        const mode = modeOverride ?? configuredMode;
        const useMZ = Utils?.RPGMAKER_NAME === 'MZ';
        const inTheWindow = mode > 0 || !useMZ;

        let template = String(parameters.template || '%1');
        const startNewLine = String(parameters.startNewLine || 'true') === 'true';
        // The native changeMode command changes placement, not the startup template.
        if ((useMZ ? configuredMode === 1 : configuredMode < 2) && startNewLine) {
            template += '\n';
        }

        return { inTheWindow, template };
    }

    _resolveMappedCharacterNameFromKey(faceName, faceIndex) {
        if (!this.isUsableText(faceName)) {
            return '';
        }

        const nameKeyMap = this._buildNameKeyMap();
        const key = `${faceName}:${Number(faceIndex || 0)}`;
        const value = nameKeyMap.get(key);
        if (!value || typeof value !== 'object') {
            return '';
        }

        return String(value.name || '');
    }

    _resolveOptionStringFromKey(faceName, faceIndex) {
        if (!this.isUsableText(faceName)) {
            return '';
        }

        const nameKeyMap = this._buildNameKeyMap();
        const key = `${faceName}:${Number(faceIndex || 0)}`;
        const value = nameKeyMap.get(key);
        if (!value || typeof value !== 'object') {
            return '';
        }

        return String(value.optionString || '');
    }

    _formatTemplate(template, value) {
        return String(template || '%1').replaceAll('%1', String(value || ''));
    }

    _extractFaceInfoFromCommand(command) {
        const parameters = Array.isArray(command?.parameters) ? command.parameters : [];
        const faceName = String(parameters[0] || '');
        const faceIndex = Number(parameters[1] || 0);
        const commandName = String(parameters[4] || '');
        return { faceName, faceIndex, commandName };
    }

    _resolveCharacterNameFromCommand(command) {
        const faceInfo = this._extractFaceInfoFromCommand(command);
        const commandName = faceInfo.commandName;
        if (this.isUsableText(commandName) && commandName !== '_') {
            return commandName;
        }

        if (commandName === '_') {
            return '';
        }

        return this._resolveMappedCharacterNameFromKey(faceInfo.faceName, faceInfo.faceIndex);
    }

    _resolveOptionStringFromCommand(command) {
        const faceInfo = this._extractFaceInfoFromCommand(command);
        return this._resolveOptionStringFromKey(faceInfo.faceName, faceInfo.faceIndex);
    }

    _buildCollectionPrefix(command, modeOverride) {
        const characterName = this._resolveCharacterNameFromCommand(command);
        if (!this.isUsableText(characterName)) {
            return '';
        }

        const config = this._resolveRuntimeConfig(modeOverride);
        const optionString = this._resolveOptionStringFromCommand(command);
        const namePrefix = config.inTheWindow
            ? this._formatTemplate(config.template, characterName)
            : '';
        return `${namePrefix}${optionString}`;
    }

    _buildNameKeyMap() {
        if (this._nameKeyMap instanceof Map) {
            return this._nameKeyMap;
        }

        const pluginEntry = this.findPluginEntry(this.getPluginName());
        const parameters = pluginEntry?.parameters || {};

        const actorExpressions = Math.max(1, Number(parameters.actorFacialExpressions || 1));
        const characterExpressions = Math.max(
            1,
            Number(parameters.characterFacialExpressions || 1)
        );

        const rawNameKeys = parseJsonSafely(parameters.nameKeys, []);
        const nameKeyRows = Array.isArray(rawNameKeys)
            ? rawNameKeys
                  .map((row) => parseJsonSafely(row, null))
                  .filter((row) => row && typeof row === 'object')
            : [];

        const map = new Map();
        for (const row of nameKeyRows) {
            const faceName = String(row.faceName || '');
            if (!this.isUsableText(faceName)) {
                continue;
            }

            const startFaceIndex = Number(row.faceIndex || 0);
            const rawExpressions = Number(row.facialExpressions || 0);
            let expressions = characterExpressions;
            if (rawExpressions === -1) {
                expressions = actorExpressions;
            } else if (rawExpressions > 0) {
                expressions = rawExpressions;
            }

            for (let i = 0; i < expressions; i += 1) {
                const currentFaceIndex = startFaceIndex + i;
                const key = `${faceName}:${currentFaceIndex}`;
                map.set(key, {
                    name: String(row.name || ''),
                    optionString: String(row.optionString || ''),
                });
            }
        }

        this._nameKeyMap = map;
        return map;
    }

    _prependCollectionPrefix(sourceText, command) {
        const prefix = this._buildCollectionPrefix(command);
        if (!this.isUsableText(prefix)) {
            return sourceText;
        }

        if (sourceText.startsWith(prefix)) {
            return sourceText;
        }

        return `${prefix}${sourceText}`;
    }

    _resolveChangedText(sourceText, normalizedText) {
        if (normalizedText === sourceText) {
            return null;
        }

        return normalizedText;
    }

    resolveMessageCacheSourceText(context = {}) {
        if (context.entry?.autoNamePopupComposed) return null;
        const sourceText = typeof context.text === 'string' ? context.text : '';
        if (!sourceText) {
            return null;
        }

        if (context.mode === 'collection') {
            const withPrefix = this._prependCollectionPrefix(sourceText, context.command || null);
            return this._resolveChangedText(sourceText, withPrefix);
        }

        return null;
    }

    getEventCommandTraversalExtension() {
        // Some shipped builds switch between popup and inline names every frame.
        // Harvest both possible bodies, rather than depending on the current save.
        const parameters = this.findPluginEntry(this.getPluginName())?.parameters || {};
        if (!(Number(parameters.switchId) > 0)) return null;
        return {
            collectEntriesAt: ({ list, index, command, pushEntry, helpers }) => {
                const message = helpers.extractMessageEntryAt(list, index);
                if (!message) return null;
                const noName = message.speaker === '_' || message.text.startsWith('_');
                const body = message.text.startsWith('_') ? message.text.slice(1) : message.text;
                const values = new Set(
                    [0, 1].map(
                        (mode) => (noName ? '' : this._buildCollectionPrefix(command, mode)) + body
                    )
                );
                if (!noName && this.isUsableText(message.speaker))
                    pushEntry({
                        type: 'speaker',
                        value: message.speaker,
                        command,
                        cmdIndex: index,
                    });
                for (const value of values)
                    pushEntry({
                        type: message.hasPortrait ? 'message_portrait' : 'message',
                        value,
                        command,
                        cmdIndex: index,
                        nextIndex: message.nextIndex,
                        autoNamePopupComposed: true,
                    });
                return { handled: true, nextIndex: message.nextIndex };
            },
        };
    }

    collectUntranslated() {
        // No dedicated extraction required; generic message traversal covers source text.
        return [];
    }

    getCachedCountsSync() {
        return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
    }
}
