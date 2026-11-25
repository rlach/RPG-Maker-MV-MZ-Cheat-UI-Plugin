import { expect, it, vi } from 'vitest';
import { observeOverlaySize } from '../cheat-engine/www/cheat/js/OverlayResize.js';

function fixture() {
    let notify;
    const frames = new Map();
    let id = 0;
    const disconnect = vi.fn();
    const host = {
        ResizeObserver: class {
            constructor(callback) { notify = callback; }
            observe() {}
            disconnect = disconnect;
        },
        requestAnimationFrame: callback => { frames.set(++id, callback); return id; },
        cancelAnimationFrame: frame => frames.delete(frame),
    };
    const element = Object.freeze({ get offsetWidth() { return dimensions.width; }, get offsetHeight() { return dimensions.height; } });
    const dimensions = { width: 984, height: 584 };
    const save = vi.fn();
    const stop = observeOverlaySize(element, save, host);
    return { save, stop, dimensions, disconnect, notify: () => notify([{ contentRect: { width: 982, height: 582 } }]), flush: () => { const tasks = [...frames.values()]; frames.clear(); tasks.forEach(callback => callback()); }, frames };
}
it('coalesces resize deliveries and persists the actual constrained border box without changing layout', () => {
    const f = fixture();
    f.notify(); f.notify(); f.notify();
    expect(f.save).not.toHaveBeenCalled();
    expect(f.frames.size).toBe(1);
    f.flush();
    expect(f.save).toHaveBeenCalledExactlyOnceWith(984, 584);
    f.notify(); f.flush();
    expect(f.save).toHaveBeenCalledTimes(1);
    f.dimensions.width = 784; f.dimensions.height = 384;
    f.notify(); f.flush();
    expect(f.save).toHaveBeenLastCalledWith(784, 384);
});
it('ignores hidden cards and cancels pending work on teardown', () => {
    const f = fixture();
    f.dimensions.width = 0; f.dimensions.height = 0;
    f.notify(); f.flush();
    expect(f.save).not.toHaveBeenCalled();
    f.dimensions.width = 700; f.dimensions.height = 400;
    f.notify(); f.stop(); f.flush();
    expect(f.disconnect).toHaveBeenCalledOnce();
    expect(f.save).not.toHaveBeenCalled();
});
it('supports older runtimes without ResizeObserver', () => {
    expect(observeOverlaySize({}, vi.fn(), {})()).toBeUndefined();
});
