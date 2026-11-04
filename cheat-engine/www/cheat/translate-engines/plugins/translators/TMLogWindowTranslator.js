import { MNKRTMLogWindowMZTranslator } from './MNKRTMLogWindowMZTranslator.js';
import { isKnownDisplayTranslation } from '../NotificationTranslationContext.js';

/**
 * TMLogWindow, MV (unversioned RJ01103377 build).
 * Reuses event scanning from the MZ port. Mirrored messages retain standard
 * message keys; standalone addLog commands use a dedicated log catalog.
 * Text is resolved only at presentation, preserving the stored original log.
 */
export class TMLogWindowTranslator extends MNKRTMLogWindowMZTranslator {
    getPluginName() {
        return 'TMLogWindow';
    }
    getPluginAliases() {
        return [this.getPluginName()];
    }
    getPluginLabel() {
        return 'TM Log Window (MV)';
    }
    getCacheType() {
        return 'plugin_tm_log_window';
    }

    extractEntryFromCommand(command) {
        if (command?.code === 356) {
            // Native MV plugin consumes args[0], split on a literal space.
            const parts = String(command.parameters?.[0] || '').split(' ');
            if (parts[0] === 'addLog') return parts[1] || null;
        }
        return super.extractEntryFromCommand(command);
    }

    collectEntriesFromList(list, metadata, output) {
        this.messageSources ??= new Set();
        for (let i = 0; i < (list?.length || 0); i++) {
            if (list[i]?.code !== 101) continue;
            const lines = [];
            while (list[i + 1]?.code === 401) lines.push(list[++i].parameters[0]);
            if (lines.length) this.messageSources.add(lines.join('\n'));
        }
        return super.collectEntriesFromList(list, metadata, output);
    }

    buildUniquePendingItems(runtime) {
        return super
            .buildUniquePendingItems(runtime)
            .filter((item) => !this.messageSources?.has(item.value));
    }

    enablePluginTranslation() {
        const system = window.Game_System?.prototype;
        const message = window.Game_Message?.prototype;
        const base = window.Window_Base?.prototype;
        if (
            typeof system?.addLog !== 'function' ||
            typeof message?.add !== 'function' ||
            typeof base?.drawTextEx !== 'function'
        )
            return false;
        const translator = this;
        const origins = new Map();
        let mirror = null;
        let group = null;
        const addMessage = message.add;
        message.add = function (text, ...args) {
            const previous = mirror;
            if (!this._texts?.length) group = { lines: [], portrait: !!this.faceName() };
            group ??= { lines: [], portrait: !!this.faceName() };
            const index = group.lines.push(text) - 1;
            mirror = { source: text, group, index, portrait: group.portrait };
            try {
                return addMessage.call(this, text, ...args);
            } finally {
                mirror = previous;
            }
        };
        const addLog = system.addLog;
        system.addLog = function (text, ...args) {
            const result = addLog.call(this, text, ...args);
            const stored = this._actionLog?.[this._actionLog.length - 1];
            if (typeof stored === 'string') {
                origins.set(stored, mirror ? { ...mirror, mirrored: true } : { source: text });
                if (origins.size > 4096) origins.delete(origins.keys().next().value);
            }
            return result;
        };
        const draw = base.drawTextEx;
        base.drawTextEx = function (text, ...args) {
            if (!['Window_MapLog', 'Window_MenuLog'].includes(this.constructor.name))
                return draw.call(this, text, ...args);
            const runtime = translator.getRuntime();
            if (
                !translator.isRuntimeTranslationActive(runtime) ||
                isKnownDisplayTranslation(runtime, text)
            )
                return draw.call(this, text, ...args);
            // eslint-disable-next-line no-control-regex -- Restore RPG Maker ESC controls for cache lookup.
            const origin = origins.get(text) || { source: String(text).replace(/\x1b/g, '\\') };
            const source = origin.group ? origin.group.lines.join('\n') : origin.source;
            const preferred = runtime.getPreferredMessageCacheEntry(source, {
                hasPortrait: origin.portrait,
            });
            let translated = preferred?.value;
            if (translator.isUsableText(translated) && origin.group?.lines.length > 1) {
                const lines = translated.split('\n');
                translated =
                    lines.length === origin.group.lines.length
                        ? lines[origin.index]
                        : origin.index === origin.group.lines.length - 1
                          ? lines.join(' ')
                          : '';
                return draw.call(this, translated, ...args);
            }
            if (!translator.isUsableText(translated)) {
                // A mirrored cache miss belongs to the regular message pipeline.
                translated = origin.mirrored
                    ? text
                    : translator.resolveRuntimeTranslation(origin.source, runtime);
            }
            return draw.call(this, translated, ...args);
        };
        return true;
    }
}
