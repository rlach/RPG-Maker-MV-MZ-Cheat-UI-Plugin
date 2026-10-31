const subscriptions = new WeakMap();

/** State notifications work across independently loaded Vue runtimes/windows. */
export function createSharedUiState(initial) {
    const listeners = new Set();
    const proxies = new WeakMap();
    const wrap = (value) => {
        if (
            !value ||
            typeof value !== 'object' ||
            (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype)
        )
            return value;
        if (proxies.has(value)) return proxies.get(value);
        const proxy = new Proxy(value, {
            get(target, key, receiver) {
                return wrap(Reflect.get(target, key, receiver));
            },
            set(target, key, next) {
                const changed = target[key] !== next;
                const result = Reflect.set(target, key, next);
                if (changed) for (const listener of listeners) listener();
                return result;
            },
            deleteProperty(target, key) {
                const existed = key in target;
                const result = Reflect.deleteProperty(target, key);
                if (existed) for (const listener of listeners) listener();
                return result;
            },
        });
        proxies.set(value, proxy);
        return proxy;
    };
    const state = wrap(initial);
    subscriptions.set(state, listeners);
    return state;
}

export function subscribeUiState(state, listener) {
    const listeners = subscriptions.get(state);
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function bindSharedUiState(component, service) {
    const computed = {};
    for (const [key, entry] of Object.entries(component.computed || {})) {
        const definition = typeof entry === 'function' ? { get: entry } : entry;
        computed[key] = {
            ...definition,
            get() {
                void this.sharedUiRevision;
                return definition.get.call(this);
            },
        };
    }
    return {
        ...component,
        computed,
        mixins: [
            ...(component.mixins || []),
            {
                data: () => ({ sharedUiRevision: 0 }),
                created() {
                    this.sharedUiUnsubscribe = subscribeUiState(
                        service.state,
                        () => this.sharedUiRevision++
                    );
                },
                beforeUnmount() {
                    this.sharedUiUnsubscribe?.();
                },
            },
        ],
    };
}
