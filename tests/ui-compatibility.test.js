import { expect, it } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';

it('supplies missing array/string at methods in the owning UI realm only', () => {
    const source = fs.readFileSync('cheat-engine/www/cheat/js/UiCompatibility.js', 'utf8');
    const originalAt = Array.prototype.at;
    const context = vm.createContext({});
    vm.runInContext(
        'window = globalThis; delete Array.prototype.at; delete String.prototype.at; delete Array.prototype.toReversed;',
        context
    );
    vm.runInContext(source, context);
    expect(vm.runInContext('[10,20,30].at(-1)', context)).toBe(30);
    expect(vm.runInContext('[10,20,30].at(0)', context)).toBe(10);
    expect(vm.runInContext('[10].at(10)', context)).toBeUndefined();
    expect(vm.runInContext('[10].at(-2)', context)).toBeUndefined();
    expect(vm.runInContext('[10].at(Infinity)', context)).toBeUndefined();
    expect(vm.runInContext('[10].at(NaN)', context)).toBe(10);
    expect(vm.runInContext('"abc".at(-1)', context)).toBe('c');
    expect(vm.runInContext('Array.prototype.at.call({0:"x",length:1},0)', context)).toBe('x');
    expect(() => vm.runInContext('Array.prototype.at.call(null,0)', context)).toThrow();
    expect(vm.runInContext('JSON.stringify([1,2,3].toReversed())', context)).toBe('[3,2,1]');
    expect(vm.runInContext('Object.keys(Array.prototype).includes("at")', context)).toBe(false);
    expect(Array.prototype.at).toBe(originalAt);
});
