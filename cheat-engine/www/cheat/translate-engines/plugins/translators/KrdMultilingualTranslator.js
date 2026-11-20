/* global KRD_MULTILINGUAL */
import { BasePluginTranslator } from '../BasePluginTranslator.js';

/** KRD Multilingual native getters remain authoritative; localize their results. */
export class KrdMultilingualTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'KRD_MZ_Multilingual';
    }
    getPluginLabel() {
        return 'KRD Multilingual';
    }
    getCacheType() {
        return 'plugin_krd_multilingual';
    }
    enablePluginTranslation() {
        const native =
            typeof KRD_MULTILINGUAL !== 'undefined' ? KRD_MULTILINGUAL : window.KRD_MULTILINGUAL;
        const prototype = window.Window_Base?.prototype;
        if (
            typeof native?.getReturnData !== 'function' ||
            typeof prototype?.convertEscapeCharacters !== 'function'
        )
            return false;
        this.registerPluginCustomTags([
            {
                description: 'KRD language block',
                tagSymbol: 'LANG',
                type: 'withNumericParameter',
                requiredConsistency: true,
            },
            {
                description: 'KRD language block end',
                tagSymbol: 'LANGEND',
                type: 'withoutParameter',
                requiredConsistency: true,
            },
            {
                description: 'DarkPlasma actor name window',
                tagSymbol: 'NDP',
                type: 'withCustomParameter',
                bracket: '<',
                maskValue: true,
                requiredConsistency: true,
            },
        ]);
        const translator = this;
        const getReturnData = native.getReturnData;
        native.getReturnData = function (data, field, ...args) {
            const source = getReturnData.call(this, data, field, ...args);
            const type = this.getType(data);
            if (
                !type ||
                ![
                    'name',
                    'nickname',
                    'profile',
                    'description',
                    'message1',
                    'message2',
                    'message3',
                    'message4',
                ].includes(field)
            )
                return source;
            const runtime = translator.getRuntime();
            if (!translator.isRuntimeTranslationActive(runtime)) return source;
            const cacheType = `${type}_${field}`;
            const translated = translator.resolveRuntimeTranslation(source, runtime, cacheType, {
                harvestMissing: false,
            });
            if (translated !== source) return translated;
            for (const original of [data?._translateOriginal?.[field], data?.[field + '_0']]) {
                if (typeof original !== 'string' || original === source) continue;
                const fallback = translator.resolveRuntimeTranslation(
                    original,
                    runtime,
                    cacheType,
                    { harvestMissing: false }
                );
                if (fallback !== original) return fallback;
            }
            return source;
        };
        const textManager = window.TextManager;
        if (typeof textManager?.message === 'function') {
            const message = textManager.message;
            textManager.message = function (id, ...args) {
                const source = message.call(this, id, ...args);
                if (!translator.isRuntimeTranslationActive()) return source;
                const messages = window.$dataSystem?.terms;
                for (const candidate of [
                    source,
                    messages?.messagesOriginal?.[id],
                    messages?.messages?.[id],
                ]) {
                    const result = translator.resolveRuntimeTranslation(
                        candidate,
                        translator.getRuntime(),
                        'system_message',
                        { harvestMissing: false }
                    );
                    if (result !== candidate) return result;
                }
                return source;
            };
        }
        const convert = prototype.convertEscapeCharacters;
        prototype.convertEscapeCharacters = function (text, ...args) {
            if (typeof text === 'string' && translator.isRuntimeTranslationActive()) {
                // Literal newline controls in these native language blocks can
                // otherwise merge with Latin prose after NDP is removed.
                text = text.replace(/\\n(?![A-Za-z0-9<]|\[)/gi, '\n');
            }
            return convert.call(this, text, ...args);
        };
        return true;
    }
    collectUntranslated() {
        return [];
    }
    getCachedCountsSync() {
        return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
    }
}
