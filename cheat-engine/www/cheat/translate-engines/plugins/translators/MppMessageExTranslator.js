/** MPP_MessageEX (MV/MZ): preserve escape commands and translate Text Set
 * display resources without rewriting the native parameter table or SET IDs.
 */
import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';
import { readJavaScriptLiteralData } from './JavaScriptTextCatalog.js';
const CACHE_TYPE = 'plugin_mpp_message_ex';

const MPP_MESSAGE_EX_PLUGIN_TAGS = [
    // Commands with numeric parameter [n]
    {
        description: 'MPP MessageEX speed',
        type: 'withNumericParameter',
        tagSymbol: 'SP',
        requiredConsistency: true,
    },
    {
        description: 'MPP MessageEX animation type',
        type: 'withNumericParameter',
        tagSymbol: 'AT',
        requiredConsistency: true,
    },
    {
        description: 'MPP MessageEX set text index',
        type: 'withNumericParameter',
        tagSymbol: 'SET',
        requiredConsistency: true,
    },
    {
        description: 'MPP MessageEX position X offset',
        type: 'withNumericParameter',
        tagSymbol: 'PX',
        requiredConsistency: true,
    },
    {
        description: 'MPP MessageEX position Y offset',
        type: 'withNumericParameter',
        tagSymbol: 'PY',
        requiredConsistency: true,
    },
    {
        description: 'MPP MessageEX set X',
        type: 'withNumericParameter',
        tagSymbol: 'TX',
        requiredConsistency: true,
    },
    {
        description: 'MPP MessageEX set Y',
        type: 'withNumericParameter',
        tagSymbol: 'TY',
        requiredConsistency: true,
    },
    {
        description: 'MPP MessageEX switch on',
        type: 'withNumericParameter',
        tagSymbol: 'SW',
        requiredConsistency: true,
    },
    {
        description: 'MPP MessageEX character SE index',
        type: 'withNumericParameter',
        tagSymbol: 'SE',
        requiredConsistency: true,
    },
    {
        description: 'MPP MessageEX skill name',
        type: 'withNumericParameter',
        tagSymbol: 'SN',
        requiredConsistency: true,
    },
    {
        description: 'MPP MessageEX skill icon and name',
        type: 'withNumericParameter',
        tagSymbol: 'SIN',
        requiredConsistency: true,
    },
    {
        description: 'MPP MessageEX item name',
        type: 'withNumericParameter',
        tagSymbol: 'IN',
        requiredConsistency: true,
    },
    {
        description: 'MPP MessageEX item icon and name',
        type: 'withNumericParameter',
        tagSymbol: 'IIN',
        requiredConsistency: true,
    },
    {
        description: 'MPP MessageEX weapon name',
        type: 'withNumericParameter',
        tagSymbol: 'WN',
        requiredConsistency: true,
    },
    {
        description: 'MPP MessageEX weapon icon and name',
        type: 'withNumericParameter',
        tagSymbol: 'WIN',
        requiredConsistency: true,
    },
    {
        description: 'MPP MessageEX armor name',
        type: 'withNumericParameter',
        tagSymbol: 'AN',
        requiredConsistency: true,
    },
    {
        description: 'MPP MessageEX armor icon and name',
        type: 'withNumericParameter',
        tagSymbol: 'AIN',
        requiredConsistency: true,
    },
    {
        description: 'MPP MessageEX text color index',
        type: 'withNumericParameter',
        tagSymbol: 'C',
        requiredConsistency: true,
    },
    {
        description: 'MPP MessageEX font size',
        type: 'withNumericParameter',
        tagSymbol: 'FS',
        requiredConsistency: true,
    },
    {
        description: 'MPP MessageEX text opacity',
        type: 'withNumericParameter',
        tagSymbol: 'OP',
        requiredConsistency: true,
    },
    {
        description: 'MPP MessageEX outline color index',
        type: 'withNumericParameter',
        tagSymbol: 'OC',
        requiredConsistency: true,
    },
    {
        description: 'MPP MessageEX outline width',
        type: 'withNumericParameter',
        tagSymbol: 'OW',
        requiredConsistency: true,
    },
    {
        description: 'MPP MessageEX ruby color index',
        type: 'withNumericParameter',
        tagSymbol: 'RC',
        requiredConsistency: true,
    },
    {
        description: 'MPP MessageEX ruby size',
        type: 'withNumericParameter',
        tagSymbol: 'RS',
        requiredConsistency: true,
    },
    {
        description: 'MPP MessageEX ruby outline width',
        type: 'withNumericParameter',
        tagSymbol: 'RW',
        requiredConsistency: true,
    },
    {
        description: 'MPP MessageEX name color index',
        type: 'withNumericParameter',
        tagSymbol: 'NC',
        requiredConsistency: true,
    },
    {
        description: 'MPP MessageEX face window duration',
        type: 'withNumericParameter',
        tagSymbol: 'FW',
        requiredConsistency: true,
    },

    // Commands with text payload that should remain unmasked for translation
    {
        description: 'MPP MessageEX name window text',
        type: 'withCustomParameter',
        tagSymbol: 'NW',
        bracket: '[',
        maskValue: false,
        requiredConsistency: true,
        alwaysTranslate: true,
    },
    {
        description: 'MPP MessageEX grouped text',
        type: 'withCustomParameter',
        tagSymbol: 'CO',
        bracket: '[',
        maskValue: false,
        requiredConsistency: true,
    },
    {
        description: 'MPP MessageEX ruby text and reading',
        type: 'withCustomParameter',
        tagSymbol: 'RB',
        bracket: '[',
        maskValue: false,
        requiredConsistency: true,
    },

    // Non-text custom payloads should remain masked
    {
        description: 'MPP MessageEX text color rgb/rgba',
        type: 'withCustomParameter',
        tagSymbol: 'C',
        bracket: '[',
        maskValue: true,
        requiredConsistency: true,
    },
    {
        description: 'MPP MessageEX outline color rgb/rgba',
        type: 'withCustomParameter',
        tagSymbol: 'OC',
        bracket: '[',
        maskValue: true,
        requiredConsistency: true,
    },
    {
        description: 'MPP MessageEX ruby color rgb',
        type: 'withCustomParameter',
        tagSymbol: 'RC',
        bracket: '[',
        maskValue: true,
        requiredConsistency: true,
    },

    // Commands without parameter
    {
        description: 'MPP MessageEX wait effects',
        type: 'withoutParameter',
        tagSymbol: 'WE',
        requiredConsistency: true,
    },
    {
        description: 'MPP MessageEX reset text settings',
        type: 'withoutParameter',
        tagSymbol: 'DF',
        requiredConsistency: true,
    },
    {
        description: 'MPP MessageEX save text settings',
        type: 'withoutParameter',
        tagSymbol: 'SV',
        requiredConsistency: true,
    },
    {
        description: 'MPP MessageEX load text settings',
        type: 'withoutParameter',
        tagSymbol: 'LD',
        requiredConsistency: true,
    },
    {
        description: 'MPP MessageEX auto mode lock',
        type: 'withoutParameter',
        tagSymbol: 'A',
        requiredConsistency: true,
    },
    {
        description: 'MPP MessageEX face right',
        type: 'withoutParameter',
        tagSymbol: 'FR',
        requiredConsistency: true,
    },
    {
        description: 'MPP MessageEX face mirror',
        type: 'withoutParameter',
        tagSymbol: 'FM',
        requiredConsistency: true,
    },
    {
        description: 'MPP MessageEX temporary effect skip',
        type: 'withoutParameter',
        tagSymbol: 'ES',
        requiredConsistency: true,
    },
];

export class MppMessageExTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'MPP_MessageEX';
    }

    getPluginLabel() {
        return 'MPP MessageEX';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    getSourcePluginNames() {
        return [];
    }
    shouldScanEventData() {
        return false;
    }
    async collectAdditionalTexts() {
        const response = await fetch('js/plugins.js');
        if (!response.ok) throw new Error('Cannot read MPP_MessageEX source parameters');
        const { bindings } = readJavaScriptLiteralData(await response.text(), ['$plugins']);
        const plugin = bindings.$plugins?.find(
            (row) =>
                row.status &&
                row.name.split('/').pop().toLowerCase() === this.getPluginName().toLowerCase()
        );
        for (const value of parseJsonSafely(plugin?.parameters['Text Set'], [])) {
            if (typeof value !== 'string') continue;
            const text = value.replace(/\\\\/g, '\\');
            if (!text.replace(/\\+[A-Za-z]+\[[^\]]*\]/g, '').trim()) continue;
            this.entries.set(text, { text });
        }
    }
    enablePluginTranslation() {
        const base = window.Window_Base?.prototype;
        if (typeof base?.convertEscapeCharacters !== 'function') return false;
        if (!super.enablePluginTranslation()) return false;
        this.registerPluginCustomTags(MPP_MESSAGE_EX_PLUGIN_TAGS);
        const translator = this;
        for (const prototype of [base, window.Window_Message?.prototype]) {
            if (
                !prototype ||
                (prototype !== base &&
                    !Object.prototype.hasOwnProperty.call(prototype, 'convertEscapeCharacters'))
            )
                continue;
            const convert = prototype.convertEscapeCharacters;
            prototype.convertEscapeCharacters = function (text, ...args) {
                const converted = convert.call(this, text, ...args);
                const runtime = translator.getRuntime();
                if (!translator.isRuntimeTranslationActive(runtime)) return converted;
                return translator.resolveEscapeConvertedText(converted, runtime);
            };
        }
        return true;
    }
}
