import { describe, expect, it, vi } from 'vitest';
vi.mock('../../../../../cheat-engine/www/cheat/js/translation-runtime/TranslationRuntime.js', () => ({ ensureTranslationRuntime: vi.fn() }));
import panel from '../../../../../cheat-engine/www/cheat/panels/TranslateImagesPanel.js';

function model(files) {
    const state = panel.data();
    state.sourceFiles = Object.freeze(files);
    for (const [name, getter] of Object.entries(panel.computed)) {
        Object.defineProperty(state, name, { get: () => getter.call(state) });
    }
    for (const [name, method] of Object.entries(panel.methods)) state[name] = method.bind(state);
    return state;
}

describe('image exporter selection', () => {
    it('retains individual selections across filters', () => {
        const state = model(['titles1/titleMain.png', 'pictures/hp1.png_', 'pictures/mp1.rpgmvp']);
        for (const [filter, id] of [['title', 'titles1/titleMain.png'], ['hp', 'pictures/hp1.png_'], ['mp', 'pictures/mp1.rpgmvp']]) {
            state.appliedFilter = filter;
            state.toggleSelection({ id, folder: false });
        }
        expect(state.selectedExportFiles).toHaveLength(3);
    });
    it('counts and selects only unexported matches even with images hidden', () => {
        const state = model(['pictures/old.png_', 'pictures/new.png_', 'titles1/main.png']);
        state.hideExported = true;
        state.exportedFiles = new Set(['pictures/old']);
        expect(state.folderStats.get('pictures').count).toBe(1);
        state.toggleSelection({ id: 'pictures', folder: true });
        expect(state.selectedExportFiles).toEqual(['pictures/new.png_']);
        expect(state.visibleRows.every(row => row.folder)).toBe(true);
    });
    it('keeps selections outside folder search results', () => {
        const state = model(['pictures/hp.png', 'pictures/mp.png']);
        state.selectedFiles.add('pictures/mp.png');
        state.appliedFilter = 'hp';
        state.toggleSelection({ id: 'pictures', folder: true });
        expect(state.selectedExportFiles).toHaveLength(2);
        state.toggleSelection({ id: 'pictures', folder: true });
        expect(state.selectedExportFiles).toEqual(['pictures/mp.png']);
    });
    it('builds a large tree without expanding image rows when folders are collapsed', () => {
        const state = model(Array.from({ length: 50000 }, (_, i) => `pictures/image${i}.png`));
        state.showImages = true;
        expect(state.visibleRows).toHaveLength(1);
        expect(state.folderStats.get('pictures').count).toBe(50000);
    });
});


it('initially expands parent folders and the selected pictures subtree, but collapses other leaves', () => {
    const files = ['titles1/main.png', 'other/nested/icon.png', 'pictures/base.png', 'pictures/portraits/hero.png'];
    const state = model(files);
    state._imageExporterRuntime = {
        getImageRootAbsolutePath: () => '/img',
        collectSourceImageFiles: () => files,
    };
    state.refreshExportedFiles = vi.fn();
    state.refreshFolderTree();
    expect([...state.expanded].sort()).toEqual(['other', 'pictures', 'pictures/portraits']);
    expect(state.selectedExportFiles).toEqual(['pictures/base.png', 'pictures/portraits/hero.png']);
});
