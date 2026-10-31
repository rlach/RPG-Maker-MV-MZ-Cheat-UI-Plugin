import { expect, it, vi } from 'vitest';
import {
    createSharedUiState,
    subscribeUiState,
    bindSharedUiState,
} from '../cheat-engine/www/cheat/js/SharedUiState.js';
import { uiTableMethods } from '../cheat-engine/www/cheat/js/WindowUiLibraries.js';

it('notifies each window about nested changes and unsubscribes on teardown', () => {
    const state = createSharedUiState({ selection: {}, rows: [] });
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribe = subscribeUiState(state, first);
    subscribeUiState(state, second);
    state.selection.maps = true;
    state.rows.push({ name: 'Maps' });
    expect(first).toHaveBeenCalledTimes(2);
    unsubscribe();
    state.rows[0].name = 'Events';
    delete state.selection.maps;
    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(4);
});

it('preserves writable modal bindings while invalidating computed state', () => {
    const service = { state: createSharedUiState({ visible: false }) };
    const component = bindSharedUiState(
        {
            computed: {
                visible: {
                    get() {
                        return service.state.visible;
                    },
                    set(value) {
                        service.state.visible = value;
                    },
                },
            },
        },
        service
    );
    const vm = { sharedUiRevision: 0 };
    component.mixins[0].created.call(vm);
    component.computed.visible.set.call(vm, true);
    expect(component.computed.visible.get.call(vm)).toBe(true);
    expect(vm.sharedUiRevision).toBe(1);
    component.mixins[0].beforeUnmount.call(vm);
    service.state.visible = false;
    expect(vm.sharedUiRevision).toBe(1);
});

it('adapts table sorting without changing persisted settings shape', () => {
    const vm = { filters: { sort: ['name'], desc: [false] } };
    uiTableMethods.updateUiTableSort.call(
        vm,
        [{ key: 'seen', order: 'desc' }],
        'filters.sort',
        'filters.desc'
    );
    expect(vm.filters).toEqual({ sort: ['seen'], desc: [true] });
    expect(uiTableMethods.uiTableSort(vm.filters.sort, vm.filters.desc)).toEqual([
        { key: 'seen', order: 'desc' },
    ]);
    expect(uiTableMethods.uiTableHeaders([{ text: 'Name', value: 'name' }])[0]).toMatchObject({
        title: 'Name',
        key: 'name',
    });
});
