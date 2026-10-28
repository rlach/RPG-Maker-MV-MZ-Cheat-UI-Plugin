import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/**
 * MOG_EventIndicators 1.0 (MZ): text_indicator comments and Text_Indicator
 * commands supply event labels. Translate only bitmap drawing in refreshText;
 * keep indicator settings, image filenames and variable-mode values original.
 */
export class MogEventIndicatorsTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'MOG_EventIndicators';
    }
    getPluginLabel() {
        return 'MOG event indicator labels';
    }
    getCacheType() {
        return 'plugin_mog_event_indicators';
    }
    getSourcePluginNames() {
        return [];
    }
    collectCommandTexts(list = []) {
        for (const command of list || []) {
            let text;
            if (command.code === 108) {
                const parts = String(command.parameters[0]).split(' : ');
                if (parts[0].toLowerCase() === 'text_indicator') text = parts[1];
            } else if (
                command.code === 357 &&
                command.parameters[0]?.split('/').pop() === this.getPluginName() &&
                command.parameters[1] === 'Text_Indicator'
            ) {
                text = command.parameters[3]?.text;
            }
            if (this.isUsableText(text)) this.entries.set(text, { text });
        }
    }
    enablePluginTranslation() {
        const proto = window.EventIndicators?.prototype;
        if (typeof proto?.refreshText !== 'function') return false;
        const translator = this;
        const original = proto.refreshText;
        proto.refreshText = function (...args) {
            const data = this.data();
            if (data.mode !== 1) return original.apply(this, args);
            const text = String(data.text);
            const translated = translator.resolveRuntimeTranslation(
                text,
                translator.getRuntime(),
                translator.getCacheType(),
                { requireRuntimeTranslationActive: true }
            );
            const bitmap = this._text.bitmap;
            const own = Object.getOwnPropertyDescriptor(bitmap, 'drawText');
            const draw = bitmap.drawText;
            bitmap.drawText = function (value, ...drawArgs) {
                return draw.call(this, value === text ? translated : value, ...drawArgs);
            };
            try {
                const result = original.apply(this, args);
                this._cheatMogIndicatorText = translated;
                return result;
            } finally {
                if (own) Object.defineProperty(bitmap, 'drawText', own);
                else delete bitmap.drawText;
            }
        };
        if (typeof proto.needRefreshText === 'function') {
            const needsRefresh = proto.needRefreshText;
            proto.needRefreshText = function (...args) {
                if (needsRefresh.apply(this, args)) return true;
                const data = this.data();
                if (data.mode !== 1) return false;
                const runtime = translator.getRuntime();
                const source = String(data.text);
                let text = source;
                if (translator.isRuntimeTranslationActive(runtime)) {
                    const key = runtime.getCacheKey(source, translator.getCacheType());
                    if (runtime.hasUsableCacheValue(key)) text = runtime.translationCache.get(key);
                }
                // Static labels otherwise never redraw after cache updates or
                // toggling translation. Seen tracking happens only in refreshText.
                return text !== this._cheatMogIndicatorText;
            };
        }
        this.precomputeCounts().catch((error) =>
            console.error('[MOG_EventIndicators] Label scan failed', error)
        );
        return true;
    }
}
