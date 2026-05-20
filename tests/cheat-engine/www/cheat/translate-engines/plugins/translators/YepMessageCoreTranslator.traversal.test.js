import { beforeAll, describe, expect, it } from 'vitest';

import { collectEventCommandEntries } from '../../../../../../../cheat-engine/www/cheat/js/EventCommandTraversal.js';

let YepMessageCoreTranslator;

beforeAll(async () => {
    if (!globalThis.window) {
        globalThis.window = globalThis;
    }

    const module =
        await import('../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/YepMessageCoreTranslator.js');
    YepMessageCoreTranslator = module.YepMessageCoreTranslator;
});

describe('YepMessageCoreTranslator traversal extension', () => {
    it('keeps each show-text command as a separate key (no cumulative gluing)', () => {
        const list = [
            { code: 101, parameters: ['', 0, 0, 2] },
            { code: 401, parameters: [String.raw`\c[4]`] },
            { code: 401, parameters: ['人類の飛躍'] },
            { code: 401, parameters: ['【メルクリウス】号はあなたを待っています'] },
            {
                code: 401,
                parameters: [String.raw`\msgwidth[616]\msgposx[100]\msgposy[570]\msgrows[auto]`],
            },
            { code: 101, parameters: ['', 0, 0, 2] },
            { code: 401, parameters: [String.raw`\c[4]メルクリウス号は20年前`] },
            { code: 401, parameters: ['人類を銀河の果てまで伝播する使命をもって'] },
            { code: 401, parameters: ['建造されました'] },
            {
                code: 401,
                parameters: [String.raw`\msgwidth[616]\msgposx[100]\msgposy[570]\msgrows[auto]`],
            },
            { code: 101, parameters: ['', 0, 0, 2] },
            { code: 401, parameters: [String.raw`\c[4]`] },
            { code: 401, parameters: ['これは人類の宇宙世紀を開く'] },
            { code: 401, parameters: ['偉大な飛躍で間違いないでしょう'] },
            {
                code: 401,
                parameters: [String.raw`\msgwidth[616]\msgposx[100]\msgposy[570]\msgrows[auto]`],
            },
            { code: 0, parameters: [] },
        ];

        const translator = new YepMessageCoreTranslator();
        const extension = translator.getEventCommandTraversalExtension();

        const entries = collectEventCommandEntries(list, {
            traversalExtensions: [extension],
        }).filter((entry) => entry.type === 'message' || entry.type === 'message_portrait');

        expect(entries).toHaveLength(3);
        expect(entries[0].value).toBe(
            '\\c[4]\n人類の飛躍\n【メルクリウス】号はあなたを待っています\n\\msgwidth[616]\\msgposx[100]\\msgposy[570]\\msgrows[auto]'
        );
        expect(entries[1].value).toBe(
            '\\c[4]メルクリウス号は20年前\n人類を銀河の果てまで伝播する使命をもって\n建造されました\n\\msgwidth[616]\\msgposx[100]\\msgposy[570]\\msgrows[auto]'
        );
        expect(entries[2].value).toBe(
            '\\c[4]\nこれは人類の宇宙世紀を開く\n偉大な飛躍で間違いないでしょう\n\\msgwidth[616]\\msgposx[100]\\msgposy[570]\\msgrows[auto]'
        );

        expect(entries[0].value).not.toContain(entries[1].value);
        expect(entries[1].value).not.toContain(entries[2].value);
    });

    it('merges lson-lsoff spans across multiple show-text commands into one key', () => {
        const list = [
            { code: 101, parameters: ['', 0, 0, 2] },
            { code: 401, parameters: [String.raw`\lson\c[4]ステラちゃん！エイミーだよ！`] },
            { code: 401, parameters: [String.raw`\msgwidth[616]\msgposx[100]\msgrows[auto]`] },
            { code: 401, parameters: ['ベイリー博士からメッセージを'] },
            { code: 401, parameters: [String.raw`送れる住所をもらったよ\!`] },

            { code: 101, parameters: ['', 0, 0, 2] },
            { code: 401, parameters: ['今ごろ、宇宙にいるよね？'] },
            { code: 401, parameters: [String.raw`あたしも行きたいけど\!`] },

            { code: 101, parameters: ['', 0, 0, 2] },
            { code: 401, parameters: ['メルクリウス号に行っても'] },
            { code: 401, parameters: [String.raw`待っているからね\lsoff`] },
            { code: 0, parameters: [] },
        ];

        const translator = new YepMessageCoreTranslator();
        const extension = translator.getEventCommandTraversalExtension();

        const entries = collectEventCommandEntries(list, {
            traversalExtensions: [extension],
        }).filter((entry) => entry.type === 'message' || entry.type === 'message_portrait');

        expect(entries).toHaveLength(1);
        expect(entries[0].value).toBe(
            String.raw`\lson\c[4]ステラちゃん！エイミーだよ！` +
                '\n' +
                String.raw`\msgwidth[616]\msgposx[100]\msgrows[auto]` +
                '\n' +
                'ベイリー博士からメッセージを' +
                '\n' +
                String.raw`送れる住所をもらったよ\!` +
                '\n' +
                '今ごろ、宇宙にいるよね？' +
                '\n' +
                String.raw`あたしも行きたいけど\!` +
                '\n' +
                'メルクリウス号に行っても' +
                '\n' +
                String.raw`待っているからね\lsoff`
        );
    });
});
