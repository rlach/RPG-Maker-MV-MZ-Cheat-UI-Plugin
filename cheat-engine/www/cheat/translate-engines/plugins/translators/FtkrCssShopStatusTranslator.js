import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/**
 * FTKR_CSS_ShopStatus translator
 *
 * Plugin: FTKR_CSS_ShopStatus.js
 * Supported versions:
 * - v2.3.0 (MV): shop status layout labels from common/weapon/armor/item status lists.
 *
 * Notes:
 * - Translatable strings are stored in plugin parameter status-list structs
 *   (`commonStatusList`, `weaponStatusList`, `armorStatusList`, `itemStatusList`).
 * - Command/control tokens (for example `name`, `inumber`, `equip(%1)`) are not translated.
 * - Runtime integration patches `standardCssStatus()` on FTKR shop windows and returns a
 *   translated clone for the current draw pass only.
 */

const CACHE_TYPE = 'plugin_ftkr_css_shop_status';

const STATUS_LIST_KEYS = Object.freeze([
    'commonStatusList',
    'weaponStatusList',
    'armorStatusList',
    'itemStatusList',
]);

const STATUS_SCOPE_MAP = Object.freeze({
    commonStatusList: 'commonStatus',
    weaponStatusList: 'weaponStatus',
    armorStatusList: 'armorStatus',
    itemStatusList: 'itemStatus',
});

const STANDARD_STATUS_METHOD = 'standardCssStatus';
const STATUS_HOOK_FLAG = '__CHEAT_FTKR_CSS_SHOP_STATUS_TRANSLATOR_HOOKED__';

function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function isStatusControlToken(text) {
    const normalized = normalizeText(text).toLowerCase();
    if (!normalized) {
        return false;
    }

    return /^[a-z_][a-z0-9_]*(\(%1\))?$/.test(normalized);
}

function shouldTranslateStatusValue(textToken) {
    return normalizeText(textToken).toLowerCase() === 'text(%1)';
}

function parseStatusList(rawValue) {
    const parsedArray = parseJsonSafely(rawValue, []);
    if (!Array.isArray(parsedArray)) {
        return [];
    }

    return parsedArray
        .map((entry) => parseJsonSafely(entry, entry))
        .filter((entry) => entry && typeof entry === 'object');
}

export class FtkrCssShopStatusTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'FTKR_CSS_ShopStatus';
    }

    getPluginLabel() {
        return 'FTKR CSS ShopStatus';
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

    collectStatusListEntries(rawStatusList, scope, output) {
        const statusList = parseStatusList(rawStatusList);

        for (let index = 0; index < statusList.length; index++) {
            const entry = statusList[index];
            const textToken = normalizeText(entry?.text);
            const valueText = normalizeText(entry?.value);

            if (this.isUsableText(textToken) && !isStatusControlToken(textToken)) {
                this.appendTextEntry(textToken, { scope, index, field: 'text' }, output);
            }

            if (this.isUsableText(valueText) && shouldTranslateStatusValue(textToken)) {
                this.appendTextEntry(valueText, { scope, index, field: 'value' }, output);
            }
        }
    }

    collectParameterEntries(parameters, output) {
        if (!parameters || typeof parameters !== 'object') {
            return;
        }

        for (const fieldName of STATUS_LIST_KEYS) {
            this.collectStatusListEntries(
                parameters[fieldName],
                STATUS_SCOPE_MAP[fieldName] || fieldName,
                output
            );
        }
    }

    collectRuntimeStatusEntries(output) {
        const statusRoot = globalThis.FTKR?.CSS?.SpS;
        if (!statusRoot || typeof statusRoot !== 'object') {
            return;
        }

        this.collectRuntimeStatusListEntries(
            statusRoot.comStatus?.statusList,
            'runtimeCommonStatus',
            output
        );
        this.collectRuntimeStatusListEntries(
            statusRoot.weaponStatus?.statusList,
            'runtimeWeaponStatus',
            output
        );
        this.collectRuntimeStatusListEntries(
            statusRoot.armorStatus?.statusList,
            'runtimeArmorStatus',
            output
        );
        this.collectRuntimeStatusListEntries(
            statusRoot.itemStatus?.statusList,
            'runtimeItemStatus',
            output
        );
    }

    collectRuntimeStatusListEntries(statusList, scope, output) {
        if (!Array.isArray(statusList)) {
            return;
        }

        for (let index = 0; index < statusList.length; index++) {
            const entry = statusList[index];
            const textToken = normalizeText(entry?.text);
            const valueText = normalizeText(entry?.value);

            if (this.isUsableText(textToken) && !isStatusControlToken(textToken)) {
                this.appendTextEntry(textToken, { scope, index, field: 'text' }, output);
            }

            if (this.isUsableText(valueText) && shouldTranslateStatusValue(textToken)) {
                this.appendTextEntry(valueText, { scope, index, field: 'value' }, output);
            }
        }
    }

    buildTranslatedStatusObject(status, runtime) {
        const statusList = Array.isArray(status?.statusList) ? status.statusList : null;
        if (!statusList) {
            return status;
        }

        let changed = false;
        const translatedStatusList = statusList.map((entry) => {
            if (!entry || typeof entry !== 'object') {
                return entry;
            }

            const sourceTextToken = normalizeText(entry.text);
            const sourceValue = normalizeText(entry.value);

            let nextTextToken = entry.text;
            if (this.isUsableText(sourceTextToken) && !isStatusControlToken(sourceTextToken)) {
                nextTextToken = this.resolveRuntimeTranslation(
                    sourceTextToken,
                    runtime,
                    this.getCacheType(),
                    {
                        requireRuntimeTranslationActive: true,
                        missValue: sourceTextToken,
                    }
                );
            }

            let nextValue = entry.value;
            if (this.isUsableText(sourceValue) && shouldTranslateStatusValue(sourceTextToken)) {
                nextValue = this.resolveRuntimeTranslation(sourceValue, runtime, this.getCacheType(), {
                    requireRuntimeTranslationActive: true,
                    missValue: sourceValue,
                });
            }

            if (nextTextToken === entry.text && nextValue === entry.value) {
                return entry;
            }

            changed = true;
            return {
                ...entry,
                text: nextTextToken,
                value: nextValue,
            };
        });

        if (!changed) {
            return status;
        }

        return {
            ...status,
            statusList: translatedStatusList,
        };
    }

    tryHookWindowStatus(windowClass) {
        const proto = windowClass?.prototype;
        if (!proto || typeof proto[STANDARD_STATUS_METHOD] !== 'function') {
            return false;
        }

        if (proto[STATUS_HOOK_FLAG]) {
            return true;
        }

        const original = proto[STANDARD_STATUS_METHOD];
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const buildTranslatedStatusObject = this.buildTranslatedStatusObject.bind(this);

        proto[STANDARD_STATUS_METHOD] = function () {
            const status = original.apply(this, arguments);
            const runtime = getRuntime();
            if (!isRuntimeTranslationActive(runtime)) {
                return status;
            }

            return buildTranslatedStatusObject(status, runtime);
        };

        proto[STATUS_HOOK_FLAG] = true;
        return true;
    }

    enablePluginTranslation() {
        const targets = [
            globalThis.Window_ShopStatus,
            globalThis.Window_ShopItemStatus,
            globalThis.Window_ShopWeaponStatus,
            globalThis.Window_ShopArmorStatus,
        ];

        if (targets.some((target) => !target?.prototype)) {
            return false;
        }

        let patchedAny = false;
        for (const target of targets) {
            patchedAny = this.tryHookWindowStatus(target) || patchedAny;
        }

        return patchedAny;
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

        this._scanPromise = Promise.resolve()
            .then(() => {
                const entries = [];
                const parameters = this.getRuntimeParameters();
                this.collectParameterEntries(parameters, entries);
                this.collectRuntimeStatusEntries(entries);
                this._scanEntries = entries;
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[FtkrCssShopStatusTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry?.text === 'string' ? entry.text : '';
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (byCacheKey.has(cacheKey)) {
                continue;
            }

            byCacheKey.set(cacheKey, {
                type: this.getCacheType(),
                id: `plugin_ftkr_css_shop_status_${byCacheKey.size}`,
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
