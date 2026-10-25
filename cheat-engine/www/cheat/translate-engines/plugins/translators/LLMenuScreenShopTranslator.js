import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely, parseStructArraySafely } from './TranslatorHelpers.js';

/**
 * LL_MenuScreenShopMV v1.0.2 (MV).
 * shopLists contains JSON structs with four JSON-encoded note fields per clerk.
 * Window_ShopMessage is closure-private: hook its instance after creation and
 * keep the JSON note contract at setText. Images and shop selection stay intact.
 */
export class LLMenuScreenShopTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'LL_MenuScreenShopMV';
    }

    getCacheType() {
        return 'plugin_ll_menu_screen_shop';
    }

    precomputeCounts() {
        if (this._texts) return;
        const shops = parseStructArraySafely(
            this.findPluginEntry(this.getPluginName())?.parameters?.shopLists
        );
        this._texts = [
            ...new Set(
                shops.flatMap((shop) =>
                    ['commandMessage', 'buyMessage', 'sellMessage', 'thanksMessage']
                        .map((field) => parseJsonSafely(shop[field]))
                        .filter((text) => this.isUsableText(text))
                )
            ),
        ];
    }

    buildPendingItems(runtime) {
        return (this._texts || []).map((value, index) => ({
            type: this.getCacheType(),
            id: `ll_shop_${index}`,
            value,
            cacheKey: runtime.getCacheKey(value, this.getCacheType()),
        }));
    }

    collectUntranslated({ runtime }) {
        return this.buildPendingItems(runtime).filter(
            (item) => !runtime.hasUsableCacheValue(item.cacheKey)
        );
    }

    getCachedCountsSync({ runtime }) {
        const total = (this._texts || []).length;
        const left = this.collectUntranslated({ runtime }).length;
        return { total, left, totalStrings: total, leftStrings: left };
    }

    enablePluginTranslation() {
        const prototype = window.Scene_Shop?.prototype;
        if (typeof prototype?.createMessageWindow !== 'function') return false;
        const create = prototype.createMessageWindow;
        const translator = this;
        prototype.createMessageWindow = function (...args) {
            const result = create.apply(this, args);
            const messageWindow = this._messageWindow;
            const setText = messageWindow.setText;
            messageWindow.setText = function (encodedText, ...rest) {
                const source = parseJsonSafely(encodedText);
                const runtime = translator.getRuntime();
                if (
                    translator.isUsableText(source) &&
                    translator.isRuntimeTranslationActive(runtime)
                ) {
                    encodedText = JSON.stringify(
                        translator.resolveRuntimeTranslation(source, runtime)
                    );
                }
                return setText.call(this, encodedText, ...rest);
            };
            return result;
        };
        return true;
    }
}
