import { PLUGIN_TRANSLATOR_REGISTRY } from './PluginTranslatorRegistry.js';

function isMessageTextType(type) {
    return type === 'message' || type === 'message_portrait';
}

export function normalizeMessageEntryForPlugins(panel, entry) {
    if (!entry || !isMessageTextType(entry.type)) {
        return entry;
    }

    const normalized = PLUGIN_TRANSLATOR_REGISTRY.resolveMessageCacheSourceText({
        runtime: panel,
        text: entry.value,
        hasPortrait: entry.type === 'message_portrait',
        mode: 'collection',
        command: entry.command || null,
        cmdIndex: entry.cmdIndex,
    });

    if (typeof normalized !== 'string' || !normalized.trim() || normalized === entry.value) {
        return entry;
    }

    return { ...entry, value: normalized };
}
