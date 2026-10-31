import CheatTooltip from '../components/CheatTooltip.js';
import { installUiKeyboardGuard } from './UiKeyboardGuard.js';

/** Evaluate bundled libraries in the document that owns their DOM and events. */
export async function loadWindowUiLibraries(hostWindow, readSource = null) {
    const base = new URL('../', import.meta.url);
    const read =
        readSource ||
        ((path) =>
            new Promise((resolve, reject) => {
                const request = new hostWindow.XMLHttpRequest();
                request.open('GET', new URL(path, base).href, true);
                request.onload = () =>
                    request.status < 400 && request.responseText
                        ? resolve(request.responseText)
                        : reject(new Error(`Cannot load ${path}: ${request.status}`));
                request.onerror = () => reject(new Error(`Cannot load ${path}`));
                request.send();
            }));
    hostWindow.Function(await read('js/UiCompatibility.js')).call(hostWindow);
    hostWindow.Vue = hostWindow
        .Function('module', 'exports', 'define', `${await read('libs/vue.js')}\nreturn Vue;`)
        .call(hostWindow, undefined, undefined, undefined);
    hostWindow
        .Function('module', 'exports', 'define', await read('libs/vuetify.js'))
        .call(hostWindow, undefined, undefined, undefined);
}

/** NW shares imported options; avoid sharing Vue's compiled render functions. */
export function isolateWindowComponent(component, seen = new WeakMap()) {
    if (!component || typeof component !== 'object') return component;
    if (seen.has(component)) return seen.get(component);
    const clone = { ...component };
    seen.set(component, clone);
    if (clone.template) delete clone.render;
    if (component.components)
        clone.components = Object.fromEntries(
            Object.entries(component.components).map(([name, child]) => [
                name,
                isolateWindowComponent(child, seen),
            ])
        );
    if (component.mixins)
        clone.mixins = component.mixins.map((mixin) => isolateWindowComponent(mixin, seen));
    if (component.extends) clone.extends = isolateWindowComponent(component.extends, seen);
    return clone;
}

export const uiTableMethods = {
    uiTableHeaders(headers = []) {
        return headers.map((header) => ({
            ...header,
            title: header.title ?? header.text,
            key: header.key ?? header.value,
        }));
    },
    uiTableSort(keys, descending) {
        return (Array.isArray(keys) ? keys : keys ? [keys] : []).map((key, index) =>
            typeof key === 'object'
                ? key
                : {
                      key,
                      order: (Array.isArray(descending) ? descending[index] : descending)
                          ? 'desc'
                          : 'asc',
                  }
        );
    },
    updateUiTableSort(sort, keysPath, descendingPath) {
        const read = (path) => path.split('.').reduce((value, key) => value[key], this);
        const set = (path, value) => {
            const parts = path.split('.');
            const key = parts.pop();
            let target = this;
            for (const part of parts) target = target[part];
            target[key] = value;
        };
        const keys = sort.map((item) => item.key);
        const directions = sort.map((item) => item.order === 'desc');
        set(keysPath, Array.isArray(read(keysPath)) ? keys : keys[0] || '');
        if (!['false', 'true'].includes(descendingPath))
            set(
                descendingPath,
                Array.isArray(read(descendingPath)) ? directions : directions[0] || false
            );
    },
};

export function createWindowUiApp(hostWindow, options) {
    installUiKeyboardGuard(hostWindow);
    const app = hostWindow.Vue.createApp(isolateWindowComponent(options));
    app.component('CheatTooltip', isolateWindowComponent(CheatTooltip));
    app.mixin({ methods: uiTableMethods });
    app.use(
        hostWindow.Vuetify.createVuetify({
            theme: {
                defaultTheme: 'dark',
                themes: {
                    dark: {
                        colors: {
                            primary: '#2196f3',
                            warning: '#ffc107',
                            surface: '#1e1e1e',
                            background: '#1e1e1e',
                        },
                    },
                },
            },
            defaults: {
                VSelect: { density: 'compact', variant: 'outlined' },
                VAutocomplete: { density: 'compact', variant: 'outlined' },
                VTextField: { density: 'compact', variant: 'outlined' },
                VCheckbox: { density: 'compact' },
                VDataTable: {
                    density: 'compact',
                    showFirstLastPage: false,
                    itemsPerPageOptions: [5, 10, 20, 50, 100, -1],
                    itemsPerPageText: 'Rows per page:',
                },
                VTooltip: { openDelay: 400, closeDelay: 0 },
            },
        })
    );
    return app;
}
