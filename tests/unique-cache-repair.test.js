import { it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    planUniqueCacheRepair,
    applyUniqueCacheRepair,
} from '../scripts/repair-unique-data-cache.mjs';
it('moves catalog keys once, backs up conflicting values, and removes the retired bucket', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'unique-cache-repair-'));
    try {
        for (const directory of ['js', 'data', 'www/cheat-settings/translate-cache'])
            fs.mkdirSync(path.join(root, directory), { recursive: true });
        const cache = path.join(root, 'www/cheat-settings/translate-cache');
        fs.writeFileSync(
            path.join(root, 'js/plugins.js'),
            'var $plugins = ' +
                JSON.stringify([
                    {
                        name: 'folder/UniqueDataLoader',
                        status: true,
                        parameters: {
                            UniqueDataList: JSON.stringify([
                                JSON.stringify({ JsonFileName: 'Texts' }),
                            ]),
                        },
                    },
                ]) +
                ';'
        );
        fs.writeFileSync(
            path.join(root, 'data/Texts.json'),
            JSON.stringify([
                null,
                { text: '一行\r\n二行', choicesText: 'はい', textName: '名前', helpText: '説明' },
            ])
        );
        const legacy = {
            '一行\n二行': 'New boxed dialogue',
            はい: 'Yes',
            名前: 'Name',
            説明: 'Help',
        };
        fs.writeFileSync(
            path.join(cache, 'plugin_unique_data_loader.ja-en.cache.json'),
            JSON.stringify(legacy)
        );
        fs.writeFileSync(
            path.join(cache, 'message.ja-en.cache.json'),
            JSON.stringify({ '一行\r\n二行': 'Old dialogue', Unrelated: 'Keep me' })
        );
        const plan = planUniqueCacheRepair(root);
        expect(plan.changes).toHaveLength(4);
        expect(plan.conflicts).toHaveLength(1);
        const backup = applyUniqueCacheRepair(plan);
        expect(
            JSON.parse(
                fs.readFileSync(
                    path.join(backup, 'plugin_unique_data_loader.ja-en.cache.json'),
                    'utf8'
                )
            )
        ).toEqual(legacy);
        expect(
            JSON.parse(fs.readFileSync(path.join(cache, 'message.ja-en.cache.json'), 'utf8'))
        ).toEqual({ '一行\n二行': 'New boxed dialogue', 説明: 'Help', Unrelated: 'Keep me' });
        expect(
            JSON.parse(fs.readFileSync(path.join(cache, 'choice.ja-en.cache.json'), 'utf8'))
        ).toEqual({ はい: 'Yes' });
        expect(fs.existsSync(path.join(cache, 'plugin_unique_data_loader.ja-en.cache.json'))).toBe(
            false
        );
    } finally {
        if (
            path.dirname(root) !== os.tmpdir() ||
            !path.basename(root).startsWith('unique-cache-repair-')
        )
            throw Error('Unsafe test cleanup');
        fs.rmSync(root, { recursive: true });
    }
});
