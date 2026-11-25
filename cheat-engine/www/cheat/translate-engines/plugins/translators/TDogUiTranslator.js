/* eslint-disable no-control-regex -- Native renderers can pass RPG Maker ESC-prefixed variables. */
import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { parseJsonSafely, walkNestedJsonLike } from './TranslatorHelpers.js';
import { readJavaScriptLiteralData } from './JavaScriptTextCatalog.js';
import { TAG_TYPE } from '../../ai-engine/constants.js';

/** TDog author suite (MZ, RJ01717363): immutable menu/event display sources.
 * Translate window output and string-valued display references, never calendar
 * state, relationship values, save metadata, callback arguments or picture IDs.
 */
export class TDogUiTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'TDog_LatestChatMemory';
    }
    getPluginAliases() {
        return [
            'TDog_LatestChatMemory',
            'Tdog_EventLogUpdater',
            'TDog_UIanime',
            'Tdog_DateCalculator',
            'TDog_DateTransition',
        ];
    }
    getSourcePluginNames() {
        return this.getPluginAliases();
    }
    getCacheType() {
        return 'plugin_tdog_ui';
    }
    shouldScanEventData() {
        return false;
    }
    collectScript(script, cacheType = this.getCacheType()) {
        for (const entry of this.extractCatalog(script).entries) {
            const normalize = (text) => text.replace(/\\\\/g, '\\');
            this.entries.set(normalize(entry.text), {
                ...entry,
                text: normalize(entry.text),
                parts: entry.parts?.map(normalize),
                cacheType,
            });
        }
    }
    collectEventList(list) {
        for (let index = 0; index < list.length; index++) {
            const command = list[index];
            const params = command.parameters || [];
            if (command.code === 355) {
                let script = String(params[0]);
                while (list[index + 1]?.code === 655) script += '\n' + list[++index].parameters[0];
                this.collectScript(script);
            }
            if (command.code === 122 && params[3] === 4 && typeof params[4] === 'string')
                this.collectScript(params[4]);
            if (
                command.code === 357 &&
                this.getPluginAliases().includes(params[0]?.split('/').pop())
            ) {
                const args = parseJsonSafely(params[3], {});
                if (this.isUsableText(args.recallText))
                    this.entries.set(args.recallText, {
                        text: args.recallText,
                        cacheType: 'message',
                    });
            }
        }
    }
    async collectAdditionalTexts() {
        const manifest = await fetch('js/plugins.js');
        if (!manifest.ok) throw new Error('Cannot read TDog source manifest');
        const { bindings } = readJavaScriptLiteralData(await manifest.text(), ['$plugins']);
        for (const plugin of bindings.$plugins || []) {
            if (
                !plugin.status ||
                ![
                    'SceneCustomMenu',
                    'NUUN_SaveScreen',
                    'NUUN_RadarChartBase',
                    'TDog_LatestChatMemory',
                ].includes(plugin.name.split('/').pop())
            )
                continue;
            this.collectParameterTexts(plugin.parameters);
            walkNestedJsonLike(plugin.parameters, (value, { path }) => {
                const field = path.at(-1) || '';
                if (field === 'defaultRecallText' && this.isUsableText(value)) {
                    this.entries.set(value, { text: value, cacheType: 'message' });
                    return;
                }
                if (!/(?:Script|Eval)$/.test(field)) return;
                const parsed = parseJsonSafely(value, value);
                if (parsed !== value) return; // The walker visits decoded JSON next.
                const script = Array.isArray(value) ? value.join('\n') : value;
                if (typeof script === 'string' && script.trim()) this.collectScript(script);
            });
        }
        const read = async (file) => {
            const response = await fetch('data/' + file + '.json');
            if (!response.ok) throw new Error('Cannot read TDog source: ' + file);
            return response.json();
        };
        const [events, maps, actors] = await Promise.all([
            read('CommonEvents'),
            read('MapInfos'),
            read('Actors'),
        ]);
        for (const actor of actors)
            if (actor?.name)
                this.entries.set(actor.name, { text: actor.name, cacheType: 'actor_name' });
        for (const event of events) if (event?.list) this.collectEventList(event.list);
        await Promise.all(
            maps
                .filter((map) => map?.id)
                .map(async (map) => {
                    const source = await read('Map' + String(map.id).padStart(3, '0'));
                    for (const event of source.events || [])
                        for (const page of event?.pages || []) this.collectEventList(page.list);
                })
        );
    }
    enablePluginTranslation() {
        const base = window.Window_Base?.prototype;
        if (typeof base?.convertEscapeCharacters !== 'function') return false;
        if (!super.enablePluginTranslation()) return false;
        this.registerPluginCustomTags(
            ['BI', 'BBI'].map((tagSymbol) => ({
                description: 'Scaled icon; preserve icon identifier',
                tagSymbol,
                type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
                requiredConsistency: true,
            }))
        );
        const translator = this;
        // MPP_MessageEX captures the original base converter in its own message
        // method. Patching the base alone cannot reach that callback route.
        for (const prototype of [base, window.Window_Message?.prototype]) {
            if (
                !prototype ||
                (prototype !== base &&
                    !Object.prototype.hasOwnProperty.call(prototype, 'convertEscapeCharacters'))
            )
                continue;
            const convert = prototype.convertEscapeCharacters;
            prototype.convertEscapeCharacters = function (text, ...args) {
                const runtime = translator.getRuntime();
                if (!translator.isRuntimeTranslationActive(runtime))
                    return convert.call(this, text, ...args);
                const prepared = translator
                    .resolveText(text, runtime)
                    .replace(/(?:\\|\x1b)V\[(\d+)\]/gi, (token, id) => {
                        const source = window.$gameVariables.value(Number(id));
                        if (typeof source !== 'string') return token;
                        const translated = translator.resolveText(source, runtime);
                        return translated === source ? token : translated;
                    });
                const converted = convert.call(this, prepared, ...args);
                return translator.resolveEscapeConvertedText(converted, runtime);
            };
        }
        return true;
    }
}
