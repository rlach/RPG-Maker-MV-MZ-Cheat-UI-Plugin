import { describe, expect, it } from 'vitest';

import {
    buildExportPlanFromSourceFiles,
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
