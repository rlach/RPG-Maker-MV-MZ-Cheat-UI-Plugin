import { describe, expect, it } from 'vitest';

import {
    collectEventCommandEntries,
    countEventCommandEntries,
    extractScrollTextEntryAt,
} from '../../../../../../cheat-engine/www/cheat/js/EventCommandTraversal.js';

describe('EventCommandTraversal scroll text commands', () => {
    it('extracts scroll text entry from command105 + command405 lines', () => {
        const list = [
            { code: 105, parameters: [2, false] },
            { code: 405, parameters: ['Line A'] },
            { code: 405, parameters: ['Line B'] },
            { code: 0, parameters: [] },
        ];

        const entry = extractScrollTextEntryAt(list, 0);

        expect(entry).toEqual({
            cmdIndex: 0,
            nextIndex: 3,
            command: list[0],
            lines: ['Line A', 'Line B'],
            text: 'Line A\nLine B',
        });
    });

    it('collects scroll_text items and includes them in untranslated counting', () => {
        const list = [
            { code: 105, parameters: [2, false] },
            { code: 405, parameters: ['Scroll one'] },
            { code: 102, parameters: [['Choice 1', 'Choice 2']] },
            { code: 0, parameters: [] },
        ];

        const entries = collectEventCommandEntries(list);
        expect(entries).toEqual([
            {
                type: 'scroll_text',
                value: 'Scroll one',
                cmdIndex: 0,
                nextIndex: 2,
                command: list[0],
            },
            {
                type: 'choice',
                value: 'Choice 1',
                cmdIndex: 2,
                choiceIndex: 0,
                command: list[2],
            },
            {
                type: 'choice',
                value: 'Choice 2',
                cmdIndex: 2,
                choiceIndex: 1,
                command: list[2],
            },
        ]);

        const stats = countEventCommandEntries(list, {
            isUntranslated: (entry) => entry.type === 'scroll_text',
        });

        expect(stats).toEqual({ totalStrings: 3, leftStrings: 1 });
    });
});
