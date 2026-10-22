import { ensureRootWindowStateValue } from './RootWindowState.js';

export function getTableSessionState(key) {
    const tables = ensureRootWindowStateValue('__CHEAT_TABLE_SESSION_STATE__', () => ({}));
    if (!tables[key]) {
        tables[key] = {
            search: '',
            excludeNameless: false,
            onlyOwnedItems: false,
            onlySafeForTranslate: false,
            onlyPinned: false,
            page: 1,
            sortBy: [],
            sortDesc: [],
        };
    }
    return tables[key];
}

// Keep presentation state on the game window, including when the overlay is
// destroyed or reopened in a separate window. Nothing is written to disk.
export function tableSessionMixin(key) {
    const computed = {};
    for (const field of [
        'search',
        'excludeNameless',
        'onlyOwnedItems',
        'onlySafeForTranslate',
        'onlyPinned',
        'page',
    ]) {
        computed[field] = {
            get() {
                return this.tableSession[field];
            },
            set(value) {
                this.tableSession[field] = value;
            },
        };
    }
    return {
        data() {
            return {
                tableSession: getTableSessionState(key || this.tableStateKey),
                tableReady: false,
            };
        },
        computed,
    };
}
