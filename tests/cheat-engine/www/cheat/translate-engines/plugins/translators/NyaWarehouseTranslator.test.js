import { expect, it } from 'vitest';
import { NyaWarehouseTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/NyaWarehouseTranslator.js';

it('collects original warehouse titles in MV and MZ without importing translated map names', () => {
    const t = new NyaWarehouseTranslator();
    t.collectMapTexts({ name: 'Bunker Base' }, { displayName: 'Bunker Base' });
    t.collectCommandTexts([
        { code: 356, parameters: ['PHWarehouse create <バンカー基地:1000>'] },
        { code: 356, parameters: ['PHWarehouse show <バンカー基地>'] },
        { code: 356, parameters: ['PHWarehouse add item <バンカー基地:1:5>'] },
        { code: 357, parameters: ['NYA_PH_Warehouse', 'create', '', { create_title: '倉庫' }] },
        { code: 355, parameters: ['this.drawText("Unrelated translated text", 0, 0);'] },
    ]);
    expect([...t.entries.keys()]).toEqual(['バンカー基地', '倉庫']);
    const r = {
        getCacheKey: (text, type) => type + ':' + text,
        hasUsableCacheValue: (key) => key === 'plugin_nya_ph_warehouse:バンカー基地',
    };
    expect(t.collectUntranslated({ runtime: r }).map((item) => item.value)).toEqual(['倉庫']);
});
