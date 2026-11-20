import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/** Mano_Quest MV: Quest.json and private windows exported by Mano_QuestSystem. */
export class ManoQuestTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'Mano_Quest';
    }
    getCacheType() {
        return 'plugin_mano_quest';
    }
    getSourcePluginNames() {
        return [];
    }
    shouldScanEventData() {
        return false;
    }

    async collectAdditionalTexts() {
        const response = await fetch('data/Quest.json');
        if (!response.ok) throw new Error(`Cannot read Quest.json: ${response.status}`);
        const quests = await response.json();
        const add = (text) => {
            if (this.isUsableText(text)) this.entries.set(text, { text });
        };
        for (const quest of quests || []) {
            add(quest?.name);
            add(quest?.requester);
            for (const lines of Object.values(quest?.message || {}))
                if (Array.isArray(lines)) lines.forEach(add);
        }
        const parameters = this.findPluginEntry(this.getPluginName())?.parameters || {};
        for (const field of ['commandName', 'goldText', 'goldFormat', 'unknowQuestName'])
            add(parameters[field]);
        for (const raw of parseJsonSafely(parameters.filterList, []))
            add(parseJsonSafely(raw, raw)?.name);
    }

    installMessageLayout(prototype) {
        if (
            typeof prototype?.drawAllItems !== 'function' ||
            typeof prototype?.processCharacter !== 'function'
        )
            return;
        const translator = this;
        const drawAll = prototype.drawAllItems;
        const maxItems = prototype.maxItems;
        prototype.maxItems = function () {
            return this._cheatQuestVisualRows ?? maxItems.call(this);
        };
        prototype.drawAllItems = function (...args) {
            const runtime = translator.getRuntime();
            if (!translator.isRuntimeTranslationActive(runtime)) {
                this._cheatQuestVisualRows = undefined;
                return drawAll.apply(this, args);
            }
            const lineHeight = this.lineHeight();
            const top = (this.topRow?.() || 0) * lineHeight;
            let y = -top;
            const ownProcess = Object.getOwnPropertyDescriptor(this, 'processCharacter');
            const process = this.processCharacter;
            let lastState;
            this.processCharacter = function (state, ...rest) {
                lastState = state;
                return process.call(this, state, ...rest);
            };
            try {
                for (const source of this._message || []) {
                    const text = translator.resolveText(source, runtime);
                    lastState = null;
                    // Native drawTextEx handles variables, font codes and wrapping.
                    // Each authored fragment keeps its own font reset/cache key.
                    translator.drawing++;
                    try {
                        this.drawTextEx(text, this.textPadding(), y);
                    } finally {
                        translator.drawing--;
                    }
                    y = Math.max(
                        y + lineHeight,
                        lastState ? lastState.y + lastState.height : y + lineHeight
                    );
                }
                this._cheatQuestVisualRows = Math.ceil((y + top) / lineHeight);
            } finally {
                if (ownProcess) Object.defineProperty(this, 'processCharacter', ownProcess);
                else delete this.processCharacter;
            }
        };
        const setMessage = prototype.setMassage;
        if (typeof setMessage === 'function')
            prototype.setMassage = function (...args) {
                const result = setMessage.apply(this, args);
                this._cheatQuestVisualRows = undefined;
                this.resetScroll?.();
                return result;
            };
        const update = prototype.update;
        prototype.update = function (...args) {
            const result = update?.apply(this, args);
            // The plugin disables update() on info windows. Allow scrolling a
            // long description under the pointer without stealing list focus.
            if (this.visible && this.isOpen?.() && this.isTouchedInsideFrame?.()) {
                if (window.TouchInput?.wheelY >= 20) this.scrollDown?.();
                if (window.TouchInput?.wheelY <= -20) this.scrollUp?.();
            }
            return result;
        };
    }

    enablePluginTranslation() {
        // Top-level const is not a window property in MV.
        const api =
            typeof Mano_QuestSystem !== 'undefined' ? Mano_QuestSystem : window.Mano_QuestSystem;
        if (!api) return false;
        for (const [name, Class] of Object.entries(api)) {
            if (!/^(?:Window|Widnow)_/.test(name) || !Class?.prototype) continue;
            for (const method of ['drawText', 'drawTextEx', 'textWidth'])
                if (typeof Class.prototype[method] === 'function')
                    this.hookDrawing(Class.prototype, method);
        }
        this.installMessageLayout(api.Widnow_QuestMessage?.prototype);
        this.precomputeCounts().catch((error) =>
            console.error('[ManoQuestTranslator] Catalog scan failed', error)
        );
        return true;
    }
}
