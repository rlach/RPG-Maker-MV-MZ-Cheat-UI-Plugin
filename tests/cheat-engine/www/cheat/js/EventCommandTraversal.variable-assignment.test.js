import { describe, expect, it } from 'vitest';

import { collectVariableAssignmentEntries } from '../../../../../../cheat-engine/www/cheat/js/EventCommandTraversal.js';

describe('EventCommandTraversal variable assignments', () => {
    it('collects script operand string literal assignments for selected variables', () => {
        const list = [
            {
                code: 122,
                parameters: [61, 61, 0, 4, "'強化の極意【初級】'"],
            },
        ];

        const entries = collectVariableAssignmentEntries(list, {
            allowedVariableIds: new Set([61]),
        });

        expect(entries).toEqual([
            {
                type: 'variable_value',
                value: '強化の極意【初級】',
                operandType: 4,
                rawOperandValue: "'強化の極意【初級】'",
                variableIds: [61],
                variableIdStart: 61,
                variableIdEnd: 61,
                cmdIndex: 0,
                command: list[0],
            },
        ]);
    });

    it('supports assignments that target a variable range and filters by allowed ids', () => {
        const list = [
            {
                code: 122,
                parameters: [60, 62, 0, 4, "'範囲テスト'"],
            },
        ];

        const entries = collectVariableAssignmentEntries(list, {
            allowedVariableIds: new Set([61]),
        });

        expect(entries).toHaveLength(1);
        expect(entries[0].variableIds).toEqual([61]);
        expect(entries[0].value).toBe('範囲テスト');
    });
});
