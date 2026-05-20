import { PLUGIN_TRANSLATOR_REGISTRY } from './PluginTranslatorRegistry.js';

function isMessageTextType(type) {
    return type === 'message' || type === 'message_portrait';
}

export function normalizeMessageEntryForPlugins(runtime, entry) {
    if (!entry || !isMessageTextType(entry.type)) {
        return entry;
    }

    const normalized = PLUGIN_TRANSLATOR_REGISTRY.resolveMessageCacheSourceText({
        runtime: runtime,
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

export function buildPluginTraversalOptions(runtime, context = {}) {
    return {
        ...PLUGIN_TRANSLATOR_REGISTRY.buildEventCommandTraversalOptions({
            ...context,
            runtime,
        }),
        transformEntry(entry) {
            return normalizeMessageEntryForPlugins(runtime, entry);
        },
    };
}
