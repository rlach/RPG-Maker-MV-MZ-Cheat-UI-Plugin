const RUNTIME_EVENT_NAME = 'cheat:translate-cache-runtime-updated'

function ensureMap(value) {
    if (value instanceof Map) {
        return value
    }

    return new Map()
}

export function ensureTranslateCacheRuntime(cacheMap = null) {
    const cache = ensureMap(cacheMap || window.__TranslateOnTheFlyCache)
    window.__TranslateOnTheFlyCache = cache

    const lastSeenByCacheKey = ensureMap(window.__TranslateOnTheFlyLastSeenByCacheKey)
    window.__TranslateOnTheFlyLastSeenByCacheKey = lastSeenByCacheKey

    if (!Number.isFinite(window.__TranslateOnTheFlyCacheVersion)) {
        window.__TranslateOnTheFlyCacheVersion = 0
    }

    return {
        cache,
        lastSeenByCacheKey,
        version: window.__TranslateOnTheFlyCacheVersion
    }
}

export function getTranslateCacheLastSeenMap() {
    const runtime = ensureTranslateCacheRuntime()
    return runtime.lastSeenByCacheKey
}

export function getTranslateCacheRuntimeEventName() {
    return RUNTIME_EVENT_NAME
}

export function notifyTranslateCacheRuntimeChanged(reason = 'unknown', key = null) {
    ensureTranslateCacheRuntime()
    window.__TranslateOnTheFlyCacheVersion += 1

    const detail = {
        reason,
        key,
        version: window.__TranslateOnTheFlyCacheVersion,
        timestamp: Date.now()
    }

    try {
        window.dispatchEvent(new CustomEvent(RUNTIME_EVENT_NAME, { detail }))
    } catch (error) {
        // CustomEvent may fail on unusual environments; ignore safely.
    }

    return detail
}

export function onTranslateCacheRuntimeChanged(handler) {
    if (typeof handler !== 'function') {
        return () => {}
    }

    const wrapped = (event) => {
        const detail = event && event.detail ? event.detail : {}
        handler(detail)
    }

    window.addEventListener(RUNTIME_EVENT_NAME, wrapped)

    return () => {
        window.removeEventListener(RUNTIME_EVENT_NAME, wrapped)
    }
}

export function parseCacheKeyForLangPair(cacheKey, sourceLang, targetLang) {
    if (typeof cacheKey !== 'string') {
        return null
    }

    const firstColonIndex = cacheKey.indexOf(':')
    if (firstColonIndex <= 0) {
        return null
    }

    const type = cacheKey.slice(0, firstColonIndex)
    const valuePart = cacheKey.slice(firstColonIndex + 1)
    const pairPrefix = `${sourceLang}-${targetLang}-`

    if (!valuePart.startsWith(pairPrefix)) {
        return null
    }

    return {
        key: cacheKey,
        type,
        original: valuePart.slice(pairPrefix.length)
    }
}
