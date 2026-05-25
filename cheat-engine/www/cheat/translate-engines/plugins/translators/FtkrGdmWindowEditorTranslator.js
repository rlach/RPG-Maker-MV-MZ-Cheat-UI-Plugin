import { loadMapDataById } from '../../../js/translation-runtime/ObjectTranslationModalMethods.js';
import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { normalizeText, parseJsonSafely } from './TranslatorHelpers.js';

/**
 * FTKR_GDM_WindowEditor translator
 *
 * Plugin: FTKR_GDM_WindowEditor.js
 * Supported versions:
 * - v0.9.17 (MV): GUI window editor custom window labels/text and OSW plugin-command payloads.
 *
 * Notes:
 * - Primary translatable payloads are custom window list labels (`_customList[].name`) stored
 *   in container properties runtime data and live OSW windows.
 * - Additional payloads can be passed through MV plugin commands (`OSW_*`), so map/common-event
 *   command lists are scanned and only argument text is collected.
 * - Runtime integration hooks narrow OSW draw paths only and never translate command prefixes/tokens.
 */

const CACHE_TYPE = 'plugin_ftkr_gdm_window_editor';
const MV_PLUGIN_COMMAND_CODE = 356;

const NON_TRANSLATABLE_PARAMETER_KEYS = new Set([
    'autoCreate',
    '--ウィンドウの共通設定--',
    'Font Size',
    'Window Padding',
    'Window Line Height',
    'Window Opacity',
    'Hide Frame',
    'Window Background Image Name',
    '--オリジナルシーンの設定--',
    'Scene Background Image Name',
    '--コマンドウィンドウの設定--',
    'Command Position X',
    'Command Position Y',
    'Command Width',
    'Command Max Cols',
    'Command Align',
    '--コモンウィンドウの設定--',
    'Common Width',
    'Common Height',
    '--コモンウィンドウの表示内容設定--',
    'Actor Status Space',
    'Actor Status Space In Text',
    'Actor Status Width Rate',
    '--セレクトウィンドウの設定--',
    'Select Width',
    'Select Height',
    'Select Cursor Height',
    'Select Max Cols',
    '--セレクトウィンドウの表示内容設定--',
    'Select Status Space',
    'Select Status Space In Text',
    'Select Status Width Rate',
]);

const CONTROL_ARG_TOKENS = new Set([
    'ORIGINAL',
    'MAP',
    'BATTLE',
    'TRUE',
    'FALSE',
    'ON',
    'OFF',
    'LEFT',
    'CENTER',
    'RIGHT',
    'ACTOR',
    'CLASS',
    'SKILL',
    'ITEM',
    'WEAPON',
    'ARMOR',
    'ENEMY',
    'TROOP',
    'STATE',
    'VARIABLE',
    'SWITCH',
    'WINDOW_ACTIVE',
    'CHANGE_SCENE',
    'COMMON_EVENT',
    'SCENE_END',
]);

function isNumericLike(text) {
    return /^[-+]?\d+(?:\.\d+)?$/.test(text);
}

function isBooleanLike(text) {
    const normalized = normalizeText(text).toLowerCase();
    return normalized === 'true' || normalized === 'false';
}

function isCsvNumberLike(text) {
    return /^[-+]?\d+(?:\s*,\s*[-+]?\d+)*$/.test(text);
}

function stripWrappingQuotes(text) {
    const value = String(text || '');
    if (value.length < 2) {
        return value;
    }

    const first = value[0];
    const last = value.slice(-1)[0];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        return value.slice(1, -1);
    }

    return value;
}

function isControlLikePluginArg(text) {
    const value = normalizeText(text);
    if (!value) {
        return true;
    }

    const upper = value.toUpperCase();
    if (CONTROL_ARG_TOKENS.has(upper)) {
        return true;
    }

    if (
        isNumericLike(value) ||
        isBooleanLike(value) ||
        isCsvNumberLike(value) ||
        /^SCENE_[A-Z0-9_]+$/i.test(value) ||
        /^WINDOW_[A-Z0-9_]+$/i.test(value) ||
        /^OSW_[A-Z0-9_]+$/i.test(value) ||
        /^[a-z0-9_]+$/i.test(value)
    ) {
        return true;
    }

    return false;
}

function safeCommandLineFromEventCommand(cmd) {
    return Array.isArray(cmd?.parameters) && typeof cmd.parameters[0] === 'string'
        ? cmd.parameters[0]
        : '';
}

export class FtkrGdmWindowEditorTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'FTKR_GDM_WindowEditor';
    }

    getPluginLabel() {
        return 'FTKR GDM WindowEditor';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    getRuntimeParameters() {
        const pluginManager = window.PluginManager;
        if (!pluginManager || typeof pluginManager.parameters !== 'function') {
            return null;
        }

        const parameters = pluginManager.parameters(this.getPluginName());
        return parameters && typeof parameters === 'object' ? parameters : null;
    }

    appendTextEntry(text, source, output) {
        if (!this.isUsableText(text)) {
            return;
        }

        output.push({ text, source });
    }

    appendParameterValue(value, source, output) {
        if (Array.isArray(value)) {
            for (let index = 0; index < value.length; index++) {
                this.appendParameterValue(value[index], { ...source, index }, output);
            }
            return;
        }

        if (value && typeof value === 'object') {
            for (const [key, nested] of Object.entries(value)) {
                this.appendParameterValue(nested, { ...source, nestedKey: key }, output);
            }
            return;
        }

        const text = normalizeText(value);
        if (!this.isUsableText(text)) {
            return;
        }

        if (isNumericLike(text) || isBooleanLike(text) || isCsvNumberLike(text)) {
            return;
        }

        this.appendTextEntry(text, source, output);
    }

    collectParameterEntries(parameters, scope, output) {
        if (!parameters || typeof parameters !== 'object') {
            return;
        }

        for (const [field, rawValue] of Object.entries(parameters)) {
            if (NON_TRANSLATABLE_PARAMETER_KEYS.has(field)) {
                continue;
            }

            const normalized = normalizeText(rawValue);
            if (!normalized) {
                continue;
            }

            const parsed = parseJsonSafely(normalized, null);
            const value = parsed === null ? normalized : parsed;
            this.appendParameterValue(value, { scope, field }, output);
        }
    }

    collectFromCustomList(customList, source, output) {
        if (!Array.isArray(customList)) {
            return;
        }

        for (let index = 0; index < customList.length; index++) {
            const entry = customList[index];
            this.appendTextEntry(
                entry?.name,
                { ...source, index, field: '_customList.name' },
                output
            );
        }
    }

    collectContainerPropertiesEntries(output) {
        const root = window.$dataContainerProperties;
        if (!root || typeof root !== 'object') {
            return;
        }

        const visited = new Set();
        const stack = [{ value: root, path: 'containerProperties' }];

        while (stack.length > 0) {
            const current = stack.pop();
            const value = current?.value;

            if (!value || typeof value !== 'object') {
                continue;
            }

            if (visited.has(value)) {
                continue;
            }
            visited.add(value);

            this.enqueueContainerChildren(value, current.path, stack, output);
        }
    }

    enqueueContainerChildren(value, basePath, stack, output) {
        if (Array.isArray(value)) {
            for (let index = 0; index < value.length; index++) {
                stack.push({ value: value[index], path: `${basePath}[${index}]` });
            }
            return;
        }

        this.collectFromCustomList(value._customList, { scope: basePath }, output);

        for (const [key, nested] of Object.entries(value)) {
            if (key === '_customList') {
                continue;
            }
            stack.push({ value: nested, path: `${basePath}.${key}` });
        }
    }

    collectLiveWindowEntries(output) {
        const scene = window.SceneManager?._scene;
        const windowChildren = Array.isArray(scene?._windowLayer?.children)
            ? scene._windowLayer.children
            : [];

        for (let windowIndex = 0; windowIndex < windowChildren.length; windowIndex++) {
            const child = windowChildren[windowIndex];
            if (!child?.isOsw?.()) {
                continue;
            }

            this.collectFromCustomList(
                child._customList,
                {
                    scope: 'liveWindowLayer',
                    windowIndex,
                    windowClass: child.constructor?.name || '',
                },
                output
            );
        }
    }

    parseOswPluginCommandArgs(commandLine) {
        const line = normalizeText(commandLine);
        if (!line) {
            return [];
        }

        const parts = line.split(/\s+/u);
        const command = normalizeText(parts.shift()).toUpperCase();
        if (!command || !/^OSW_/i.test(command)) {
            return [];
        }

        const candidates = [];
        for (let argIndex = 0; argIndex < parts.length; argIndex++) {
            const rawArg = parts[argIndex];
            const arg = normalizeText(stripWrappingQuotes(rawArg));

            if (!this.isUsableText(arg) || isControlLikePluginArg(arg)) {
                continue;
            }

            candidates.push({ text: arg, argIndex });
        }

        return candidates;
    }

    collectPluginCommandEntriesFromList(list, baseMeta, output) {
        if (!Array.isArray(list)) {
            return;
        }

        for (let cmdIdx = 0; cmdIdx < list.length; cmdIdx++) {
            const cmd = list[cmdIdx];
            if (!cmd || Number(cmd.code) !== MV_PLUGIN_COMMAND_CODE) {
                continue;
            }

            const commandLine = safeCommandLineFromEventCommand(cmd);
            const candidates = this.parseOswPluginCommandArgs(commandLine);
            for (const candidate of candidates) {
                output.push({
                    text: candidate.text,
                    source: {
                        ...baseMeta,
                        cmdIdx,
                        argIndex: candidate.argIndex,
                        commandType: 'OSW_PLUGIN_COMMAND',
                    },
                });
            }
        }
    }

    collectCommonEventEntries(output) {
        const commonEvents = Array.isArray(window.$dataCommonEvents)
            ? window.$dataCommonEvents
            : [];
        for (let commonEventId = 0; commonEventId < commonEvents.length; commonEventId++) {
            const commonEvent = commonEvents[commonEventId];
            if (!commonEvent || !Array.isArray(commonEvent.list)) {
                continue;
            }

            this.collectPluginCommandEntriesFromList(
                commonEvent.list,
                { scope: 'commonEvent', commonEventId },
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
                this.collectMapDataEntries(mapData, mapId, output);
            } catch (error) {
                console.warn(`[FtkrGdmWindowEditorTranslator] Failed to scan map ${mapId}`, error);
            }
        }
    }

    collectMapDataEntries(mapData, mapId, output) {
        const events = Array.isArray(mapData?.events) ? mapData.events : [];
        for (let eventIdx = 0; eventIdx < events.length; eventIdx++) {
            const pages = Array.isArray(events[eventIdx]?.pages) ? events[eventIdx].pages : [];
            this.collectMapEventPages(pages, mapId, eventIdx, output);
        }
    }

    collectMapEventPages(pages, mapId, eventIdx, output) {
        for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
            const list = Array.isArray(pages[pageIdx]?.list) ? pages[pageIdx].list : null;
            if (!list) {
                continue;
            }

            this.collectPluginCommandEntriesFromList(
                list,
                { scope: 'mapEvent', mapId, eventIdx, pageIdx },
                output
            );
        }
    }

    enablePluginTranslation() {
        const windowBasePrototype = window.Window_Base?.prototype;
        if (!windowBasePrototype?.drawText || !windowBasePrototype?.drawTextEx) {
            return false;
        }

        const oswCommonPrototype = window.Window_OswCommon?.prototype;
        const oswCommandPrototype = window.Window_OswCommand?.prototype;
        const oswSelectPrototype = window.Window_OswSelect?.prototype;

        if (
            !oswCommonPrototype?.drawContent ||
            !oswCommandPrototype?.drawItem ||
            !oswSelectPrototype?.drawItem
        ) {
            return false;
        }

        if (typeof windowBasePrototype.spacing !== 'function') {
            windowBasePrototype.spacing = function () {
                return Number(this?._customSpacing) || 0;
            };
        }

        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);

        const wrapOswDrawScope = (prototype, methodName) => {
            const original = prototype[methodName];
            prototype[methodName] = function () {
                this.__ftkrGdmDrawScopeDepth = (Number(this.__ftkrGdmDrawScopeDepth) || 0) + 1;
                try {
                    return original.apply(this, arguments);
                } finally {
                    this.__ftkrGdmDrawScopeDepth = Math.max(
                        0,
                        (Number(this.__ftkrGdmDrawScopeDepth) || 1) - 1
                    );
                }
            };
        };

        wrapOswDrawScope(oswCommonPrototype, 'drawContent');
        wrapOswDrawScope(oswCommandPrototype, 'drawItem');
        wrapOswDrawScope(oswSelectPrototype, 'drawItem');

        const originalDrawText = windowBasePrototype.drawText;
        windowBasePrototype.drawText = function () {
            try {
                const runtime = getRuntime();
                if (
                    isRuntimeTranslationActive(runtime) &&
                    (Number(this.__ftkrGdmDrawScopeDepth) || 0) > 0 &&
                    arguments.length > 0
                ) {
                    arguments[0] = resolveRuntimeTranslation(arguments[0], runtime, CACHE_TYPE, {
                        requireRuntimeTranslationActive: true,
                    });
                }
            } catch (error) {
                console.warn(
                    '[FtkrGdmWindowEditorTranslator] Failed to translate drawText payload',
                    error
                );
            }

            return originalDrawText.apply(this, arguments);
        };

        const originalDrawTextEx = windowBasePrototype.drawTextEx;
        windowBasePrototype.drawTextEx = function () {
            try {
                const runtime = getRuntime();
                if (
                    isRuntimeTranslationActive(runtime) &&
                    (Number(this.__ftkrGdmDrawScopeDepth) || 0) > 0 &&
                    arguments.length > 0
                ) {
                    arguments[0] = resolveRuntimeTranslation(arguments[0], runtime, CACHE_TYPE, {
                        requireRuntimeTranslationActive: true,
                    });
                }
            } catch (error) {
                console.warn(
                    '[FtkrGdmWindowEditorTranslator] Failed to translate drawTextEx payload',
                    error
                );
            }

            return originalDrawTextEx.apply(this, arguments);
        };

        return true;
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

        this._scanPromise = this.buildScanEntries()
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[FtkrGdmWindowEditorTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];

        const pluginEntry = this.findPluginEntry(this.getPluginName());
        if (pluginEntry?.parameters) {
            this.collectParameterEntries(pluginEntry.parameters, 'pluginEntryParameter', entries);
        }

        const runtimeParameters = this.getRuntimeParameters();
        if (runtimeParameters) {
            this.collectParameterEntries(
                runtimeParameters,
                'runtimePluginManagerParameter',
                entries
            );
        }

        this.collectContainerPropertiesEntries(entries);
        this.collectLiveWindowEntries(entries);
        this.collectCommonEventEntries(entries);
        await this.collectMapEntries(entries);

        return entries;
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = entry?.text;
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (byCacheKey.has(cacheKey)) {
                continue;
            }

            byCacheKey.set(cacheKey, {
                type: this.getCacheType(),
                id: `plugin_ftkr_gdm_window_editor_${byCacheKey.size}`,
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
