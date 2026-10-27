import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';
import { TAG_TYPE } from '../../ai-engine/constants.js';
import { rememberDisplayTranslation } from '../NotificationTranslationContext.js';

/** RJ352933 v1.46 + DLC 2.02 (MZ): gab commands, state comments and log templates. */
export class LicoUiTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'Licotsuka_fix';
    }
    getPluginLabel() {
        return 'Riko custom UI / status / dungeon floors';
    }
    getCacheType() {
        return 'plugin_lico_ui';
    }
    resolveText(text, runtime, ...args) {
        const source = typeof text === 'string' ? text.replaceAll('\x1b', '\\') : text;
        const result = super.resolveText(source, runtime, ...args);
        if (result !== source) rememberDisplayTranslation(runtime, result);
        return result === source ? text : result;
    }
    getSourcePluginNames() {
        return [
            'Licotsuka_fix',
            'LicoDynamicMessage',
            'MNKR_TMLogWindowMZ',
            'SoR_GabWindow_MZ_Right2',
            'SoR_GabWindow_MZ_Left2',
        ];
    }
    collectCommandTexts(list) {
        super.collectCommandTexts(list);
        for (const command of list || []) {
            if (command.code !== 357) continue;
            const [plugin, method, , args] = command.parameters;
            if (
                /^SoR_GabWindow_MZ_(?:Right|Left)2$/.test(plugin) &&
                method === 'PushGab' &&
                this.isUsableText(args?.arg1)
            )
                this.entries.set(args.arg1, { text: args.arg1 });
        }
    }
    async collectAdditionalTexts() {
        const systemResponse = await fetch('data/System.json');
        if (!systemResponse.ok) throw new Error('Cannot read Riko system text');
        const system = parseJsonSafely(await systemResponse.text(), {});
        for (const value of Object.values(system.terms?.messages || {})) {
            if (typeof value !== 'string' || !/%\d/.test(value)) continue;
            const parts = value.split(/%\d+/);
            const text = parts
                .map((part, index) => part + (index < parts.length - 1 ? `\\COT[${index}]` : ''))
                .join('');
            this.entries.set(text, { text, parts });
        }
        const dictionary = window.$externMessage?._map || window.$externMessage?.map || {};
        for (const values of Object.values(dictionary)) {
            for (const value of Array.isArray(values) ? values : [values]) {
                if (typeof value !== 'string') continue;
                for (const match of value.matchAll(/:script(?:\[[^\]]*\])?\s*\n([\s\S]*?):end/g)) {
                    try {
                        const catalog = this.extractCatalog(match[1].replaceAll('""', '"'));
                        for (const entry of catalog.entries) this.entries.set(entry.text, entry);
                    } catch (error) {
                        console.warn(
                            '[LicoUiTranslator] Skipping invalid CSV script',
                            error.message
                        );
                    }
                }
            }
        }
        const response = await fetch('data/States.json');
        if (!response.ok) throw new Error('Cannot read Riko states');
        for (const state of parseJsonSafely(await response.text(), [])) {
            const comment = /<comment:([\s\S]*?)>/.exec(state?.note || '')?.[1];
            if (comment) this.entries.set(comment, { text: comment });
        }
        for (const prefix of ['', '　\n']) {
            const text = prefix + '\\ac異界の迷宮 \\LICOFLOOR[0]F';
            this.entries.set(text, { text });
        }
    }
    prepareDynamicValueTag(runtime) {
        super.prepareDynamicValueTag(runtime);
        if (this.floorTagEngine === runtime.engine) return;
        this.registerPluginCustomTags([
            {
                tagSymbol: 'LICOFLOOR',
                type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
                requiredConsistency: true,
                description: 'Current dungeon floor display slot; preserve unchanged.',
            },
        ]);
        this.floorTagEngine = runtime.engine;
    }
    enablePluginTranslation() {
        if (
            typeof window.Game_System?.prototype.pushGabRightMessage !== 'function' ||
            typeof window.Window_Base?.prototype.convertEscapeCharacters !== 'function'
        )
            return false;
        if (!super.enablePluginTranslation()) return false;
        const translator = this;
        for (const method of ['pushGabRightMessage', 'pushGabLeftMessage', 'addLog']) {
            const original = window.Game_System.prototype[method];
            if (typeof original !== 'function') continue;
            window.Game_System.prototype[method] = function (text, ...args) {
                const runtime = translator.getRuntime();
                if (typeof text === 'string' && translator.isRuntimeTranslationActive(runtime))
                    text = text
                        .split('|')
                        .map((part) => translator.resolveText(part, runtime))
                        .join('|');
                const result = original.call(this, text, ...args);
                if (
                    method === 'addLog' &&
                    Array.isArray(this._actionLog) &&
                    this._actionLog.length
                ) {
                    const index = this._actionLog.length - 1;
                    this._actionLog[index] = translator.resolveText(
                        this._actionLog[index],
                        runtime
                    );
                }
                return result;
            };
        }
        const add = window.Game_Message.prototype.add;
        window.Game_Message.prototype.add = function (text) {
            if (
                typeof text === 'string' &&
                translator.isRuntimeTranslationActive(translator.getRuntime())
            ) {
                const match = /^([\s\S]*?\\ac異界の迷宮 )(\d+)(F\s*)$/.exec(text);
                if (match) {
                    translator.floor = match[2];
                    text = match[1] + '\\LICOFLOOR[0]' + match[3];
                }
            }
            return add.call(this, text);
        };
        const convert = window.Window_Base.prototype.convertEscapeCharacters;
        window.Window_Base.prototype.convertEscapeCharacters = function (text) {
            return convert
                .call(this, text)
                .split('\x1bLICOFLOOR[0]')
                .join(translator.floor || '0');
        };
        return true;
    }
}
