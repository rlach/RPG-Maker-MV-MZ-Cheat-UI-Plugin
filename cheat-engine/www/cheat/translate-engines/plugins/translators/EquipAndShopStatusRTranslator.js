import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * EquipAndShopStatusR translator
 *
 * Supported plugin versions:
 * - EquipAndShopStatusR.js v1.09 (MV)
 *
 * Translation notes:
 * - Text is sourced from plugin parameters, including vocabulary CSV fields
 *   and custom `ex<color:text:value>` labels inside display-list settings.
 * - Runtime translation patches only draw points used by this plugin's equip/
 *   shop status windows so command symbols and game flow stay unchanged.
 */

const PLUGIN_NAME = 'EquipAndShopStatusR';
const CACHE_TYPE = 'plugin_equip_and_shop_status_r';

const HOOK_FLAG_EQUIP_STATUS_DRAW = '__CHEAT_EQUIP_SHOP_STATUSR_EQUIP_DRAW_HOOKED__';
const HOOK_FLAG_SHOP_STATUS_EFFECT = '__CHEAT_EQUIP_SHOP_STATUSR_SHOP_EFFECT_HOOKED__';
const HOOK_FLAG_SHOP_STATUS_META = '__CHEAT_EQUIP_SHOP_STATUSR_SHOP_META_HOOKED__';

const DIRECT_TEXT_KEYS = new Set([
    'Effect Name',
    'Down Name',
    'Item Type Text',
    'Consume Text',
    'Damage Type Text',
    'Price Text',
    'Scope Text',
    'Occasion Text',
    'Repeat Text',
    'TpGain Text',
    'Equip Type Text',
    'Weapon Type Text',
    'Armor Type Text',
    'Turn Text',
    'Escape Text',
    'Item Help Text',
    'Equip Help Text',
    'Equip Status Help Text',
    'Equip Status Help Text2',
    'Performance Icon Up',
    'Performance Icon Down',
    'Performance Icon Equal',
    'Performance Icon Equipped',
]);

const CSV_TEXT_KEYS = new Set([
    'Scope Vocab',
    'Item Type Vocab',
    'Consume Vocab',
    'Occasion Vocab',
    'Damage Vocab',
    'Xparam Names',
    'Sparam Names',
    'Effects Names',
]);

const LIST_WITH_CUSTOM_TOKENS = new Set([
    'Basic Params',
    'Page1',
    'Page2',
    'Page3',
    'Page4',
    'Page5',
    'Page6',
    'Shop Info',
    'Equip Info',
]);

const RESERVED_LIST_TOKENS = new Set([
    'name',
    'class',
    'level',
    'states',
    'nickname',
    'l',
    's',
    'hp',
    'mp',
    'atk',
    'def',
    'mat',
    'mdf',
    'agi',
    'luk',
    'hit',
    'eva',
    'cri',
    'mev',
    'mrf',
    'cev',
    'cnt',
    'hrg',
    'mrg',
    'trg',
    'tgr',
    'grd',
    'rec',
    'pha',
    'mcr',
    'tcr',
    'pdr',
    'mdr',
    'fdr',
    'exr',
    'type',
    'price',
    'consume',
    'dmg',
    'scope',
    'occasion',
    'repeat',
    'tpgain',
    'effects',
    'etype',
]);

export class EquipAndShopStatusRTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
        this._knownTexts = null;
    }

    getPluginName() {
        return PLUGIN_NAME;
    }

    getPluginLabel() {
        return 'Equip And Shop Status R';
    }

    getCacheType() {
        return CACHE_TYPE;
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
                this._knownTexts = null;
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[EquipAndShopStatusRTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const entries = [];
        const pluginEntry = this.findPluginEntry(this.getPluginName());
        this._appendParameterEntries(entries, pluginEntry?.parameters, 'pluginEntry');

        if (typeof window.PluginManager?.parameters === 'function') {
            this._appendParameterEntries(
                entries,
                window.PluginManager.parameters(this.getPluginName()),
                'runtimeParameters'
            );
        }

        return entries;
    }

    collectUntranslated({ runtime }) {
        if (!runtime) {
            return [];
        }

        const items = this._buildUniquePendingItems(runtime);
        return items.filter((item) => !runtime.hasUsableCacheValue(item.cacheKey));
    }

    getCachedCountsSync({ runtime }) {
        if (!runtime) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        if (!this._scanPrepared) {
            this._scanEntries = this.buildScanEntries();
            this._scanPrepared = true;
        }

        const items = this._buildUniquePendingItems(runtime);
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
        const equipStatusProto = window.Window_EquipStatus?.prototype;
        const refineShopStatusProto = window.Window_RefineShopStatus?.prototype;

        if (
            !equipStatusProto ||
            typeof equipStatusProto.drawExParams !== 'function' ||
            !refineShopStatusProto ||
            typeof refineShopStatusProto.drawEffectText !== 'function' ||
            typeof refineShopStatusProto.drawMetaTag !== 'function'
        ) {
            return false;
        }

        if (!equipStatusProto[HOOK_FLAG_EQUIP_STATUS_DRAW]) {
            const originalDrawExParams = equipStatusProto.drawExParams;
            const translateRuntimeText = this._translateRuntimeText.bind(this);
            equipStatusProto.drawExParams = function (text) {
                const nextText = translateRuntimeText(text, true);
                const nextArguments = Array.from(arguments);
                nextArguments[0] = nextText;
                return originalDrawExParams.apply(this, nextArguments);
            };

            Object.defineProperty(equipStatusProto, HOOK_FLAG_EQUIP_STATUS_DRAW, {
                value: true,
                configurable: true,
                enumerable: false,
                writable: false,
            });
        }

        if (!refineShopStatusProto[HOOK_FLAG_SHOP_STATUS_EFFECT]) {
            const originalDrawEffectText = refineShopStatusProto.drawEffectText;
            const translateRuntimeText = this._translateRuntimeText.bind(this);
            refineShopStatusProto.drawEffectText = function (text1, text2) {
                const nextArguments = Array.from(arguments);
                nextArguments[0] = translateRuntimeText(text1, false);
                nextArguments[1] = translateRuntimeText(text2, false);
                return originalDrawEffectText.apply(this, nextArguments);
            };

            Object.defineProperty(refineShopStatusProto, HOOK_FLAG_SHOP_STATUS_EFFECT, {
                value: true,
                configurable: true,
                enumerable: false,
                writable: false,
            });
        }

        if (!refineShopStatusProto[HOOK_FLAG_SHOP_STATUS_META]) {
            const originalDrawMetaTag = refineShopStatusProto.drawMetaTag;
            const translateRuntimeText = this._translateRuntimeText.bind(this);
            refineShopStatusProto.drawMetaTag = function (text) {
                const nextArguments = Array.from(arguments);
                nextArguments[0] = translateRuntimeText(text, true);
                return originalDrawMetaTag.apply(this, nextArguments);
            };

            Object.defineProperty(refineShopStatusProto, HOOK_FLAG_SHOP_STATUS_META, {
                value: true,
                configurable: true,
                enumerable: false,
                writable: false,
            });
        }

        return true;
    }

    _appendParameterEntries(output, parameters, scope) {
        if (!Array.isArray(output) || !parameters || typeof parameters !== 'object') {
            return;
        }

        for (const key of DIRECT_TEXT_KEYS) {
            this._appendTextEntry(output, parameters[key], { scope, field: key });
        }

        for (const key of CSV_TEXT_KEYS) {
            const rawValue = parameters[key];
            if (!this.isUsableText(rawValue)) {
                continue;
            }

            const tokens = String(rawValue).split(',');
            for (const token of tokens) {
                this._appendTextEntry(output, token, {
                    scope,
                    field: key,
                    kind: 'csv',
                });
            }
        }

        for (const key of LIST_WITH_CUSTOM_TOKENS) {
            const rawValue = parameters[key];
            if (!this.isUsableText(rawValue)) {
                continue;
            }

            const tokens = String(rawValue).split(',');
            for (const token of tokens) {
                this._appendCustomListTokenText(output, token, scope, key);
            }
        }
    }

    _appendCustomListTokenText(output, token, scope, key) {
        const text = String(token || '');
        if (!this.isUsableText(text)) {
            return;
        }

        const exMatch = /^ex<[^:>]+:([^:>]+):/i.exec(text);
        if (exMatch && this.isUsableText(exMatch[1])) {
            this._appendTextEntry(output, exMatch[1], {
                scope,
                field: key,
                kind: 'custom_ex',
            });
            return;
        }

        const normalized = text.trim().toLowerCase();
        if (RESERVED_LIST_TOKENS.has(normalized)) {
            return;
        }

        if (/^meta\[[^\]]+\]$/i.test(normalized)) {
            return;
        }

        if (/^e\d+$/i.test(normalized) || /^s\d+$/i.test(normalized) || /^d\d+$/i.test(normalized)) {
            return;
        }

        this._appendTextEntry(output, text, {
            scope,
            field: key,
            kind: 'literal_token',
        });
    }

    _appendTextEntry(output, value, source) {
        if (!Array.isArray(output) || !this.isUsableText(value)) {
            return;
        }

        output.push({
            text: String(value),
            source,
        });
    }

    _getKnownTexts() {
        if (this._knownTexts instanceof Set) {
            return this._knownTexts;
        }

        const sourceEntries = this._scanPrepared ? this._scanEntries : this.buildScanEntries();
        const knownTexts = new Set();
        for (const entry of sourceEntries) {
            if (this.isUsableText(entry?.text)) {
                knownTexts.add(String(entry.text));
            }
        }

        this._knownTexts = knownTexts;
        return knownTexts;
    }

    _translateRuntimeText(text, allowUnknown) {
        if (!this.isUsableText(text)) {
            return text;
        }

        const sourceText = String(text);
        const knownTexts = this._getKnownTexts();
        if (!allowUnknown && !knownTexts.has(sourceText)) {
            return sourceText;
        }

        const runtime = this.getRuntime();
        if (!runtime) {
            return sourceText;
        }

        if (!this.isRuntimeTranslationActive(runtime)) {
            const cacheKey = runtime.getCacheKey(sourceText, this.getCacheType());
            runtime.trackCacheKeyUsage(cacheKey);
            return sourceText;
        }

        return this.resolveRuntimeTranslation(sourceText, runtime, this.getCacheType(), {
            requireRuntimeTranslationActive: true,
            missValue: sourceText,
        });
    }

    _buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = entry?.text;
            if (!this.isUsableText(text)) {
                continue;
            }

            const sourceText = String(text);
            const cacheKey = runtime.getCacheKey(sourceText, this.getCacheType());
            if (byCacheKey.has(cacheKey)) {
                continue;
            }

            byCacheKey.set(cacheKey, {
                type: this.getCacheType(),
                id: `plugin_equip_and_shop_status_r_${byCacheKey.size}`,
                value: sourceText,
                cacheKey,
            });
        }

        return Array.from(byCacheKey.values());
    }
}