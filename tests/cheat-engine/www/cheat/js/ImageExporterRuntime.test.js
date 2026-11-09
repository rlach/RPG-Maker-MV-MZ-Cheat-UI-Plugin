import { describe, expect, it, vi } from 'vitest';

import {
    buildExportPlanFromSourceFiles,
    ensureImageExporterRuntime,
    toLogicalRelativePath,
} from '../../../../../cheat-engine/www/cheat/js/ImageExporterRuntime.js';

describe('toLogicalRelativePath', () => {
    it('removes supported encrypted and png extensions', () => {
        expect(toLogicalRelativePath('pictures/a.png')).toBe('pictures/a');
        expect(toLogicalRelativePath('pictures/a.png_')).toBe('pictures/a');
        expect(toLogicalRelativePath('pictures/a.rpgmvp')).toBe('pictures/a');
    });
});

describe('buildExportPlanFromSourceFiles', () => {
    it('exports only files from exactly selected folders', () => {
        const sourceFiles = [
            'pictures/base.png_',
            'pictures/avatars/hero.rpgmvp',
            'pictures/pictos/icon.png',
        ];

        const plan = buildExportPlanFromSourceFiles(sourceFiles, ['pictures', 'pictures/avatars']);

        expect(plan.map((item) => item.logicalRelativePath)).toEqual([
            'pictures/base',
            'pictures/avatars/hero',
        ]);
    });

    it('supports exporting only one child folder when parent is not selected', () => {
        const sourceFiles = [
            'pictures/base.png_',
            'pictures/avatars/hero.rpgmvp',
            'pictures/pictos/icon.png',
        ];

        const plan = buildExportPlanFromSourceFiles(sourceFiles, ['pictures/pictos']);

        expect(plan.map((item) => item.logicalRelativePath)).toEqual(['pictures/pictos/icon']);
    });
});


describe('individual image export plan', () => {
    it('exports selected images independently of folders and preserves relative paths', () => {
        const files = ['pictures/a.png_', 'pictures/b.rpgmvp', 'titles1/main.png'];
        expect(buildExportPlanFromSourceFiles(files, [], [files[1], files[2]])
            .map(item => item.logicalRelativePath)).toEqual(['pictures/b', 'titles1/main']);
    });
});


it('skips existing targets and exports only new selected files', async () => {
    vi.stubGlobal('window', {});
    const fs = {
        existsSync: vi.fn(value => value === '/source' || value === '/cache/pictures/old.png'),
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn(),
    };
    const path = { join: (...parts) => parts.join('/'), dirname: value => value.slice(0, value.lastIndexOf('/')) };
    const runtime = ensureImageExporterRuntime();
    runtime.getNodeRequire = () => name => name === 'fs' ? fs : path;
    runtime.collectSourceImageFiles = () => ['pictures/old.png_', 'pictures/new.rpgmvp'];
    runtime.loadBitmapByUrl = vi.fn(async () => ({ destroy: vi.fn() }));
    runtime.bitmapToPngBuffer = () => 'png';
    try {
        const result = await runtime.startExport({ sourceRoot: '/source', cacheRoot: '/cache', selectedFolders: ['pictures'], skipExisting: true });
        expect(result.processedCount).toBe(1);
        expect(fs.writeFileSync).toHaveBeenCalledExactlyOnceWith('/cache/pictures/new.png', 'png', { flag: 'wx' });
        expect(runtime.loadBitmapByUrl).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllGlobals(); }
});
