import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

export class HzChoiceEventTranslator extends SourceTextCatalogTranslator {
    constructor() {
        super();
        this.eventNames = new Map();
    }
    getPluginName() {
        return 'HzChoiceEvent';
    }
    getCacheType() {
        return 'plugin_hz_choice_event';
    }
    getSourcePluginNames() {
        return [];
    }
    collectCommandTexts() {}
    collectMapTexts(mapInfo, map) {
        for (const event of map.events || []) {
            if (!event || !/<hzChoice:[^>]*>/.test(event.note || '')) continue;
            if (!this.isUsableText(event.name)) continue;
            this.eventNames.set(`${mapInfo.id}:${event.id}`, event.name);
            this.entries.set(event.name, { text: event.name });
        }
    }
    resolveLabel(text, events = []) {
        if (!this.isRuntimeTranslationActive(this.getRuntime())) return text;
        const event = events.find((event) => event.event().name === text);
        if (!event) return text;
        const source = this.eventNames.get(`${event._mapId}:${event.eventId()}`);
        if (!source) return text;
        return this.resolveRuntimeTranslation(source, this.getRuntime(), this.getCacheType(), {
            requireRuntimeTranslationActive: true,
        });
    }
    enablePluginTranslation() {
        const prototype = window.Game_Interpreter?.prototype;
        const base = window.Window_Base?.prototype;
        if (typeof prototype?.updateWaitMode !== 'function' || typeof base?.drawText !== 'function')
            return false;
        const translator = this;
        const drawText = base.drawText;
        base.drawText = function (text, ...args) {
            if (this.constructor.name === 'Window_EventList')
                text = translator.resolveLabel(text, this._listevents);
            return drawText.call(this, text, ...args);
        };
        const update = prototype.updateWaitMode;
        prototype.updateWaitMode = function (...args) {
            if (this._waitMode !== 'hzChoiceEvent' || !this._hzChoceEvent)
                return update.apply(this, args);
            const context = window.SceneManager._scene._spriteset._hzChoiceScreen.bitmap.context;
            const fillText = context.fillText;
            const events = this._hzChoceEvent._choiceEvents;
            context.fillText = function (text, ...coordinates) {
                return fillText.call(this, translator.resolveLabel(text, events), ...coordinates);
            };
            try {
                return update.apply(this, args);
            } finally {
                context.fillText = fillText;
            }
        };
        this.precomputeCounts().catch((error) =>
            console.error(`[${this.getPluginName()}] Catalog scan failed`, error)
        );
        return true;
    }
}
