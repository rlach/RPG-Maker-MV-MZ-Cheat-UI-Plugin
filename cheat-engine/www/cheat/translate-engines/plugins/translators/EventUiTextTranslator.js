import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { DTextPictureTranslator } from './DTextPictureTranslator.js';

/**
 * Event-authored UI for TMSimpleWindow v1.2.0 and DTextPicture (MV).
 * Follow variables referenced by display commands back to Control Variables
 * expressions. Read JavaScript syntax only; never evaluate or change variables.
 * Resolve expanded text only in TM's private Window_Simple and DText's hidden
 * conversion window, before layout. ESC/control codes and numeric values survive.
 */
export class EventUiTextTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'EventUiText';
    }
    getPluginAliases() {
        return ['TMSimpleWindow', 'DTextPicture'];
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

    collectCommandTexts(list = []) {
        this.assignments ??= [];
        this.displayVariables ??= new Set();
        this.dtextParser ??= new DTextPictureTranslator();
        for (const command of list || []) {
            if (command.code === 122) this.assignments.push(command.parameters);
            if (command.code !== 356) continue;
            const line = command.parameters[0];
            const [name, ...args] = line.split(' ');
            const text = ['showWindow', 'showNoFrameWindow', 'showNoBackWindow'].includes(name)
                ? args[5]
                : this.dtextParser.parseMVDTextCommandLine(line)?.text;
            if (!this.isUsableText(text)) continue;
            const normalized = text.replace(/\\n/g, '\n');
            this.entries.set(normalized, { text: normalized });
            this.collectVariableReferences(text);
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
                    entry.text = entry.text.replace(/\\n/g, '\n');
                    if (entry.parts)
                        entry.parts = entry.parts.map((part) => part.replace(/\\n/g, '\n'));
                    this.entries.set(entry.text, entry);
                    this.collectVariableReferences(entry.text);
                    if (!entry.parts)
                        for (const line of entry.text.split('\n'))
                            if (this.isUsableText(line)) this.entries.set(line, { text: line });
                }
            }
        } while (found);
    }

    enablePluginTranslation() {
        const base = window.Window_Base?.prototype;
        if (typeof base?.convertEscapeCharacters !== 'function') return false;
        if (!super.enablePluginTranslation()) return false;
        const original = base.convertEscapeCharacters;
        const translator = this;
        base.convertEscapeCharacters = function (text) {
            const display =
                this.constructor.name === 'Window_Simple' ||
                this === window.SceneManager?._hiddenWindow;
            const runtime = translator.getRuntime();
            if (!display || !translator.isRuntimeTranslationActive(runtime))
                return original.apply(this, arguments);
            // Resolve string-valued display variables before escape expansion.
            // Never change their game-state values or the global value() method.
            const template = translator.resolveText(text.replace(/\\n/g, '\n'), runtime);
            const prepared = template.replace(/\\V\[(\d+)\]/gi, (token, id) => {
                const value = window.$gameVariables.value(Number(id));
                if (typeof value !== 'string') return token;
                const translated = translator.resolveText(value.replace(/\\n/g, '\n'), runtime);
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
