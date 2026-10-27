import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock(
    '../cheat-engine/www/cheat/js/translation-runtime/ObjectTranslationModalMethods.js',
    () => ({ loadMapDataById: vi.fn() })
);
import { SceneCustomMenuTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/SceneCustomMenuTranslator.js';
const filter =
    '((item.id >= 2 && item.id <= 299) || $gameVariables.value(224).includes(item.id)) && s(parseInt($gameVariables.value(108).id+800)) && item.meta[$gameVariables.value(108).name];';
let actor, switches, records;
beforeEach(() => {
    vi.stubGlobal('window', globalThis);
    actor = { id: 23, name: 'Towa', _translateOriginal: { name: 'トワ' } };
    records = [
        { id: 82, meta: { トワ: true, value: '1101', picture: 'original_asset' } },
        { id: 83, meta: { トワ: true, value: '1101' } },
        { id: 84, meta: { 別人: true, value: '1102' } },
    ];
    switches = new Set([823]);
    vi.stubGlobal('$gameVariables', { value: (id) => (id === 108 ? actor : []) });
    vi.stubGlobal('$gameSwitches', { value: (id) => switches.has(id) });
    vi.stubGlobal('$dataActors', []);
    $dataActors[23] = actor;
});
afterEach(() => vi.unstubAllGlobals());
function dataList() {
    class DataList {
        _data = { FilterScript: filter };
        isVisible(item) {
            const s = $gameSwitches.value;
            return eval(this._data.FilterScript);
        }
        isEnabledSub(item) {
            return $gameSwitches.value(parseInt(item.meta.value));
        }
    }
    new SceneCustomMenuTranslator()._installDataListIdentityHooks(DataList.prototype);
    return new DataList();
}
it('restores gallery membership without changing translated names, metadata or unlock switches', () => {
    const list = dataList();
    const before = structuredClone(records);
    expect(records.filter((item) => list.isVisible(item)).map((item) => item.id)).toEqual([82, 83]);
    expect(list.isEnabledSub(records[0])).toBe(false);
    switches.add(1101);
    expect(list.isEnabledSub(records[0])).toBe(true);
    expect(actor.name).toBe('Towa');
    expect(records).toEqual(before);
    switches.delete(823);
    expect(records.filter((item) => list.isVisible(item))).toEqual([]);
});
it('does not evaluate enabled expressions for an empty list', () => {
    const list = dataList();
    expect(list.isEnabledSub(undefined)).toBe(false);
    expect(list.isEnabledSub(null)).toBe(false);
});
it('keeps untranslated filters working and handles selected actor copies by database ID', () => {
    const list = dataList();
    actor.name = 'トワ';
    expect(list.isVisible(records[0])).toBe(true);
    actor.name = 'Towa';
    $gameVariables.value = (id) => (id === 108 ? { id: 23, name: 'Towa' } : []);
    expect(list.isVisible(records[0])).toBe(true);
});
it('leaves unrelated filters untouched and does not invent missing metadata', () => {
    const list = dataList();
    list._data.FilterScript = 'item.meta["別人"]';
    expect(list.isVisible(records[2])).toBe(true);
    list._data.FilterScript = filter;
    expect(list.isVisible(records[2])).toBeUndefined();
});

it('uses the live actor selection on repeated visits before the variable update runs', () => {
    const list = dataList();
    const police = { id: 17, name: 'Shinomiya', _translateOriginal: { name: '真宮' } };
    const policeRecord = { id: 60, meta: { 真宮: true, value: '901' } };
    switches.add(817);
    let current = police;
    list._windowMap = new Map([
        [
            'member',
            {
                _data: { ItemVariableId: 108 },
                index: () => 0,
                getItem: () => current,
            },
        ],
    ]);
    const value = $gameVariables.value;
    for (let visit = 0; visit < 3; visit++) {
        expect(list.isVisible(policeRecord)).toBe(true);
        expect(list.isEnabledSub(policeRecord)).toBe(false);
        current = actor;
        expect(list.isVisible(policeRecord)).toBeUndefined();
        expect(list.isVisible(records[0])).toBe(true);
        current = { ...police };
    }
    expect($gameVariables.value).toBe(value);
    expect($gameVariables.value(108)).toBe(actor);
});

it('keeps raw database identity authoritative over translated saved snapshots', () => {
    class DataList {
        _data = { FilterScript: filter };
        isVisible(item, v, s) {
            return eval(this._data.FilterScript.replaceAll('$gameVariables.value', 'v'));
        }
        isEnabledSub() {
            return false;
        }
    }
    const translator = new SceneCustomMenuTranslator();
    translator._actorSourceNames.set(23, 'トワ');
    translator._installDataListIdentityHooks(DataList.prototype);
    actor._translateOriginal.name = 'Towa';
    expect(new DataList().isVisible(records[0], $gameVariables.value, $gameSwitches.value)).toBe(
        true
    );
});
