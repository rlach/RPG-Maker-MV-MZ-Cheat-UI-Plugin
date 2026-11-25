import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/** Sakura_EventIndicator 1.0 / 2.0 (MZ): event-note captions, command
 * overrides and transfer destination names. Translate after syntax parsing,
 * before canvas measurement; retain notes, indicator modes and map IDs.
 */
export class SakuraEventIndicatorTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'Sakura_EventIndicator';
    }
    getCacheType() {
        return 'plugin_sakura_event_indicator';
    }
    getSourcePluginNames() {
        return [];
    }
    shouldScanEventData() {
        return false;
    }
    collectIndicatorNote(note) {
        if (typeof note !== 'string') return;
        const triangle = note.match(/「(.*?)」/);
        const bubble = note.match(/（(.*?)）|\((.*?)\)/);
        const text = triangle?.[1] ?? (bubble?.[1] || bubble?.[2]);
        if (this.isUsableText(text)) this.entries.set(text, { text });
    }
    collectIndicatorCommands(list, maps) {
        for (const command of list || []) {
            const params = command.parameters || [];
            if (
                command.code === 357 &&
                params[0]?.split('/').pop() === this.getPluginName() &&
                params[1] === 'setIndicator'
            )
                this.collectIndicatorNote(parseJsonSafely(params[3], {})?.note);
            if (command.code === 201 && params[0] === 0) {
                const text = maps[params[1]]?.name;
                if (this.isUsableText(text)) this.entries.set(text, { text });
            }
        }
    }
    async collectAdditionalTexts() {
        const read = async (file) => {
            const response = await fetch('data/' + file + '.json');
            if (!response.ok) throw new Error('Cannot read indicator source: ' + file);
            return parseJsonSafely(await response.text());
        };
        const [maps, events] = await Promise.all([read('MapInfos'), read('CommonEvents')]);
        for (const event of events || []) this.collectIndicatorCommands(event?.list, maps);
        await Promise.all(
            (maps || [])
                .filter((map) => map?.id)
                .map(async (map) => {
                    const data = await read('Map' + String(map.id).padStart(3, '0'));
                    for (const event of data.events || []) {
                        this.collectIndicatorNote(event?.note);
                        for (const page of event?.pages || [])
                            this.collectIndicatorCommands(page.list, maps);
                    }
                })
        );
    }
    enablePluginTranslation() {
        const prototype = window.Sprite_Character?.prototype;
        if (typeof prototype?.createTextOnEvent !== 'function') return false;
        const translator = this;
        const create = prototype.createTextOnEvent;
        prototype.createTextOnEvent = function (text, ...args) {
            const runtime = translator.getRuntime();
            // Cached parsed captions remain available during the initial file scan.
            const cached =
                translator.isRuntimeTranslationActive(runtime) &&
                runtime.hasUsableCacheValue(runtime.getCacheKey(text, translator.getCacheType()));
            const translated = cached
                ? translator.resolveRuntimeTranslation(text, runtime)
                : translator.resolveText(text, runtime);
            return create.call(this, translated, ...args);
        };
        this.precomputeCounts().catch((error) =>
            console.error('[SakuraEventIndicatorTranslator] Source scan failed', error)
        );
        return true;
    }
}
