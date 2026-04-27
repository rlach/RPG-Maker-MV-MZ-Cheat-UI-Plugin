const ROOT_EVENT_LISTENERS_KEY = '__CHEAT_ROOT_EVENT_LISTENERS__'

export function getRootWindow() {
    if (window.__CHEAT_EXTERNAL_WINDOW__ && window.opener && !window.opener.closed) {
        return window.opener
    }

    return window
}

function mirrorValueToCurrentWindow(key, value) {
    if (key === ROOT_EVENT_LISTENERS_KEY) {
        return
    }

    if (window === getRootWindow()) {
        return
    }

    try {
        window[key] = value
    } catch (error) {
        // Ignore cross-window assignment failures.
    }
}

export function ensureRootWindowStateValue(key, factory) {
    const root = getRootWindow()

    if (!Object.prototype.hasOwnProperty.call(root, key) || root[key] == null) {
        root[key] = typeof factory === 'function' ? factory() : factory
    }

    mirrorValueToCurrentWindow(key, root[key])
    return root[key]
}

export function setRootWindowStateValue(key, value, options = {}) {
    const root = getRootWindow()
    root[key] = value

    if (options.mirror !== false) {
        mirrorValueToCurrentWindow(key, value)
    }

    return value
}

function ensureRootEventListenersMap() {
    return ensureRootWindowStateValue(ROOT_EVENT_LISTENERS_KEY, () => new Map())
}

export function subscribeRootWindowEvent(eventName, handler) {
    if (typeof handler !== 'function') {
        return () => {}
    }

    const listenersByEvent = ensureRootEventListenersMap()
    const listeners = listenersByEvent.get(eventName) || new Set()
    listeners.add(handler)
    listenersByEvent.set(eventName, listeners)

    return () => {
        const currentListeners = listenersByEvent.get(eventName)
        if (!currentListeners) {
            return
        }

        currentListeners.delete(handler)
        if (currentListeners.size <= 0) {
            listenersByEvent.delete(eventName)
        }
    }
}

export function notifyRootWindowEvent(eventName, detail = {}) {
    const listenersByEvent = ensureRootEventListenersMap()
    const listeners = listenersByEvent.get(eventName)
    if (!listeners || listeners.size <= 0) {
        return
    }

    for (const handler of Array.from(listeners)) {
        try {
            handler(detail)
        } catch (error) {
            console.warn(`[RootWindowState] Listener error for ${eventName}`, error)
        }
    }
}
