/** Evaluate UMD libraries in the target DOM realm, independent of NW module caches. */
export async function loadWindowUiLibraries(hostWindow, readSource = null) {
    const read =
        readSource ||
        ((path) =>
            new Promise((resolve, reject) => {
                const request = new hostWindow.XMLHttpRequest();
                request.open('GET', new URL(path, hostWindow.document.baseURI).href, true);
                request.onload = () =>
                    request.status < 400 && request.responseText
                        ? resolve(request.responseText)
                        : reject(new Error(`Cannot load ${path}: ${request.status}`));
                request.onerror = () => reject(new Error(`Cannot load ${path}`));
                request.send();
            }));
    for (const path of ['libs/vue.js', 'libs/vuetify.js']) {
        const source = await read(path);
        // Shadow CommonJS/AMD globals: neither require() nor a shared constructor
        // may bind DOM events and detached menus to the parent game's document.
        hostWindow
            .Function('module', 'exports', 'define', source)
            .call(hostWindow, undefined, undefined, undefined);
    }
    hostWindow.Vue.use(hostWindow.Vuetify);
}

/** Vue 2 caches constructors on imported options by cid (both windows start at 0). */
export function isolateWindowComponent(component, seen = new WeakMap()) {
    const options = typeof component === 'function' ? component.options : component;
    if (!options || typeof options !== 'object') return component;
    if (seen.has(options)) return seen.get(options);
    const clone = { ...options };
    seen.set(options, clone);
    delete clone._Ctor;
    delete clone._base;
    if (options.components)
        clone.components = Object.fromEntries(
            Object.entries(options.components).map(([name, child]) => [
                name,
                isolateWindowComponent(child, seen),
            ])
        );
    if (options.mixins)
        clone.mixins = options.mixins.map((mixin) => isolateWindowComponent(mixin, seen));
    if (options.extends) clone.extends = isolateWindowComponent(options.extends, seen);
    return clone;
}
