import { readFileSync } from 'node:fs';
import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ cache: new Map(), seen: new Map(), version: 1, runtime: null }));
vi.mock('../cheat-engine/www/cheat/js/KeyValueStorage.js', () => ({ KeyValueStorage: class { getAll() { return {}; } } }));
vi.mock('../cheat-engine/www/cheat/js/TableSettings.js', () => ({ getRowsPerPage: () => 25, setRowsPerPage: vi.fn() }));
vi.mock('../cheat-engine/www/cheat/translate-engines/batch-manager/TranslationBatchManagerFactory.js', () => ({ createTranslationBatchManager: vi.fn() }));
vi.mock('../cheat-engine/www/cheat/js/TranslateCacheRuntime.js', () => ({
    ensureTranslateCacheRuntime: () => ({ cache: state.cache, lastSeenByCacheKey: state.seen, version: state.version }),
    onTranslateCacheRuntimeChanged: () => () => {},
    parseCacheKeyForLangPair: (key, source, target) => { const prefix = `message:${source}-${target}-`; return key.startsWith(prefix) ? { type: 'message', original: key.slice(prefix.length) } : null; },
}));
vi.mock('../cheat-engine/www/cheat/js/DialogHelper.js', () => ({ ConfirmDialog: {} }));
vi.mock('../cheat-engine/www/cheat/js/translation-runtime/TranslationRuntime.js', () => ({ ensureTranslationRuntime: () => state.runtime }));
vi.mock('../cheat-engine/www/cheat/components/BoxingModal.js', () => ({ BOXING_SERVICE: {} }));
import Panel from '../cheat-engine/www/cheat/panels/TranslateCacheManagerPanel.js';
const Vue = new Function(readFileSync('cheat-engine/www/cheat/libs/vue.js', 'utf8') + ';return Vue;')();
const renderer = Vue.createRenderer({ createComment: () => ({}), insert() {}, remove() {}, parentNode() {}, nextSibling() {}, createElement: () => ({}), setElementText() {}, patchProp() {} });
function mount() { const app = renderer.createApp({ ...Panel, render: () => null }); return { app, vm: app.mount({}) }; }
beforeEach(() => {
    state.cache = new Map(); state.seen = new Map(); state.version++;
    state.runtime = { sourceLang: 'ja', targetLang: 'en', getTranslationSuspicions: vi.fn(() => []) };
});
it('prepares 61k rows in yielding chunks, leaves them raw, and reuses sorting across pages and remounts', async () => {
    for (let i = 0; i < 61000; i++) state.cache.set(`message:ja-en-本文 ${i}`, `Translation ${i}`);
    const start = performance.now();
    const { app, vm } = mount();
    expect(vm.isLoadingEntries).toBe(true);
    let heartbeat = false; setTimeout(() => { heartbeat = true; }, 0);
    await vm.refreshEntries();
    expect(heartbeat).toBe(true);
    expect(vm.entries).toHaveLength(61000);
    expect(Vue.isReactive(vm.entries)).toBe(false);
    const sorted = vm.sortedEntries;
    const loaded = performance.now();
    expect(vm.pageEntries).toHaveLength(25);
    vm.page = 2;
    expect(vm.pageEntries[0]).toBe(sorted[25]);
    expect(vm.sortedEntries).toBe(sorted);
    const paged = performance.now();
    const items = vm.entries;
    app.unmount();
    const next = mount();
    await next.vm.refreshEntries();
    expect(next.vm.entries).toBe(items);
    expect(state.runtime.getTranslationSuspicions).toHaveBeenCalledTimes(61000);
    console.log(JSON.stringify({ rows: items.length, prepareAndSortMs: Math.round(loaded-start), pageChangeMs: Math.round(paged-loaded), reopenMs: Math.round(performance.now()-paged) }));
    next.app.unmount();
});
it('edits raw snapshot rows without losing reactivity or stale filtered results', async () => {
    state.cache.set('message:ja-en-本文', 'Old');
    const { vm, app } = mount(); await vm.refreshEntries();
    const original = vm.entries;
    state.cache.set('message:ja-en-本文', 'New');
    vm.updateEntryTranslation('message:ja-en-本文');
    expect(vm.entries).not.toBe(original);
    expect(vm.pageEntries[0].translation).toBe('New');
    app.unmount();
});

it('allows replacement in translation-only matches and preserves originals and other rows',async()=>{
    state.cache.set('message:ja-en-原文一','Hello {Mikami-san}');
    state.cache.set('message:ja-en-原文二','Other person');
    state.runtime.acceptTranslationSuspicions=vi.fn();state.runtime.persistCache=vi.fn();state.runtime.notifyCacheRuntime=vi.fn();
    const {app,vm}=mount();await vm.refreshEntries();
    vm.searchIn='translation';vm.searchInput='{Mikami-san}';vm.replaceInput='Mikami-san';
    expect(vm.replaceButtonDisabled).toBe(false);
    vm.performReplace();
    expect(state.cache.get('message:ja-en-原文一')).toBe('Hello Mikami-san');
    expect(state.cache.get('message:ja-en-原文二')).toBe('Other person');
    expect(state.runtime.persistCache).toHaveBeenCalledWith(['message:ja-en-原文一']);
    app.unmount();
});
