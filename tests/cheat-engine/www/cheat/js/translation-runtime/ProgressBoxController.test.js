import { describe, expect, it } from 'vitest';

import {
    computeStackedProgressBoxPosition,
} from '../../../../../../cheat-engine/www/cheat/js/translation-runtime/ProgressBoxController.js';

describe('ProgressBoxController positioning', () => {
    it('places OTF progress below main progress when main box is in upper half', () => {
        const position = computeStackedProgressBoxPosition({
            anchorRect: {
                left: 200,
                top: 120,
                bottom: 160,
                width: 260,
            },
            boxWidth: 260,
            boxHeight: 40,
            viewportWidth: 1280,
            viewportHeight: 720,
        });

        expect(position).toEqual({
            left: 200,
            top: 168,
        });
    });

    it('places OTF progress above main progress when main box is in lower half', () => {
        const position = computeStackedProgressBoxPosition({
            anchorRect: {
                left: 200,
                top: 500,
                bottom: 540,
                width: 260,
            },
            boxWidth: 260,
            boxHeight: 40,
            viewportWidth: 1280,
            viewportHeight: 720,
        });

        expect(position).toEqual({
            left: 200,
            top: 452,
        });
    });
});
