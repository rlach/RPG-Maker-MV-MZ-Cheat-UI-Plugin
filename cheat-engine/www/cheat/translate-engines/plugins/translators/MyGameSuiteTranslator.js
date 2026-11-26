import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';
import {
    readOriginalUiPlugins,
    collectMyDisplayParameters,
    collectMyTypedSource,
} from './MyGameTextCatalog.js';

/** My_* author suite (MZ): Core 1.1, Puzzle 2.0, QTE 1.0, ScenarioEngine 1.3.1,
 * QuestEngine 1.7, StealthChase and ForestLife. Scan immutable plugin/parameter
 * sources and owned event commands/labels. Translate before guide wrapping and
 * Bitmap/canvas drawing, never mutating rules, IDs, rewards or saved state.
 */
export class MyGameSuiteTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'My_Core';
    }
    getPluginAliases() {
        return [
            'My_Core',
            'My_Puzzle',
            'My_QTE',
            'My_ScenarioEngine',
            'My_QuestEngine',
            'My_StealthChase',
            'My_MapStageComposite',
            'My_ShopOnce',
            'My_ForestLife',
            'My_MapConversation',
        ];
    }
    getCacheType() {
        return 'plugin_my_game_suite';
    }
    shouldScanEventData() {
        return false;
    }
    isDisplayFragment() {
        return false;
    }
    collectParameterTexts() {
        /* Runtime parameters may already contain translations. */
    }
    collectSourceCatalog(source) {
        const catalog = super.collectSourceCatalog(source);
        const typed = collectMyTypedSource(source, this.extractCatalog);
        this.typedEntries ??= new Map();
        for (const [text, entry] of typed) this.typedEntries.set(text, entry);
        return { entries: catalog.entries.map((entry) => typed.get(entry.text) || entry) };
    }
    collectOwnedCommands(list = []) {
        for (const command of list || [])
            if (
                command.code === 357 &&
                this.getPluginAliases().includes(command.parameters[0]?.split('/').pop())
            )
                collectMyDisplayParameters(command.parameters[3], this.entries);
    }
    collectForestEvent(event) {
        const label = event?.note?.match(/<ForestLabel:([^>]+)>/)?.[1];
        if (label) {
            const lines = label.split('：');
            lines.forEach((text, index) => {
                this.entries.set(text, {
                    text,
                    ...(index === 0 && lines.length > 1 ? { cacheType: 'actor_name' } : {}),
                });
            });
        }
        for (const page of event?.pages || []) this.collectOwnedCommands(page.list);
    }
    async collectAdditionalTexts() {
        for (const plugin of await readOriginalUiPlugins(this.getPluginAliases()))
            collectMyDisplayParameters(plugin.parameters, this.entries);
        const read = async (file) => {
            const response = await fetch('data/' + file + '.json');
            if (!response.ok) throw new Error('Cannot read custom UI event source: ' + file);
            return parseJsonSafely(await response.text());
        };
        const [maps, common] = await Promise.all([read('MapInfos'), read('CommonEvents')]);
        for (const event of common || []) this.collectOwnedCommands(event?.list);
        await Promise.all(
            (maps || [])
                .filter((map) => map?.id)
                .map(async (map) => {
                    const data = await read('Map' + String(map.id).padStart(3, '0'));
                    for (const event of data.events || []) this.collectForestEvent(event);
                })
        );
        for (const [text, entry] of this.typedEntries || []) this.entries.set(text, entry);
    }
    getPendingSourceEntries() {
        return super
            .getPendingSourceEntries()
            .map((entry) => (entry.type === 'actor_name' ? { ...entry, type: 'speaker' } : entry));
    }
    getPendingItemCacheTypes(item) {
        return [item.type === 'speaker' ? 'actor_name' : item.type];
    }
    resolveGuideText(text) {
        const runtime = this.getRuntime();
        const whole = this.resolveText(text, runtime);
        if (typeof text !== 'string') return whole;
        // The guide appends independently authored blocks at runtime. Translate
        // their original lines before native wrapping can split source keys.
        // A whole-description template may leave an appended line in a capture.
        // Resolve only lines proven present in the original input, never harvest
        // the returned translation as another source.
        const originalLines = new Map(
            text.split('\n').map((line) => [line, this.resolveText(line, runtime)])
        );
        return whole
            .split('\n')
            .map((line) => originalLines.get(line) ?? line)
            .join('\n');
    }
    enablePluginTranslation() {
        const scene = window.Scene_Base?.prototype;
        const canvas = window.CanvasRenderingContext2D?.prototype;
        if (
            typeof scene?.addWindow !== 'function' ||
            typeof canvas?.fillText !== 'function' ||
            typeof canvas?.measureText !== 'function'
        )
            return false;
        if (!super.enablePluginTranslation()) return false;
        this.hookDrawing(canvas, 'fillText');
        this.hookDrawing(canvas, 'measureText');
        const translator = this;
        const addWindow = scene.addWindow;
        const wrapped = new WeakSet();
        scene.addWindow = function (target) {
            if (
                target.constructor.name === 'ForestGuidePanel' &&
                typeof target.wrap === 'function' &&
                !wrapped.has(target)
            ) {
                const wrap = target.wrap;
                target.wrap = function (text, ...args) {
                    return wrap.call(this, translator.resolveGuideText(text), ...args);
                };
                wrapped.add(target);
            }
            return addWindow.apply(this, arguments);
        };
        this.scanPromise
            .then(() => {
                for (const sprite of window.SceneManager?._scene?._spriteset?._characterSprites ||
                    []) {
                    if (!sprite._forestLabel) continue;
                    sprite.removeChild(sprite._forestLabel);
                    sprite._forestLabel.destroy();
                    sprite._forestLabel = null;
                }
            })
            .catch((error) => console.error('[MyGameSuite] Cannot refresh source labels', error));
        return true;
    }
}
