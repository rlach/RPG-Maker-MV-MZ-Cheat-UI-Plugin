import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../js/translation-runtime/ObjectTranslationModalMethods.js';
import { TAG_BRACKET, TAG_STYLE, TAG_TYPE } from '../../ai-engine/constants.js';

/**
 * DTextPicture translator.
 *
 * Supported plugin versions:
 * - DTextPicture.js v1.20.5 (MV/MZ): runtime hook on Game_Screen#setDTextPicture.
 * - DTextPicture.js v1.20.2 modified fork (MV): runtime hook on
 *   Game_Interpreter#pluginCommandDTextPicture (interpreter-local D_TEXT pipeline,
 *   no Game_Screen#setDTextPicture available).
 *
 * Notes:
 * - Mass-translation scanning reads D_TEXT command payloads from MV (356) and MZ (357)
 *   event commands in maps/common events.
 * - Runtime translation only mutates text payloads, never command tokens.
 */

function normalizeCommandName(value) {
    return String(value || '')
        .trim()
        .toUpperCase();
}

function addTagWithNumericParameter(tagSymbol, description) {
    return {
        description,
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        style: TAG_STYLE.ESCAPE,
        tagSymbol,
        bracket: TAG_BRACKET.SQUARE,
        requiredConsistency: true,
    };
}

function addTagWithCustomParameter(tagSymbol, description) {
    return {
        description,
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        style: TAG_STYLE.ESCAPE,
        tagSymbol,
        bracket: TAG_BRACKET.SQUARE,
        maskValue: true,
        requiredConsistency: true,
    };
}

const PLUGIN_TAGS = [
    addTagWithNumericParameter('ITEM', 'Item information for item number (icon + name)'),
    addTagWithNumericParameter('WEAPON', 'Weapon information for weapon number (icon + name)'),
    addTagWithNumericParameter('ARMOR', 'Armor information for armor number (icon + name)'),
    addTagWithNumericParameter('SKILL', 'Skill information for skill number (icon + name)'),
    addTagWithNumericParameter('STATE', 'State information for state number (icon + name)'),
    addTagWithNumericParameter(
        'OC',
        'Outline color information for outline color number (icon + name)'
    ),
    addTagWithNumericParameter(
        'OW',
        'Outline width information for outline width number (icon + name)'
    ),
    addTagWithCustomParameter(
        'F',
        'Change font to specified style (b: bold, i: italic, n: normal)'
    ),
    addTagWithCustomParameter(
        'OC',
        'Change outline color to specified color (color name, rgb(), or color number)'
    ),
    addTagWithCustomParameter(
        'V',
        'Parameters [n,m] - The value of a variable padded with characters specified by m-digit parameters'
    ),
];

export class DTextPictureTranslator extends BasePluginTranslator {
    initialDelayBeforeEnablePluginTranslationMs = 1000;

    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'DTextPicture';
    }

    getPluginLabel() {
        return 'DTextPicture';
    }

    getCacheType() {
        return 'plugin_dtext';
    }

    enablePluginTranslation() {
        this.registerPluginCustomTags(PLUGIN_TAGS);

        const hasLegacyHookPoint =
            !!window.Game_Screen?.prototype &&
            typeof Game_Screen.prototype.setDTextPicture === 'function';
        const hasModifiedHookPoint =
            !!window.Game_Interpreter?.prototype &&
            typeof Game_Interpreter.prototype.pluginCommandDTextPicture === 'function';

        if (hasLegacyHookPoint) {
            this.installLegacySetDTextPictureHook();
            return true;
        }

        if (hasModifiedHookPoint) {
            this.installModifiedInterpreterHook();
            return true;
        }

        return false;
    }

    installLegacySetDTextPictureHook() {
        const original = Game_Screen.prototype.setDTextPicture;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);
        const getCacheType = this.getCacheType.bind(this);

        Game_Screen.prototype.setDTextPicture = function (value, size) {
            const runtime = getRuntime();
            if (runtime && isRuntimeTranslationActive(runtime)) {
                arguments[0] = resolveRuntimeTranslation(value, runtime, getCacheType(), {
                    missValue: value,
                    requireRuntimeTranslationActive: true,
                });
            }

            return original.apply(this, arguments);
        };
    }

    installModifiedInterpreterHook() {
        const original = Game_Interpreter.prototype.pluginCommandDTextPicture;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const buildTranslatedModifiedDTextArgs = this.buildTranslatedModifiedDTextArgs.bind(this);

        Game_Interpreter.prototype.pluginCommandDTextPicture = function (command, args) {
            const runtime = getRuntime();
            if (
                runtime &&
                isRuntimeTranslationActive(runtime) &&
                normalizeCommandName(command) === 'D_TEXT' &&
                Array.isArray(args) &&
                args.length > 0
            ) {
                const translatedArgs = buildTranslatedModifiedDTextArgs(args, runtime);
                if (translatedArgs) {
                    arguments[1] = translatedArgs;
                }
            }

            return original.apply(this, arguments);
        };
    }

    buildTranslatedModifiedDTextArgs(args, runtime) {
        const workingArgs = args.slice();
        let trailingSizeToken = null;

        if (workingArgs.length > 1) {
            const lastToken = String(workingArgs[workingArgs.length - 1] || '');
            if (/^[+-]?\d+$/.test(lastToken)) {
                trailingSizeToken = workingArgs.pop();
            }
        }

        const sourceText = workingArgs.join(' ');
        if (!this.isUsableText(sourceText)) {
            return null;
        }

        const translatedText = this.resolveRuntimeTranslation(
            sourceText,
            runtime,
            this.getCacheType(),
            {
                missValue: sourceText,
                requireRuntimeTranslationActive: true,
            }
        );

        if (translatedText === sourceText) {
            return null;
        }

        const translatedArgs = String(translatedText).split(' ');
        if (trailingSizeToken !== null) {
            translatedArgs.push(trailingSizeToken);
        }
        return translatedArgs;
    }

    async precomputeCounts() {

        if (this._scanPrepared) {
            return;
        }

        if (this._scanPromise) {
            return this._scanPromise;
        }

        this._scanPromise = this.buildScanEntries()
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[DTextPictureTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];
        this.collectCommonEventEntries(entries);
        await this.collectMapEntries(entries);
        return entries;
    }

    collectCommonEventEntries(output) {
        if (!Array.isArray(window.$dataCommonEvents)) {
            return;
        }

        for (let commonEventId = 0; commonEventId < $dataCommonEvents.length; commonEventId++) {
            const commonEvent = $dataCommonEvents[commonEventId];
            if (!commonEvent || !Array.isArray(commonEvent.list)) {
                continue;
            }

            this.collectDTextCommandsFromList(
                commonEvent.list,
                {
                    scope: 'commonEvent',
                    commonEventId,
                },
                output
            );
        }
    }

    async collectMapEntries(output) {
        const mapInfos = Array.isArray(window.$dataMapInfos) ? window.$dataMapInfos : [];
        for (const mapInfo of mapInfos) {
            const mapId = Number(mapInfo?.id);
            if (!mapId) {
                continue;
            }

            try {
                const mapData = await loadMapDataById(mapId);
                if (!mapData || !Array.isArray(mapData.events)) {
                    continue;
                }

                this.collectMapEventEntries(mapData.events, mapId, output);
            } catch (error) {
                console.warn(
                    `[DTextPictureTranslator] Failed to scan map ${mapId} for DTextPicture commands`,
                    error
                );
            }
        }
    }

    collectMapEventEntries(events, mapId, output) {
        for (let eventIdx = 0; eventIdx < events.length; eventIdx++) {
            const event = events[eventIdx];
            if (!event || !Array.isArray(event.pages)) {
                continue;
            }

            for (let pageIdx = 0; pageIdx < event.pages.length; pageIdx++) {
                const page = event.pages[pageIdx];
                if (!page || !Array.isArray(page.list)) {
                    continue;
                }

                this.collectDTextCommandsFromList(
                    page.list,
                    {
                        scope: 'mapEvent',
                        mapId,
                        eventIdx,
                        pageIdx,
                    },
                    output
                );
            }
        }
    }

    collectDTextCommandsFromList(list, baseMeta, output) {
        if (!Array.isArray(list) || !Array.isArray(output)) {
            return;
        }

        for (let cmdIdx = 0; cmdIdx < list.length; cmdIdx++) {
            const cmd = list[cmdIdx];
            if (!cmd) {
                continue;
            }

            const entry = this.extractDTextEntry(cmd);
            if (!entry || !this.isUsableText(entry.text)) {
                continue;
            }

            output.push({
                text: entry.text,
                commandName: entry.commandName,
                engine: entry.engine,
                source: {
                    ...baseMeta,
                    cmdIdx,
                },
            });
        }
    }

    extractDTextEntry(cmd) {
        const commandCode = Number(cmd?.code);
        if (commandCode === 357) {
            return this.extractMZDTextEntry(cmd);
        }

        if (commandCode === 356) {
            return this.extractMVDTextEntry(cmd);
        }

        return null;
    }

    extractMZDTextEntry(cmd) {
        const parameters = Array.isArray(cmd.parameters) ? cmd.parameters : [];
        const pluginName = String(parameters[0] || '').trim();
        const commandName = String(parameters[1] || '').trim();
        const args = parameters[3] && typeof parameters[3] === 'object' ? parameters[3] : null;
        const text = args && typeof args.text === 'string' ? args.text : '';

        if (pluginName.toLowerCase() !== 'dtextpicture') {
            return null;
        }

        if (commandName !== 'dText') {
            return null;
        }

        if (!this.isUsableText(text)) {
            return null;
        }

        return {
            text,
            commandName,
            engine: 'MZ',
        };
    }

    extractMVDTextEntry(cmd) {
        const commandLine =
            Array.isArray(cmd.parameters) && typeof cmd.parameters[0] === 'string'
                ? cmd.parameters[0]
                : '';

        return this.parseMVDTextCommandLine(commandLine);
    }

    parseMVDTextCommandLine(commandLine) {
        const line = String(commandLine || '');
        if (!line.trim()) {
            return null;
        }

        const firstSpaceIndex = line.indexOf(' ');
        const commandToken = firstSpaceIndex >= 0 ? line.slice(0, firstSpaceIndex) : line;
        if (normalizeCommandName(commandToken) !== 'D_TEXT') {
            return null;
        }

        // Remove exactly one ASCII separator between command token and value.
        // Any additional leading spaces (including full-width spaces) are part of
        // the text payload and must be preserved in cache keys.
        let textWithArgs = firstSpaceIndex >= 0 ? line.slice(firstSpaceIndex + 1) : '';

        // Keep legacy behavior: trailing numeric argument is treated as size,
        // but do it without trimming leading text spacing.
        const lastSeparatorIndex = textWithArgs.lastIndexOf(' ');
        if (lastSeparatorIndex > 0) {
            const trailingToken = textWithArgs.slice(lastSeparatorIndex + 1);
            if (/^[+-]?\d+$/.test(trailingToken)) {
                textWithArgs = textWithArgs.slice(0, lastSeparatorIndex);
            }
        }

        if (!textWithArgs) {
            return null;
        }

        return {
            text: textWithArgs,
            commandName: 'D_TEXT',
            engine: 'MV',
        };
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_dtext_${byCacheKey.size}`,
                    value: text,
                    cacheKey,
                });
            }
        }

        return Array.from(byCacheKey.values());
    }

    collectUntranslated({ runtime }) {
        if (!runtime) {
            return [];
        }

        const items = this.buildUniquePendingItems(runtime);
        return items.filter((item) => !runtime.hasUsableCacheValue(item.cacheKey));
    }

    getCachedCountsSync({ runtime }) {
        if (!runtime) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        const items = this.buildUniquePendingItems(runtime);
        const totalStrings = items.length;
        const leftStrings = items.filter(
            (item) => !runtime.hasUsableCacheValue(item.cacheKey)
        ).length;

        return {
            total: totalStrings,
            left: leftStrings,
            totalStrings,
            leftStrings,
        };
    }
}
