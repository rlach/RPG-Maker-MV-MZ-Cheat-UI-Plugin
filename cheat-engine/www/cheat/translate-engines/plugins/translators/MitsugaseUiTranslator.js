import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { walkNestedJsonLike, parseJsonSafely } from './TranslatorHelpers.js';
import { parse } from '../../../libs/acorn.js';

/** RJ01608291 custom plugin family: menu, travel, phone and part-time minigames. */
export class MitsugaseUiTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'MitsugaseUI';
    }
    getPluginLabel() {
        return 'Mitsugase menus, phone and minigames';
    }
    getPluginAliases() {
        return [
            'FriendshipSystem',
            'FastTravel',
            'SmartphoneUI',
            'ExtendedChoices',
            'MiniGame_Survey',
            'MiniGame_Debug',
            'MiniGame_DataEntry',
        ];
    }
    getCacheType() {
        return 'plugin_mitsugase_ui';
    }
    collectMapTexts() {}
    collectSourceCatalog(source) {
        const catalog = super.collectSourceCatalog(source);
        // The phone's dT helper takes its text as argument 2. In particular,
        // _drawImageView contains a text Back button alongside raster content.
        const visit = (node) => {
            if (!node || typeof node !== 'object') return;
            if (node.type === 'CallExpression' && node.callee?.name === 'dT' && node.arguments[1]) {
                const argument = node.arguments[1];
                catalog.entries.push(
                    ...this.extractCatalog(
                        `target.drawText(${source.slice(argument.start, argument.end)});`
                    ).entries
                );
            }
            for (const child of Object.values(node)) {
                if (Array.isArray(child)) child.forEach(visit);
                else if (child && typeof child === 'object') visit(child);
            }
        };
        visit(parse(source, { ecmaVersion: 'latest' }));
        return catalog;
    }
    collectParameterTexts(parameters) {
        walkNestedJsonLike(parameters, (value, { path }) => {
            const field = [...path].reverse().find((part) => !/^\d+$/.test(part)) || '';
            if (
                typeof value !== 'string' ||
                !value.trim() ||
                parseJsonSafely(value, value) !== value
            )
                return;
            if (
                !/^(?:Text\w+|Name|MenuCommandName|commandName|disabledText|locationName|question|choice[1-4]|reply[1-4]|label[1-4]|promptText|declineLabel|declineText|declineReply|text|title|label|description|iconChar|SnsName|PrivateAccountName)$/i.test(
                    field
                )
            )
                return;
            this.entries.set(value, { text: value });
        });
    }
    resolveText(text, runtime, depth = 0, allowFragments = true) {
        if (this.isUsableText(text) && this.isRuntimeTranslationActive(runtime)) {
            const key = runtime.getCacheKey(text, 'actor_name');
            if (runtime.hasUsableCacheValue(key)) {
                runtime.trackCacheKeyUsage(key, { harvestMissing: false });
                return runtime.translationCache.get(key);
            }
        }
        return super.resolveText(text, runtime, depth, allowFragments);
    }
    installPhoneCanvas() {
        const prototype = window.Window_PhoneDisplay?.prototype;
        if (typeof prototype?._doRefresh !== 'function' || this.phonePrototype === prototype)
            return;
        this.phonePrototype = prototype;
        const original = prototype._doRefresh;
        const translator = this;
        const contexts = new WeakSet();
        prototype._doRefresh = function (...args) {
            const context = this.contents?.context;
            if (context && !contexts.has(context)) {
                contexts.add(context);
                for (const method of ['fillText', 'measureText']) {
                    if (typeof context[method] !== 'function') continue;
                    const native = context[method];
                    context[method] = function (text, ...rest) {
                        return native.call(
                            this,
                            translator.resolveText(text, translator.getRuntime(), 0, false),
                            ...rest
                        );
                    };
                }
            }
            return translator.withPhoneDisplayText(() => original.apply(this, args));
        };
    }
    withPhoneDisplayText(draw) {
        const runtime = this.getRuntime();
        if (!this.isRuntimeTranslationActive(runtime)) return draw();
        // This plugin exposes its lexical phone state through the save snapshot.
        // Translate complete messages before native wrapping/splitting, then
        // restore every field synchronously, including when rendering throws.
        const state = window.DataManager?.makeSaveContents?.()?._sp;
        if (!state) return draw();
        const changes = [];
        const visited = new WeakSet();
        const fields = new Set([
            'name',
            'text',
            'title',
            'c1',
            'c2',
            'r1',
            'r2',
            'prompt',
            'l1',
            'l2',
            'dl',
            'dt',
            'dr',
            'dateLabel',
        ]);
        const visit = (object) => {
            if (!object || typeof object !== 'object' || visited.has(object)) return;
            visited.add(object);
            for (const [key, value] of Object.entries(object)) {
                if (typeof value === 'string' && fields.has(key)) {
                    const translated = this.resolveText(value, runtime, 0, false);
                    if (translated !== value) {
                        changes.push([object, key, value]);
                        object[key] = translated;
                    }
                } else if (value && typeof value === 'object') visit(value);
            }
        };
        try {
            for (const key of ['ct', 'su', 'sn', 'pr']) visit(state[key]);
            return draw();
        } finally {
            for (const [object, key, value] of changes.reverse()) object[key] = value;
        }
    }
    enablePluginTranslation() {
        if (!super.enablePluginTranslation()) return false;
        this.installPhoneCanvas();
        if (typeof window.Window_Base?.prototype.textWidth === 'function')
            this.hookDrawing(window.Window_Base.prototype, 'textWidth');
        return true;
    }
}
