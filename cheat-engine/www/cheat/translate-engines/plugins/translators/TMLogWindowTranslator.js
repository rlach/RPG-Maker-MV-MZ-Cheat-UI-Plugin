import { MNKRTMLogWindowMZTranslator } from './MNKRTMLogWindowMZTranslator.js';

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
}
