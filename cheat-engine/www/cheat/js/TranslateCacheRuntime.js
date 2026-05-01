import {
    getRootWindow,
    notifyRootWindowEvent,
    setRootWindowStateValue,
    subscribeRootWindowEvent,
} from './RootWindowState.js';

const RUNTIME_EVENT_NAME = 'cheat:translate-cache-runtime-updated';

export function isMapLike(value) {
    return (
        !!value &&
        typeof value.get === 'function' &&
        typeof value.set === 'function' &&
        typeof value.has === 'function' &&
        typeof value.delete === 'function' &&
        typeof value.clear === 'function' &&
        typeof value.entries === 'function'
    );
}

function ensureMap(value) {
    if (isMapLike(value)) {
        return value;
    }

    return new Map();
}

export function ensureTranslateCacheRuntime(cacheMap = null) {
    const root = getRootWindow();
    const existingRootCache = root['__TranslateOnTheFlyCache'];
    const cacheSource = isMapLike(existingRootCache) ? existingRootCache : cacheMap;
    const cache = ensureMap(cacheSource);
    setRootWindowStateValue('__TranslateOnTheFlyCache', cache);

    const lastSeenByCacheKey = ensureMap(root['__TranslateOnTheFlyLastSeenByCacheKey']);
    setRootWindowStateValue('__TranslateOnTheFlyLastSeenByCacheKey', lastSeenByCacheKey);

    if (!Number.isFinite(root['__TranslateOnTheFlyCacheVersion'])) {
        setRootWindowStateValue('__TranslateOnTheFlyCacheVersion', 0);
    }

    return {
        cache,
        lastSeenByCacheKey,
        version: root['__TranslateOnTheFlyCacheVersion'],
    };
}

export function getTranslateCacheLastSeenMap() {
    const runtime = ensureTranslateCacheRuntime();
    return runtime.lastSeenByCacheKey;
}

export function getTranslateCacheRuntimeEventName() {
    return RUNTIME_EVENT_NAME;
}

export function notifyTranslateCacheRuntimeChanged(reason = 'unknown', key = null) {
    const runtime = ensureTranslateCacheRuntime();
    const version = Number.isFinite(runtime.version) ? runtime.version + 1 : 1;
    setRootWindowStateValue('__TranslateOnTheFlyCacheVersion', version);

    const detail = {
        reason,
        key,
        version,
        timestamp: Date.now(),
    };

    notifyRootWindowEvent(RUNTIME_EVENT_NAME, detail);

    const dispatchToWindow = (targetWindow) => {
        if (!targetWindow || typeof targetWindow.dispatchEvent !== 'function') {
            return;
        }

        try {
            targetWindow.dispatchEvent(new CustomEvent(RUNTIME_EVENT_NAME, { detail }));
        } catch (error) {
            // CustomEvent may fail on unusual environments; ignore safely.
        }
    };

    const root = getRootWindow();
    dispatchToWindow(root);
    if (root !== window) {
        dispatchToWindow(window);
    }

    return detail;
}

export function onTranslateCacheRuntimeChanged(handler) {
    if (typeof handler !== 'function') {
        return () => {};
    }

    const wrapped = (detail) => {
        handler(detail);
    };

    ensureTranslateCacheRuntime();
    const unsubscribeRoot = subscribeRootWindowEvent(RUNTIME_EVENT_NAME, wrapped);

    return () => {
        unsubscribeRoot();
    };
}

export function parseCacheKeyForLangPair(cacheKey, sourceLang, targetLang) {
    if (typeof cacheKey !== 'string') {
        return null;
    }

    const firstColonIndex = cacheKey.indexOf(':');
    if (firstColonIndex <= 0) {
        return null;
    }

    const type = cacheKey.slice(0, firstColonIndex);
    const valuePart = cacheKey.slice(firstColonIndex + 1);
    const pairPrefix = `${sourceLang}-${targetLang}-`;

    if (!valuePart.startsWith(pairPrefix)) {
        return null;
    }

    return {
        key: cacheKey,
        type,
        original: valuePart.slice(pairPrefix.length),
    };
}
