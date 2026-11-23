import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { DTextPictureTranslator } from './DTextPictureTranslator.js';
import { collectScriptVariableAssignments } from '../ScriptVariableAssignments.js';

// A literal newline is distinct from actor references and YEP name-box tags.
const normalizeDisplayNewlines = (text) => text.replace(/\\n(?!\[|<|[A-Za-z0-9_])/g, '\n');

/**
 * Event-authored UI for TMSimpleWindow v1.2.0, DTextPicture, and
 * ResidentWindow games with variable-driven messages and choices (MV).
 * Follow variables referenced by display commands back to Control Variables
 * expressions. Read JavaScript syntax only; never evaluate or change variables.
 * Resolve expanded text in display windows before layout. ESC/control codes
 * and numeric values survive; variable state remains unchanged.
 */
export class EventUiTextTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'EventUiText';
    }
    getPluginAliases() {
        return [
            'TMSimpleWindow',
            'DTextPicture',
            'ResidentWindow',
            'SceneCustomMenu',
            'EnemyAnalysisSkill',
        ];
    }
    getPluginLabel() {
        return 'Event UI text (reports and business)';
    }
    getCacheType() {
        return 'plugin_event_ui_text';
    }
    getSourcePluginNames() {
        return [];
    }

    isUsableText(value) {
        if (!super.isUsableText(value)) return false;
        // Counts, amounts and measurements are game data, including individual
        // glyphs emitted by DTextPicture's renderer. Ignore stale numeric caches.
        // eslint-disable-next-line no-control-regex -- RPG Maker ESC-prefixed controls.
        const visible = value.replace(/(?:\\|\x1b)[A-Za-z]+\[[^\]]*\]/g, '').trim();
        return !!visible && !/^[\d\s.,+\-/:％%]+(?:ml|l|kg|g|cm|m)?$/i.test(visible);
    }

    collectMapTexts() {
        // Map names belong to map_name. The live database can already contain
        // translated names; copying it into this catalog creates reverse translations.
    }

    resolveText(text, runtime, depth = 0, allowFragments = true) {
        if (this.isUsableText(text) && this.isRuntimeTranslationActive(runtime)) {
            for (const type of ['map_name', 'skill_description']) {
                const key = runtime.getCacheKey(text, type);
                if (runtime.hasUsableCacheValue(key)) {
                    runtime.trackCacheKeyUsage(key, { harvestMissing: false });
                    return runtime.translationCache.get(key);
                }
            }
        }
        return super.resolveText(text, runtime, depth, allowFragments);
    }

    collectCommandTexts(list = []) {
        this.assignments ??= [];
        this.assignments.push(...collectScriptVariableAssignments(list));
        this.displayVariables ??= new Set();
        this.dtextParser ??= new DTextPictureTranslator();
        for (const command of list || []) {
            if (command.code === 122) this.assignments.push(command.parameters);
            if (command.code === 401 || command.code === 405)
                this.collectVariableReferences(String(command.parameters?.[0] || ''));
            if (command.code === 102)
                for (const choice of command.parameters?.[0] || [])
                    this.collectVariableReferences(String(choice));
            if (command.code !== 356) continue;
            const line = command.parameters[0];
            const [name, ...args] = line.split(' ');
            const text = ['showWindow', 'showNoFrameWindow', 'showNoBackWindow'].includes(name)
                ? args[5]
                : this.dtextParser.parseMVDTextCommandLine(line)?.text;
            if (!super.isUsableText(text)) continue;
            this.collectVariableReferences(text);
            if (!this.isUsableText(text)) continue;
            const normalized = normalizeDisplayNewlines(text);
            this.entries.set(normalized, { text: normalized });
        }
    }

    collectVariableReferences(text) {
        for (const match of text.matchAll(
            /\\V\[(\d+)(?:,\s*\d+)?\]|\$gameVariables\.value\(\s*(\d+)\s*\)/gi
        ))
            this.displayVariables.add(Number(match[1] || match[2]));
    }

    async collectAdditionalTexts() {
        const pending = new Set(this.assignments);
        let found;
        do {
            found = false;
            for (const assignment of pending) {
                const [start, end, , operand, value] = assignment;
                if (![...this.displayVariables].some((id) => id >= start && id <= end)) continue;
                pending.delete(assignment);
                found = true;
                if (operand === 1) this.displayVariables.add(Number(value));
                if (operand !== 4 || typeof value !== 'string') continue;
                this.collectVariableReferences(value);
                const catalog = this.extractCatalog(value);
                for (const entry of catalog.entries) {
                    entry.text = normalizeDisplayNewlines(entry.text);
                    if (entry.parts)
                        entry.parts = entry.parts.map((part) => normalizeDisplayNewlines(part));
                    this.entries.set(entry.text, entry);
                    this.collectVariableReferences(entry.text);
                    if (!entry.parts)
                        for (const line of entry.text.split('\n'))
                            if (this.isUsableText(line)) this.entries.set(line, { text: line });
                }
            }
        } while (found);
        for (const text of this.entries.keys()) {
            if (!this.isUsableText(text)) this.entries.delete(text);
        }
    }

    enablePluginTranslation() {
        const base = window.Window_Base?.prototype;
        if (typeof base?.convertEscapeCharacters !== 'function') return false;
        if (!super.enablePluginTranslation()) return false;
        const picture = window.Game_Picture?.prototype;
        if (typeof picture?.getDText === 'function') {
            const getDText = picture.getDText;
            const translator = this;
            picture.getDText = function (...args) {
                let text = getDText.apply(this, args);
                const runtime = translator.getRuntime();
                if (typeof text !== 'string' || !translator.isRuntimeTranslationActive(runtime))
                    return text;
                const source = this.dTextInfo?.__cheatDTextSource ?? this.dTextInfo?.value ?? '';
                for (const match of source.matchAll(/\\V\[(\d+)(?:,\s*\d+)?\]/gi)) {
                    const value = window.$gameVariables.value(Number(match[1]));
                    if (typeof value !== 'string' || !value) continue;
                    const translated = translator.resolveText(value, runtime);
                    if (translated === value) continue;
                    const convert = (value) =>
                        window.PluginManagerEx?.convertEscapeCharacters?.(value) ?? value;
                    text = text.split(convert(value)).join(convert(translated));
                }
                return text;
            };
        }
        const original = base.convertEscapeCharacters;
        const translator = this;
        base.convertEscapeCharacters = function (text) {
            const display =
                this.constructor.name === 'Window_Simple' ||
                this.constructor.name === 'Window_ExInfoWindow' ||
                this === window.SceneManager?._hiddenWindow ||
                (typeof window.Window_Message === 'function' &&
                    this instanceof window.Window_Message) ||
                (typeof window.Window_ChoiceList === 'function' &&
                    this instanceof window.Window_ChoiceList);
            const runtime = translator.getRuntime();
            if (!display || !translator.isRuntimeTranslationActive(runtime))
                return original.apply(this, arguments);
            // Resolve string-valued display variables before escape expansion.
            // Never change their game-state values or the global value() method.
            const template = translator.resolveText(normalizeDisplayNewlines(text), runtime);
            const prepared = template.replace(/\\V\[(\d+)\]/gi, (token, id) => {
                const value = window.$gameVariables.value(Number(id));
                if (typeof value !== 'string') return token;
                const translated = translator.resolveText(normalizeDisplayNewlines(value), runtime);
                return translated === value ? token : translated;
            });
            const converted = original.call(this, prepared);
            const source = converted.split('\x1b').join('\\');
            const translated = translator.resolveText(source, runtime);
            return translated === source ? converted : translated.replace(/\\/g, '\x1b');
        };
        return true;
    }
}
