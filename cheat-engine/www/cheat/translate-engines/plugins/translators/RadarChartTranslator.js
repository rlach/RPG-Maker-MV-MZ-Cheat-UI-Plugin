import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/** RadarChart (MZ). Local canvas labels; ranks and chart calculations are unchanged. */
export class RadarChartTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'RadarChart';
    }
    getCacheType() {
        return 'plugin_radar_chart';
    }
    shouldScanEventData() {
        return false;
    }
    enablePluginTranslation() {
        if (typeof window.RadarChart?.drawRadarChart !== 'function') return false;
        const original = window.RadarChart.drawRadarChart;
        const translator = this;
        window.RadarChart.drawRadarChart = function (bitmap, ...args) {
            const context = bitmap.context;
            const draw = context.fillText;
            context.fillText = function (text, ...coordinates) {
                text = translator.resolveRuntimeTranslation(
                    text,
                    translator.getRuntime(),
                    translator.getCacheType(),
                    { requireRuntimeTranslationActive: true }
                );
                return draw.call(this, text, ...coordinates);
            };
            try {
                return original.call(this, bitmap, ...args);
            } finally {
                context.fillText = draw;
            }
        };
        return true;
    }
}
