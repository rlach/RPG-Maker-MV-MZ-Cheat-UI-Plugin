import { describe, expect, it } from 'vitest';

import { collectVariableAssignmentEntries } from '../../../../../cheat-engine/www/cheat/js/EventCommandTraversal.js';

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

    it('collects $gameVariables.setValue string literal assignments from script commands (355/655)', () => {
        const list = [
            {
                code: 355,
                parameters: ["$gameVariables.setValue(331,'高級な絹糸')"],
            },
            {
                code: 655,
                parameters: ['window.$gameVariables.setValue(332, "大きな宝石");'],
            },
            {
                code: 655,
                parameters: [
                    "$gameVariables.setValue(333, 2); $gameVariables.setValue(999, 'ignored')",
                ],
            },
        ];

        const entries = collectVariableAssignmentEntries(list, {
            allowedVariableIds: new Set([331, 332]),
        });

        expect(entries).toEqual([
            {
                type: 'variable_value',
                value: '高級な絹糸',
                operandType: 4,
                rawOperandValue: "'高級な絹糸'",
                variableIds: [331],
                variableIdStart: 331,
                variableIdEnd: 331,
                cmdIndex: 0,
                command: list[0],
            },
            {
                type: 'variable_value',
                value: '大きな宝石',
                operandType: 4,
                rawOperandValue: '"大きな宝石"',
                variableIds: [332],
                variableIdStart: 332,
                variableIdEnd: 332,
                cmdIndex: 0,
                command: list[0],
            },
        ]);
    });

    it('supports multiline script $gameVariables.setValue calls split across 355 and 655', () => {
        const list = [
            {
                code: 355,
                parameters: ['$gameVariables.setValue('],
            },
            {
                code: 655,
                parameters: ["  335, '普通の糸'"],
            },
            {
                code: 655,
                parameters: [')'],
            },
        ];

        const entries = collectVariableAssignmentEntries(list, {
            allowedVariableIds: new Set([335]),
        });

        expect(entries).toHaveLength(1);
        expect(entries[0].variableIds).toEqual([335]);
        expect(entries[0].value).toBe('普通の糸');
    });
});
