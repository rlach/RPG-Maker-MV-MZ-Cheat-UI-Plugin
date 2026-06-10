import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * MiniInformationWindow.js translator.
 *
 * Supported plugin versions:
 * - v1.03 (MV)
 *
 * Translation notes:
 * - Collects the exact mini-window detail lines authored by the plugin from
 *   item/skill/weapon/armor database data, including AddInfoWindow note tags.
 * - Rebuilds the plugin's display strings with the active plugin parameters so
 *   Mass Translate keys match the runtime `_data` lines exactly.
 * - Runtime hook patches the mini-window instance `makeContents()` path via
 *   `Scene_Base#createMiniWindow`, translating and tracking the original `_data`
 *   entries after the plugin assembles them.
 * - Dynamic lines injected by other plugins (for example `item.data` or custom
 *   `DataManager.afterInfoItem()` extensions) are harvested through runtime seen
 *   tracking even when they cannot be precomputed from static database data.
 */

const PLUGIN_NAME = 'MiniInformationWindow';
const CACHE_TYPE = 'plugin_mini_information_window';

const DEFAULT_EFFECT_NAMES =
    'HP回復,HPダメージ,MP回復,MPダメージ,TP増加,ステート付与,ステート解除,強化付与,弱体付与,強化解除,弱体解除,特殊効果,成長,スキル習得,コモン';
const DEFAULT_DEFEAT_TEXT = '通常,ボス,瞬間消去,消えない';
const DEFAULT_PARAM_COLOR = '6,4,24,2';
const DEFAULT_PARAM_TEXT = Object.freeze({
    1: ' 有効度,弱体有効度,無効化',
    2: '命中率,回避率,会心率,会心回避,魔法回避,魔法反射率,反撃率,再生率,再生率,再生率',
    3: '狙われ率,防御効果率,回復効果率,薬の知識,消費率,チャージ率,物理ダメージ率,魔法ダメージ率,床ダメージ率,経験値獲得率',
    4: '攻撃属性付与:,攻撃時ステート付与:,攻撃速度,攻撃回数',
    5: 'スキルタイプ追加:,スキルタイプ封印:,スキル追加:,スキル封印:',
    6: '武器タイプ追加:,防具タイプ追加:,装備固定:,装備封印:,二刀流',
    7: '行動回数追加,自動戦闘,防御,身代わり,TP持越し,消滅エフェクト,エンカウント半減,エンカウント無効,不意打ち無効,先制率アップ,取得金額倍化,アイテム取得率倍化',
});

const DATABASE_SOURCES = Object.freeze([
    { scope: 'items', dataKey: '$dataItems' },
    { scope: 'skills', dataKey: '$dataSkills' },
    { scope: 'weapons', dataKey: '$dataWeapons' },
    { scope: 'armors', dataKey: '$dataArmors' },
]);

const EFFECT_HANDLER_METHODS = Object.freeze({
    11: 'buildRecoverHpEffectText',
    12: 'buildRecoverMpEffectText',
    13: 'buildGainTpEffectText',
    21: 'buildAddStateEffectText',
    22: 'buildRemoveStateEffectText',
    31: 'buildAddBuffEffectText',
    32: 'buildAddDebuffEffectText',
    33: 'buildRemoveBuffEffectText',
    34: 'buildRemoveDebuffEffectText',
    41: 'buildEscapeEffectText',
    42: 'buildGrowEffectText',
    43: 'buildLearnSkillEffectText',
    44: 'buildCommonEventEffectText',
});

const TRAIT_HANDLER_METHODS = Object.freeze({
    11: 'buildElementRateTraitText',
    12: 'buildDebuffRateTraitText',
    13: 'buildStateRateTraitText',
    14: 'buildStateResistTraitText',
    21: 'buildParamRateTraitText',
    22: 'buildXParamTraitText',
    23: 'buildSParamTraitText',
    31: 'buildAttackElementTraitText',
    32: 'buildAttackStateTraitText',
    33: 'buildAttackSpeedTraitText',
    34: 'buildAttackTimesTraitText',
    41: 'buildSkillTypeTraitText',
    42: 'buildSkillTypeTraitText',
    43: 'buildSkillTraitText',
    44: 'buildSkillTraitText',
    51: 'buildEquipTypeAddTraitText',
    52: 'buildEquipTypeAddTraitText',
    53: 'buildEquipLockSealTraitText',
    54: 'buildEquipLockSealTraitText',
    55: 'buildDualWieldTraitText',
    61: 'buildActionPlusTraitText',
    62: 'buildSpecialFlagTraitText',
    63: 'buildCollapseEffectTraitText',
    64: 'buildPartyAbilityTraitText',
    111: 'buildPlusElementRateTraitText',
    112: 'buildPlusDebuffRateTraitText',
    113: 'buildPlusStateRateTraitText',
    121: 'buildPlusParamTraitText',
    123: 'buildPlusSParamTraitText',
});

function buildColorCodes(paramColor) {
    return {
        c: String.raw`\C[${paramColor[0]}]`,
        s: String.raw`\C[${paramColor[1]}]`,
        g: String.raw`\C[${paramColor[2]}]`,
        r: String.raw`\C[${paramColor[3]}]`,
    };
}

export class MiniInformationWindowTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return PLUGIN_NAME;
    }

    getPluginLabel() {
        return 'MiniInformationWindow';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    enablePluginTranslation() {
        const sceneBaseProto = globalThis.Scene_Base?.prototype;
        if (!sceneBaseProto || typeof sceneBaseProto.createMiniWindow !== 'function') {
            return false;
        }

        if (!sceneBaseProto.__CHEAT_MINI_INFORMATION_WINDOW_TRANSLATOR_HOOKED__) {
            const originalCreateMiniWindow = sceneBaseProto.createMiniWindow;
            const patchMiniWindowInstance = this.patchMiniWindowInstance.bind(this);

            sceneBaseProto.createMiniWindow = function () {
                const result = originalCreateMiniWindow.apply(this, arguments);

                try {
                    patchMiniWindowInstance(this._miniWindow);
                } catch (error) {
                    console.warn(
                        '[MiniInformationWindowTranslator] Failed to patch mini window instance',
                        error
                    );
                }

                return result;
            };

            Object.defineProperty(
                sceneBaseProto,
                '__CHEAT_MINI_INFORMATION_WINDOW_TRANSLATOR_HOOKED__',
                {
                    value: true,
                    configurable: true,
                    enumerable: false,
                    writable: false,
                }
            );
        }

        try {
            this.patchMiniWindowInstance(globalThis.SceneManager?._scene?._miniWindow);
        } catch (error) {
            console.warn(
                '[MiniInformationWindowTranslator] Failed to patch current mini window instance',
                error
            );
        }

        return true;
    }

    patchMiniWindowInstance(windowInstance) {
        if (!windowInstance) {
            return;
        }

        const miniWindowProto = Object.getPrototypeOf(windowInstance);
        if (!miniWindowProto || typeof miniWindowProto.makeContents !== 'function') {
            return;
        }

        if (miniWindowProto.__CHEAT_MINI_INFORMATION_WINDOW_MAKE_CONTENTS_HOOKED__) {
            return;
        }

        const originalMakeContents = miniWindowProto.makeContents;
        const getRuntime = this.getRuntime.bind(this);
        const translateDataLines = this.translateDataLines.bind(this);

        miniWindowProto.makeContents = function () {
            originalMakeContents.apply(this, arguments);

            try {
                const runtime = getRuntime();
                if (!runtime || !Array.isArray(this._data) || this._data.length <= 0) {
                    return;
                }

                this._data = translateDataLines(this._data, runtime);
            } catch (error) {
                console.warn(
                    '[MiniInformationWindowTranslator] Failed to translate mini window lines',
                    error
                );
            }
        };

        Object.defineProperty(
            miniWindowProto,
            '__CHEAT_MINI_INFORMATION_WINDOW_MAKE_CONTENTS_HOOKED__',
            {
                value: true,
                configurable: true,
                enumerable: false,
                writable: false,
            }
        );
    }

    translateDataLines(lines, runtime) {
        return lines.map((line) => this.translateDataLine(line, runtime));
    }

    translateDataLine(line, runtime) {
        if (!this.isUsableText(line) || !runtime) {
            return line;
        }

        if (!this.isRuntimeTranslationActive(runtime)) {
            const cacheKey = runtime.getCacheKey(line, this.getCacheType());
            runtime.trackCacheKeyUsage(cacheKey);
            return line;
        }

        return this.resolveRuntimeTranslation(line, runtime, this.getCacheType(), {
            requireRuntimeTranslationActive: true,
            missValue: line,
        });
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
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[MiniInformationWindowTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const settings = this.getPluginSettings();
        const entries = [];

        for (const source of DATABASE_SOURCES) {
            const dataList = globalThis[source.dataKey];
            if (!Array.isArray(dataList)) {
                continue;
            }

            for (let id = 1; id < dataList.length; id += 1) {
                const data = dataList[id];
                if (!data || typeof data !== 'object') {
                    continue;
                }

                const lines = this.buildMiniInfoLines(data, settings);
                for (let lineIdx = 0; lineIdx < lines.length; lineIdx += 1) {
                    const text = lines[lineIdx];
                    if (!this.isUsableText(text)) {
                        continue;
                    }

                    entries.push({
                        text,
                        source: {
                            scope: source.scope,
                            id,
                            lineIdx,
                        },
                    });
                }
            }
        }

        return entries;
    }

    ensureScanEntriesSync() {
        if (this._scanPrepared) {
            return;
        }

        this._scanEntries = this.buildScanEntries();
        this._scanPrepared = true;
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
                id: `plugin_mini_information_window_${byCacheKey.size}`,
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

        this.ensureScanEntriesSync();
        const items = this.buildUniquePendingItems(runtime);
        return items.filter((item) => !runtime.hasUsableCacheValue(item.cacheKey));
    }

    getCachedCountsSync({ runtime }) {
        if (!runtime) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        this.ensureScanEntriesSync();

        const items = this.buildUniquePendingItems(runtime);
        let left = 0;
        for (const item of items) {
            if (!runtime.hasUsableCacheValue(item.cacheKey)) {
                left += 1;
            }
        }

        return {
            total: items.length,
            left,
            totalStrings: items.length,
            leftStrings: left,
        };
    }

    getPluginSettings() {
        const pluginManagerParameters = globalThis.PluginManager?.parameters?.(
            this.getPluginName()
        );
        const pluginEntry = this.findPluginEntry(this.getPluginName());
        const parameters = pluginManagerParameters || pluginEntry?.parameters || {};
        return this.parsePluginSettings(parameters);
    }

    parsePluginSettings(parameters) {
        const safeParameters = parameters && typeof parameters === 'object' ? parameters : {};
        const paramVocab = [];
        for (let i = 1; i <= 7; i += 1) {
            const key = `Param Text${i}`;
            paramVocab.push(String(safeParameters[key] || DEFAULT_PARAM_TEXT[i]).split(','));
        }

        return {
            turnText: String(safeParameters['Turn Text'] || 'ターン'),
            escapeText: String(safeParameters['Escape Text'] || '逃げる'),
            effectNames: String(safeParameters['Effects Names'] || DEFAULT_EFFECT_NAMES).split(','),
            defeatText: String(safeParameters['Defeat Text'] || DEFAULT_DEFEAT_TEXT).split(','),
            paramColor: String(safeParameters['Param Color'] || DEFAULT_PARAM_COLOR).split(','),
            paramVocab,
        };
    }

    buildMiniInfoLines(item, settings) {
        const lines = [];
        const noteInfo = this.extractNoteInfo(item);
        this.appendUsableTexts(lines, noteInfo.preInfos);
        this.appendBuiltTexts(lines, item?.effects, (effect) =>
            this.buildEffectText(effect, settings)
        );
        this.appendUsableTexts(lines, this.buildParamTexts(item?.params, settings));
        this.appendBuiltTexts(lines, item?.traits, (trait) => this.buildTraitText(trait, settings));
        this.appendUsableTexts(lines, item?.data);
        this.appendUsableTexts(lines, noteInfo.afterInfos);
        return lines;
    }

    appendUsableTexts(output, values) {
        if (!Array.isArray(output) || !Array.isArray(values)) {
            return;
        }

        for (const value of values) {
            if (this.isUsableText(value)) {
                output.push(value);
            }
        }
    }

    appendBuiltTexts(output, values, builder) {
        if (!Array.isArray(output) || !Array.isArray(values)) {
            return;
        }

        for (const value of values) {
            const text = builder(value);
            if (this.isUsableText(text)) {
                output.push(text);
            }
        }
    }

    extractNoteInfo(item) {
        const preInfos = [];
        const afterInfos = [];

        const note = typeof item?.note === 'string' ? item.note : '';
        if (!note) {
            return { preInfos, afterInfos };
        }

        const texts = note.split('\n');
        for (const text of texts) {
            const match = text.match(/<(?:情報ウィンドウ追加|AddInfoWindow)([前後PA]):(.+)>/);
            if (!match) {
                continue;
            }

            if (match[1] === '前' || match[1] === 'P') {
                preInfos.push(match[2]);
            }

            if (match[1] === '後' || match[1] === 'A') {
                afterInfos.push(match[2]);
            }
        }

        return { preInfos, afterInfos };
    }

    buildEffectText(effect, settings) {
        const handlerName = EFFECT_HANDLER_METHODS[Number(effect?.code)];
        if (!handlerName) {
            return '';
        }

        return this[handlerName](effect, settings);
    }

    getEffectContext(settings) {
        return {
            ...buildColorCodes(settings.paramColor),
            effectNames: settings.effectNames,
            turnText: settings.turnText,
            escapeText: settings.escapeText,
        };
    }

    buildRecoverHpEffectText(effect, settings) {
        return this.buildRecoverEffectText(effect, settings, 0, 1);
    }

    buildRecoverMpEffectText(effect, settings) {
        return this.buildRecoverEffectText(effect, settings, 2, 3);
    }

    buildRecoverEffectText(effect, settings, positiveIndex, negativeIndex) {
        const { s, g, r, effectNames } = this.getEffectContext(settings);
        let text = '';

        if (effect.value1 > 0 && effectNames[positiveIndex]) {
            text = `${s}${effectNames[positiveIndex]}:${g}${Math.floor(effect.value1 * 100)}%`;
        }
        if (effect.value1 < 0 && effectNames[negativeIndex]) {
            text = `${s}${effectNames[negativeIndex]}:${r}${Math.floor(Math.abs(effect.value1 * 100))}%`;
        }
        if (effect.value2 > 0 && effectNames[positiveIndex]) {
            text = `${s}${effectNames[positiveIndex]}:${g}${effect.value2}`;
        }
        if (effect.value2 < 0 && effectNames[negativeIndex]) {
            text = `${s}${effectNames[negativeIndex]}:${r}${Math.abs(effect.value2)}`;
        }

        return text;
    }

    buildGainTpEffectText(effect, settings) {
        const { s, g, effectNames } = this.getEffectContext(settings);
        return effect.value1 > 0 && effectNames[4]
            ? `${s}${effectNames[4]}${g}+${effect.value1}`
            : '';
    }

    buildAddStateEffectText(effect, settings) {
        return this.buildStateEffectText(effect, settings, 5);
    }

    buildRemoveStateEffectText(effect, settings) {
        return this.buildStateEffectText(effect, settings, 6);
    }

    buildStateEffectText(effect, settings, effectNameIndex) {
        const { s, c, effectNames } = this.getEffectContext(settings);
        const name = globalThis.$dataStates?.[effect.dataId]?.name;
        if (!name || effect.value1 <= 0 || !effectNames[effectNameIndex]) {
            return '';
        }

        return `${s}${effectNames[effectNameIndex]}:${c}${name} ${Math.floor(
            Math.abs(effect.value1 * 100)
        )}%`;
    }

    buildAddBuffEffectText(effect, settings) {
        return this.buildTimedParamEffectText(effect, settings, 7);
    }

    buildAddDebuffEffectText(effect, settings) {
        return this.buildTimedParamEffectText(effect, settings, 8);
    }

    buildTimedParamEffectText(effect, settings, effectNameIndex) {
        const { s, c, effectNames, turnText } = this.getEffectContext(settings);
        const name = globalThis.TextManager?.param(effect.dataId) || '';
        if (effect.value1 <= 0 || !effectNames[effectNameIndex]) {
            return '';
        }

        return `${s}${effectNames[effectNameIndex]}:${c}${name} ${effect.value1}${turnText}`;
    }

    buildRemoveBuffEffectText(effect, settings) {
        return this.buildParamOnlyEffectText(effect, settings, 9);
    }

    buildRemoveDebuffEffectText(effect, settings) {
        return this.buildParamOnlyEffectText(effect, settings, 10);
    }

    buildParamOnlyEffectText(effect, settings, effectNameIndex) {
        const { s, c, effectNames } = this.getEffectContext(settings);
        const name = globalThis.TextManager?.param(effect.dataId) || '';
        return effectNames[effectNameIndex]
            ? `${s}${effectNames[effectNameIndex]}:${c}${name}`
            : '';
    }

    buildEscapeEffectText(_effect, settings) {
        const { s, c, effectNames, escapeText } = this.getEffectContext(settings);
        return effectNames[11] ? `${s}${effectNames[11]}:${c}${escapeText}` : '';
    }

    buildGrowEffectText(effect, settings) {
        const { s, c, effectNames } = this.getEffectContext(settings);
        const name = globalThis.TextManager?.param(effect.dataId) || '';
        return effectNames[12] ? `${s}${effectNames[12]}:${c}${name}+${effect.value1}` : '';
    }

    buildLearnSkillEffectText(effect, settings) {
        const { s, c, effectNames } = this.getEffectContext(settings);
        const name = globalThis.$dataSkills?.[effect.dataId]?.name;
        return name && effectNames[13] ? `${s}${effectNames[13]}:${c}${name}` : '';
    }

    buildCommonEventEffectText(effect, settings) {
        const { s, c, effectNames } = this.getEffectContext(settings);
        const name = globalThis.$dataCommonEvents?.[effect.dataId]?.name;
        return name && effectNames[14] ? `${s}${effectNames[14]}:${c}${name}` : '';
    }

    buildParamTexts(params, settings) {
        if (!Array.isArray(params)) {
            return [];
        }

        const { s, g, r } = buildColorCodes(settings.paramColor);
        const results = [];

        for (let i = 0; i < 8; i += 1) {
            const value = params[i];
            if (value === 0) {
                continue;
            }

            const ud = value > 0 ? g : r;
            const sym = value > 0 ? '+' : '';
            results.push(`${s}${globalThis.TextManager?.param(i) || ''}${ud}${sym}${value}`);
        }

        return results;
    }

    buildTraitText(trait, settings) {
        const handlerName = TRAIT_HANDLER_METHODS[Number(trait?.code)];
        if (!handlerName) {
            return '';
        }

        return this[handlerName](trait, settings);
    }

    getTraitContext(trait, settings) {
        const { c, s, g, r } = buildColorCodes(settings.paramColor);
        const value = Number(trait?.value);
        return {
            c,
            s,
            g,
            r,
            vocab: settings.paramVocab,
            defeatText: settings.defeatText,
            dataId: trait?.dataId,
            value,
            ud: value > 1 ? g : r,
            du: value < 1 ? g : r,
            sym: value > 0 ? '+' : '',
        };
    }

    buildElementRateTraitText(trait, settings) {
        const context = this.getTraitContext(trait, settings);
        const ele = globalThis.$dataSystem?.elements?.[context.dataId];
        return context.vocab[0]?.[0] && context.value !== 1
            ? `${context.c}${ele}${context.s}${context.vocab[0][0]}${context.du}x${Math.floor(context.value * 100)}%`
            : '';
    }

    buildDebuffRateTraitText(trait, settings) {
        const context = this.getTraitContext(trait, settings);
        const param = globalThis.TextManager?.param(context.dataId) || '';
        return context.vocab[0]?.[1] && context.value !== 1
            ? `${context.c}${param}${context.s}${context.vocab[0][1]}${context.du}x${Math.floor(context.value * 100)}%`
            : '';
    }

    buildStateRateTraitText(trait, settings) {
        const context = this.getTraitContext(trait, settings);
        const state = globalThis.$dataStates?.[context.dataId]?.name;
        return context.vocab[0]?.[0] && context.value !== 1
            ? `${context.c}${state}${context.s}${context.vocab[0][0]}${context.du}x${Math.floor(context.value * 100)}%`
            : '';
    }

    buildStateResistTraitText(trait, settings) {
        const context = this.getTraitContext(trait, settings);
        const state = globalThis.$dataStates?.[context.dataId]?.name;
        return context.vocab[0]?.[2]
            ? `${context.c}${state}${context.s}${context.vocab[0][2]}`
            : '';
    }

    buildParamRateTraitText(trait, settings) {
        const context = this.getTraitContext(trait, settings);
        const param = globalThis.TextManager?.param(context.dataId) || '';
        if (context.value === 1) {
            return '';
        }

        return `${context.s}${param}${context.ud}x${Math.floor(context.value * 100)}%`;
    }

    buildXParamTraitText(trait, settings) {
        const context = this.getTraitContext(trait, settings);
        let xparam = context.vocab[1]?.[context.dataId];
        if (!xparam || context.value === 0) {
            return '';
        }

        if (context.dataId === 7) xparam = `${globalThis.TextManager?.hpA || ''}${xparam}`;
        if (context.dataId === 8) xparam = `${globalThis.TextManager?.mpA || ''}${xparam}`;
        if (context.dataId === 9) xparam = `${globalThis.TextManager?.tpA || ''}${xparam}`;

        return `${context.s}${xparam}${context.du}${context.sym}${Math.floor(context.value * 100)}%`;
    }

    buildSParamTraitText(trait, settings) {
        const context = this.getTraitContext(trait, settings);
        let sparam = context.vocab[2]?.[context.dataId];
        if (!sparam || context.value === 1) {
            return '';
        }

        let ud = context.ud;
        if (context.dataId === 0) ud = context.c;
        if (context.dataId === 4) {
            sparam = `${globalThis.TextManager?.mpA || ''}${sparam}`;
            ud = context.du;
        }
        if (context.dataId === 6 || context.dataId === 7 || context.dataId === 8) {
            ud = context.du;
        }

        return `${context.s}${sparam}${ud}x${Math.floor(context.value * 100)}%`;
    }

    buildAttackElementTraitText(trait, settings) {
        const context = this.getTraitContext(trait, settings);
        const ele = globalThis.$dataSystem?.elements?.[context.dataId];
        return context.vocab[3]?.[0] ? `${context.s}${context.vocab[3][0]}${context.c}${ele}` : '';
    }

    buildAttackStateTraitText(trait, settings) {
        const context = this.getTraitContext(trait, settings);
        const state = globalThis.$dataStates?.[context.dataId]?.name;
        return context.vocab[3]?.[1] && context.value > 0
            ? `${context.s}${context.vocab[3][1]}${context.c}${state} ${Math.floor(context.value * 100)}%`
            : '';
    }

    buildAttackSpeedTraitText(trait, settings) {
        const context = this.getTraitContext(trait, settings);
        return context.vocab[3]?.[2] && context.value !== 0
            ? `${context.s}${context.vocab[3][2]}${context.ud}${context.sym}${context.value}`
            : '';
    }

    buildAttackTimesTraitText(trait, settings) {
        const context = this.getTraitContext(trait, settings);
        const ud = context.value > 0 ? context.g : context.r;
        return context.vocab[3]?.[3] && context.value !== 0
            ? `${context.s}${context.vocab[3][3]}${ud}${context.sym}${context.value}回`
            : '';
    }

    buildSkillTypeTraitText(trait, settings) {
        const context = this.getTraitContext(trait, settings);
        const stype = globalThis.$dataSystem?.skillTypes?.[context.dataId];
        const label = trait.code === 41 ? context.vocab[4]?.[0] : context.vocab[4]?.[1];
        return label && stype ? `${context.s}${label}${context.c}${stype}` : '';
    }

    buildSkillTraitText(trait, settings) {
        const context = this.getTraitContext(trait, settings);
        const skill = globalThis.$dataSkills?.[context.dataId];
        const label = trait.code === 43 ? context.vocab[4]?.[2] : context.vocab[4]?.[3];
        return label && skill ? `${context.s}${label}${context.c}${skill.name}` : '';
    }

    buildEquipTypeAddTraitText(trait, settings) {
        const context = this.getTraitContext(trait, settings);
        const type =
            trait.code === 51
                ? globalThis.$dataSystem?.weaponTypes?.[context.dataId]
                : globalThis.$dataSystem?.armorTypes?.[context.dataId];
        const label = trait.code === 51 ? context.vocab[5]?.[0] : context.vocab[5]?.[1];
        return label && type ? `${context.s}${label}${context.c}${type}` : '';
    }

    buildEquipLockSealTraitText(trait, settings) {
        const context = this.getTraitContext(trait, settings);
        const etype = globalThis.$dataSystem?.equipTypes?.[context.dataId];
        const label = trait.code === 53 ? context.vocab[5]?.[2] : context.vocab[5]?.[3];
        return label && etype ? `${context.s}${label}${context.c}${etype}` : '';
    }

    buildDualWieldTraitText(trait, settings) {
        const context = this.getTraitContext(trait, settings);
        return context.vocab[5]?.[4] ? `${context.s}${context.vocab[5][4]}` : '';
    }

    buildActionPlusTraitText(trait, settings) {
        const context = this.getTraitContext(trait, settings);
        return context.vocab[6]?.[0] && context.value > 0
            ? `${context.s}${context.vocab[6][0]}${context.du}${context.sym}${context.value * 100}%`
            : '';
    }

    buildSpecialFlagTraitText(trait, settings) {
        const context = this.getTraitContext(trait, settings);
        return context.vocab[6]?.[1 + context.dataId]
            ? `${context.s}${context.vocab[6][1 + context.dataId]}`
            : '';
    }

    buildCollapseEffectTraitText(trait, settings) {
        const context = this.getTraitContext(trait, settings);
        return context.vocab[6]?.[5]
            ? `${context.s}${context.vocab[6][5]}${context.defeatText[context.dataId]}`
            : '';
    }

    buildPartyAbilityTraitText(trait, settings) {
        const context = this.getTraitContext(trait, settings);
        return context.vocab[6]?.[6 + context.dataId]
            ? `${context.s}${context.vocab[6][6 + context.dataId]}`
            : '';
    }

    buildPlusElementRateTraitText(trait, settings) {
        const context = this.getTraitContext(trait, settings);
        const ele = globalThis.$dataSystem?.elements?.[context.dataId];
        const du = context.value < 0 ? context.g : context.r;
        return context.vocab[0]?.[0] && context.value !== 0
            ? `${context.c}${ele}${context.s}${context.vocab[0][0]}${du}${context.sym}${Math.floor(context.value * 100)}%`
            : '';
    }

    buildPlusDebuffRateTraitText(trait, settings) {
        const context = this.getTraitContext(trait, settings);
        const param = globalThis.TextManager?.param(context.dataId) || '';
        const du = context.value < 0 ? context.g : context.r;
        return context.vocab[0]?.[1] && context.value !== 0
            ? `${context.c}${param}${context.s}${context.vocab[0][1]}${du}${context.sym}${Math.floor(context.value * 100)}%`
            : '';
    }

    buildPlusStateRateTraitText(trait, settings) {
        const context = this.getTraitContext(trait, settings);
        const state = globalThis.$dataStates?.[context.dataId]?.name;
        const du = context.value < 0 ? context.g : context.r;
        return context.vocab[0]?.[0] && context.value !== 0
            ? `${context.c}${state}${context.s}${context.vocab[0][0]}${du}${context.sym}${Math.floor(context.value * 100)}%`
            : '';
    }

    buildPlusParamTraitText(trait, settings) {
        const context = this.getTraitContext(trait, settings);
        const param = globalThis.TextManager?.param(context.dataId) || '';
        if (context.value === 0) {
            return '';
        }

        return `${context.s}${param}${context.ud}${context.sym}${context.value}`;
    }

    buildPlusSParamTraitText(trait, settings) {
        const context = this.getTraitContext(trait, settings);
        let sparam = context.vocab[2]?.[context.dataId];
        if (!sparam || context.value === 0) {
            return '';
        }

        let ud = context.value > 0 ? context.g : context.r;
        const du = context.value < 0 ? context.g : context.r;
        if (context.dataId === 0) ud = context.c;
        if (context.dataId === 4) {
            sparam = `${globalThis.TextManager?.mpA || ''}${sparam}`;
            ud = du;
        }
        if (context.dataId === 6 || context.dataId === 7 || context.dataId === 8) {
            ud = du;
        }

        return `${context.s}${sparam}${ud}${context.sym}${Math.floor(context.value * 100)}%`;
    }
}
