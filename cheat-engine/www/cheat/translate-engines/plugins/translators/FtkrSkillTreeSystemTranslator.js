import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * FTKR_SkillTreeSystem translator
 *
 * Plugin: FTKR_SkillTreeSystem.js
 * Supported versions:
 * - v1.18.3 (MV): skill-tree scene/window UI labels and formatted titles.
 *
 * Notes:
 * - This translator only scans plugin-owned UI strings from plugin parameters
 *   and FTKR.STS runtime format fields.
 * - Skill names and skill descriptions are intentionally resolved through
 *   existing caches (`skill_name`, `skill_description`) at runtime instead of
 *   duplicating those keys into the plugin cache.
 */

const CACHE_TYPE = 'plugin_ftkr_skill_tree_system';

const TEXT_PARAMETER_KEYS = Object.freeze([
    'Command Name',
    'SP Display Name',
    'Display Get Sp',
    'Skill Name Format',
    'Count Frame Format',
    'Skill Status Title Format',
    'Cost Title Format',
    'Cost Item Format',
    'Cost Number Format',
    'Cost Max Count Format',
    'Preskill Title Format',
    'Preskill Item Format',
    'Conf Title Format',
    'Confirmation Ok Format',
    'Confirmation Cancel Format',
]);

const STS_WINDOW_NAMES = new Set([
    'Window_TreeType',
    'Window_SkillTree',
    'Window_StsSkillStatus',
    'Window_StsConfTitle',
    'Window_StsConf',
    'Window_StsCost',
    'Window_StsPreskill',
    'Window_StsActorStatus',
]);

function normalizeText(value) {
    return String(value ?? '').trim();
}

function isLikelyTranslatableText(value) {
    const text = normalizeText(value);
    if (!text) {
        return false;
    }

    if (/^(true|false)$/i.test(text)) {
        return false;
    }

    if (/^[+-]?\d+(\.\d+)?$/.test(text)) {
        return false;
    }

    return true;
}

function isStsWindowInstance(windowInstance) {
    const windowName = normalizeText(windowInstance?.constructor?.name);
    return STS_WINDOW_NAMES.has(windowName);
}

export class FtkrSkillTreeSystemTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
        this._knownCommandNames = new Set();
    }

    getPluginName() {
        return 'FTKR_SkillTreeSystem';
    }

    getPluginLabel() {
        return 'FTKR SkillTreeSystem';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    appendTextEntry(output, text, source) {
        if (!isLikelyTranslatableText(text)) {
            return;
        }

        output.push({
            text: String(text),
            source,
        });
    }

    appendParameterEntries(parameters, scope, output) {
        if (!parameters || typeof parameters !== 'object') {
            return;
        }

        for (const key of TEXT_PARAMETER_KEYS) {
            this.appendTextEntry(output, parameters[key], {
                scope,
                field: key,
            });
        }
    }

    appendRuntimeEntries(output) {
        const sts = globalThis.FTKR?.STS;
        if (!sts || typeof sts !== 'object') {
            return;
        }

        this.appendTextEntry(output, sts.commandName, {
            scope: 'runtime',
            field: 'commandName',
        });

        this.appendTextEntry(output, sts?.sp?.dispName, {
            scope: 'runtime',
            field: 'sp.dispName',
        });
        this.appendTextEntry(output, sts?.sp?.format, {
            scope: 'runtime',
            field: 'sp.format',
        });

        this.appendTextEntry(output, sts?.sFrame?.text?.format, {
            scope: 'runtime',
            field: 'sFrame.text.format',
        });
        this.appendTextEntry(output, sts?.cFrame?.format, {
            scope: 'runtime',
            field: 'cFrame.format',
        });

        this.appendTextEntry(output, sts?.skillStatus?.titleFormat, {
            scope: 'runtime',
            field: 'skillStatus.titleFormat',
        });

        this.appendTextEntry(output, sts?.cost?.titleFormat, {
            scope: 'runtime',
            field: 'cost.titleFormat',
        });
        this.appendTextEntry(output, sts?.cost?.itemFormat, {
            scope: 'runtime',
            field: 'cost.itemFormat',
        });
        this.appendTextEntry(output, sts?.cost?.numberFormat, {
            scope: 'runtime',
            field: 'cost.numberFormat',
        });
        this.appendTextEntry(output, sts?.cost?.maxFormat, {
            scope: 'runtime',
            field: 'cost.maxFormat',
        });

        this.appendTextEntry(output, sts?.preskill?.titleFormat, {
            scope: 'runtime',
            field: 'preskill.titleFormat',
        });
        this.appendTextEntry(output, sts?.preskill?.itemFormat, {
            scope: 'runtime',
            field: 'preskill.itemFormat',
        });

        this.appendTextEntry(output, sts?.conf?.titleformat, {
            scope: 'runtime',
            field: 'conf.titleformat',
        });
        this.appendTextEntry(output, sts?.conf?.okFormat, {
            scope: 'runtime',
            field: 'conf.okFormat',
        });
        this.appendTextEntry(output, sts?.conf?.cancelFormat, {
            scope: 'runtime',
            field: 'conf.cancelFormat',
        });
    }

    buildSeedEntries() {
        const output = [];

        const pluginEntry = this.findPluginEntry(this.getPluginName());
        this.appendParameterEntries(pluginEntry?.parameters, 'pluginEntryParameters', output);

        const runtimeParameters =
            typeof globalThis.PluginManager?.parameters === 'function'
                ? PluginManager.parameters(this.getPluginName())
                : null;
        this.appendParameterEntries(runtimeParameters, 'runtimeParameters', output);

        this.appendRuntimeEntries(output);

        return output;
    }

    refreshKnownCommandNames() {
        const names = new Set();

        for (const entry of this._scanEntries) {
            const field = normalizeText(entry?.source?.field);
            if (field !== 'Command Name' && field !== 'commandName') {
                continue;
            }

            const text = normalizeText(entry?.text);
            if (text) {
                names.add(text);
            }
        }

        this._knownCommandNames = names;
    }

    ensureScanSeeded() {
        if (this._scanEntries.length > 0) {
            return;
        }

        this._scanEntries = this.buildSeedEntries();
        this.refreshKnownCommandNames();
    }

    async precomputeCounts() {
        if (!this.ensureDetection()) {
            return;
        }

        if (this._scanPrepared) {
            return;
        }

        if (this._scanPromise) {
            return this._scanPromise;
        }

        this._scanPromise = Promise.resolve(this.buildScanEntries())
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this.refreshKnownCommandNames();
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[FtkrSkillTreeSystemTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        return this.buildSeedEntries();
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = String(entry?.text || '');
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (byCacheKey.has(cacheKey)) {
                continue;
            }

            byCacheKey.set(cacheKey, {
                type: this.getCacheType(),
                id: `plugin_ftkr_skill_tree_system_${byCacheKey.size}`,
                value: text,
                cacheKey,
            });
        }

        return Array.from(byCacheKey.values());
    }

    collectUntranslated({ runtime }) {
        if (!runtime) {
            return [];
        }

        this.ensureScanSeeded();

        const items = this.buildUniquePendingItems(runtime);
        return items.filter((item) => !runtime.hasUsableCacheValue(item.cacheKey));
    }

    getCachedCountsSync({ runtime }) {
        if (!runtime) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        this.ensureScanSeeded();

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

    enablePluginTranslation() {
        const windowBasePrototype = globalThis.Window_Base?.prototype;
        if (
            !windowBasePrototype ||
            typeof windowBasePrototype.drawText !== 'function' ||
            typeof windowBasePrototype.drawTextEx !== 'function' ||
            typeof windowBasePrototype.drawStsDescTitle !== 'function' ||
            typeof windowBasePrototype.getStsDesc !== 'function'
        ) {
            return false;
        }

        if (
            !globalThis.Window_MenuCommand?.prototype ||
            typeof Window_MenuCommand.prototype.addOriginalCommands !== 'function'
        ) {
            return false;
        }

        this.ensureScanSeeded();
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);
        const getCacheType = this.getCacheType.bind(this);
        const isUsableText = this.isUsableText.bind(this);
        const hasKnownCommandName = (name) => this._knownCommandNames.has(normalizeText(name));
        const hasKnownCommandNames = () => this._knownCommandNames.size > 0;

        if (!windowBasePrototype.__CHEAT_FTKR_STS_TRANSLATOR_DRAW_TEXT_HOOKED__) {
            const originalDrawText = windowBasePrototype.drawText;

            windowBasePrototype.drawText = function () {
                try {
                    const runtime = getRuntime();
                    if (
                        isRuntimeTranslationActive(runtime) &&
                        arguments.length > 0 &&
                        isStsWindowInstance(this)
                    ) {
                        arguments[0] = resolveRuntimeTranslation(
                            arguments[0],
                            runtime,
                            [getCacheType(), 'skill_name', 'skill_description', 'command'],
                            {
                                requireRuntimeTranslationActive: true,
                                missValue: arguments[0],
                            }
                        );
                    }
                } catch (error) {
                    console.warn(
                        '[FtkrSkillTreeSystemTranslator] Failed to apply drawText translation',
                        error
                    );
                }

                return originalDrawText.apply(this, arguments);
            };

            Object.defineProperty(windowBasePrototype, '__CHEAT_FTKR_STS_TRANSLATOR_DRAW_TEXT_HOOKED__', {
                value: true,
                configurable: true,
                enumerable: false,
                writable: false,
            });
        }

        if (!windowBasePrototype.__CHEAT_FTKR_STS_TRANSLATOR_DRAW_TEXT_EX_HOOKED__) {
            const originalDrawTextEx = windowBasePrototype.drawTextEx;

            windowBasePrototype.drawTextEx = function () {
                try {
                    const runtime = getRuntime();
                    if (
                        isRuntimeTranslationActive(runtime) &&
                        arguments.length > 0 &&
                        isStsWindowInstance(this)
                    ) {
                        arguments[0] = resolveRuntimeTranslation(
                            arguments[0],
                            runtime,
                            [getCacheType(), 'skill_description', 'skill_name', 'command'],
                            {
                                requireRuntimeTranslationActive: true,
                                missValue: arguments[0],
                            }
                        );
                    }
                } catch (error) {
                    console.warn(
                        '[FtkrSkillTreeSystemTranslator] Failed to apply drawTextEx translation',
                        error
                    );
                }

                return originalDrawTextEx.apply(this, arguments);
            };

            Object.defineProperty(
                windowBasePrototype,
                '__CHEAT_FTKR_STS_TRANSLATOR_DRAW_TEXT_EX_HOOKED__',
                {
                    value: true,
                    configurable: true,
                    enumerable: false,
                    writable: false,
                }
            );
        }

        if (!windowBasePrototype.__CHEAT_FTKR_STS_TRANSLATOR_DESC_TITLE_HOOKED__) {
            const originalDrawStsDescTitle = windowBasePrototype.drawStsDescTitle;

            windowBasePrototype.drawStsDescTitle = function () {
                try {
                    const runtime = getRuntime();
                    if (isRuntimeTranslationActive(runtime) && arguments.length > 0) {
                        arguments[0] = resolveRuntimeTranslation(
                            arguments[0],
                            runtime,
                            getCacheType(),
                            {
                                requireRuntimeTranslationActive: true,
                                missValue: arguments[0],
                            }
                        );

                        const skill = arguments[4];
                        const sourceSkillName = skill?.name;
                        if (isUsableText(sourceSkillName)) {
                            const translatedSkillName = resolveRuntimeTranslation(
                                sourceSkillName,
                                runtime,
                                'skill_name',
                                {
                                    requireRuntimeTranslationActive: true,
                                    missValue: sourceSkillName,
                                }
                            );

                            if (translatedSkillName !== sourceSkillName) {
                                arguments[4] = {
                                    ...skill,
                                    name: translatedSkillName,
                                };
                            }
                        }
                    }
                } catch (error) {
                    console.warn(
                        '[FtkrSkillTreeSystemTranslator] Failed to apply drawStsDescTitle translation',
                        error
                    );
                }

                return originalDrawStsDescTitle.apply(this, arguments);
            };

            Object.defineProperty(
                windowBasePrototype,
                '__CHEAT_FTKR_STS_TRANSLATOR_DESC_TITLE_HOOKED__',
                {
                    value: true,
                    configurable: true,
                    enumerable: false,
                    writable: false,
                }
            );
        }

        if (!windowBasePrototype.__CHEAT_FTKR_STS_TRANSLATOR_GET_DESC_HOOKED__) {
            const originalGetStsDesc = windowBasePrototype.getStsDesc;

            windowBasePrototype.getStsDesc = function () {
                const result = originalGetStsDesc.apply(this, arguments);

                try {
                    const runtime = getRuntime();
                    if (!isRuntimeTranslationActive(runtime)) {
                        return result;
                    }

                    return resolveRuntimeTranslation(
                        result,
                        runtime,
                        ['skill_description', getCacheType()],
                        {
                            requireRuntimeTranslationActive: true,
                            missValue: result,
                        }
                    );
                } catch (error) {
                    console.warn(
                        '[FtkrSkillTreeSystemTranslator] Failed to apply getStsDesc translation',
                        error
                    );
                    return result;
                }
            };

            Object.defineProperty(
                windowBasePrototype,
                '__CHEAT_FTKR_STS_TRANSLATOR_GET_DESC_HOOKED__',
                {
                    value: true,
                    configurable: true,
                    enumerable: false,
                    writable: false,
                }
            );
        }

        if (!Window_MenuCommand.prototype.__CHEAT_FTKR_STS_TRANSLATOR_MENU_HOOKED__) {
            const originalAddOriginalCommands = Window_MenuCommand.prototype.addOriginalCommands;

            Window_MenuCommand.prototype.addOriginalCommands = function () {
                const result = originalAddOriginalCommands.apply(this, arguments);

                try {
                    const runtime = getRuntime();
                    if (
                        !isRuntimeTranslationActive(runtime) ||
                        !Array.isArray(this._list) ||
                        !hasKnownCommandNames()
                    ) {
                        return result;
                    }

                    for (const command of this._list) {
                        const sourceName = command?.name;
                        if (!hasKnownCommandName(sourceName)) {
                            continue;
                        }

                        command.name = resolveRuntimeTranslation(
                            sourceName,
                            runtime,
                            [getCacheType(), 'command'],
                            {
                                requireRuntimeTranslationActive: true,
                                missValue: sourceName,
                            }
                        );
                    }
                } catch (error) {
                    console.warn(
                        '[FtkrSkillTreeSystemTranslator] Failed to apply menu command translation',
                        error
                    );
                }

                return result;
            };

            Object.defineProperty(
                Window_MenuCommand.prototype,
                '__CHEAT_FTKR_STS_TRANSLATOR_MENU_HOOKED__',
                {
                    value: true,
                    configurable: true,
                    enumerable: false,
                    writable: false,
                }
            );
        }

        return true;
    }
}