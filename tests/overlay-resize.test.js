import { expect, it, vi } from 'vitest';
import { observeOverlaySize } from '../cheat-engine/www/cheat/js/OverlayResize.js';

function fixture() {
    let notify;
    const disconnect = vi.fn();
    const host = {
        MutationObserver: class {
            constructor(callback) {
                notify = callback;
            }
            observe() {}
            disconnect = disconnect;
        },
    };
    const element = {
        style: { width: '700px', height: '400px' },
        offsetWidth: 700,
        offsetHeight: 400,
    };
    const save = vi.fn();
    const stop = observeOverlaySize(element, save, host);
    return { element, save, stop, disconnect, notify };
}

it('persists native resize dimensions and ignores temporary viewport clamping', () => {
    const { element, save, notify } = fixture();
    Object.assign(element.style, { width: '1400px', height: '800px' });
    notify();
    expect(save).toHaveBeenCalledExactlyOnceWith(1400, 800);

    Object.assign(element, { offsetWidth: 784, offsetHeight: 384 });
    notify();
    expect(save).toHaveBeenCalledTimes(1);
});

it('captures an undelivered native resize when the overlay closes', () => {
    const { element, save, stop, disconnect } = fixture();
    element.style.height = '840px';
    stop();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledExactlyOnceWith(700, 840);
});

it('supports older runtimes without MutationObserver', () => {
    expect(observeOverlaySize({}, vi.fn(), {})()).toBeUndefined();
});
