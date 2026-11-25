import { nameIsTag } from '../EventCommandTraversal.js';
import { getRootWindow } from '../RootWindowState.js';
import { PLUGIN_TRANSLATOR_REGISTRY } from '../../translate-engines/plugins/PluginTranslatorRegistry.js';

export function getTranslationNames(runtime) {
    const prefix = 'actor_name:' + runtime.sourceLang + '-' + runtime.targetLang + '-';
    const names = new Map();
    for (const [key, translation] of runtime.translationCache) {
        if (key.startsWith(prefix) && key.length > prefix.length) {
            names.set(key.slice(prefix.length), translation || '');
        }
    }

    const actors = [];
    for (const [actorId, actor] of (getRootWindow().$dataActors || []).entries()) {
        if (!actor?.name || !actorId) continue;
        const originalName = PLUGIN_TRANSLATOR_REGISTRY.resolveMessageCacheSourceText({
            runtime,
            text: actor._translateOriginal ? actor._translateOriginal.name : actor.name,
            mode: 'collection',
        });
        if (originalName) actors.push({ actorId, originalName });
    }
    return { actors, names };
}

export function findNamesInCache(cache, pattern, languagePrefix = '') {
    return new Set(countNamesInCache(cache, pattern, languagePrefix).keys());
}

export function countNamesInCache(cache, pattern, languagePrefix = '') {
    const regex = new RegExp(pattern, 'gi');
    const names = new Map();
    for (const key of cache.keys()) {
        if (typeof key !== 'string') continue;
        const colon = key.indexOf(':');
        const payload = key.slice(colon + 1);
        if (languagePrefix && !payload.startsWith(languagePrefix)) continue;
        if (languagePrefix && key.startsWith('actor_name:')) continue;
        const text = languagePrefix
            ? payload.slice(languagePrefix.length)
            : payload.replace(/^[a-z]{2}(?:-[A-Za-z]{2})?-[a-z]{2}(?:-[A-Za-z]{2})?-/, '');
        const namesInEntry = new Set();
        for (const match of text.matchAll(regex)) {
            const name = match[1]?.replace(/\\c\[\d+\]/gi, '').trim();
            if (name && !nameIsTag(name)) namesInEntry.add(name);
        }
        for (const name of namesInEntry) names.set(name, (names.get(name) || 0) + 1);
    }
    return names;
}

export function addNamesToCache(runtime, names, reason) {
    const changedKeys = [];
    for (const name of names) {
        const key = runtime.getCacheKey(name, 'actor_name');
        if (!runtime.translationCache.has(key)) {
            runtime.translationCache.set(key, '');
            changedKeys.push(key);
        }
    }
    if (changedKeys.length) {
        runtime.persistCache(changedKeys);
        runtime.notifyCacheRuntime(reason);
    }
}
