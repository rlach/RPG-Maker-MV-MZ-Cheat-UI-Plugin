import { afterEach, expect, it, vi } from 'vitest';
import { translateOnTheFlyMessageMethods } from '../../../../../cheat-engine/www/cheat/js/translation-runtime/TranslateOnTheFlyMessageMethods.js';
afterEach(() => vi.unstubAllGlobals());
it('updates the already rendered MZ speaker box when replacing a speaker', () => {
    vi.stubGlobal('$gameMessage', { _speakerName: 'マーサ' });
    const setName = vi.fn();
    const runtime = { normalizeSpeakerNameCase: value => value, currentMessageWindow: { _nameBoxWindow: { setName } } };
    translateOnTheFlyMessageMethods.replaceSpeakerName.call(runtime, 'Martha');
    expect($gameMessage._speakerName).toBe('Martha');
    expect(setName).toHaveBeenCalledWith('Martha');
});
it('still updates speaker data without an MZ name box', () => {
    vi.stubGlobal('$gameMessage', {});
    translateOnTheFlyMessageMethods.replaceSpeakerName.call({ normalizeSpeakerNameCase: value => value }, 'Martha');
    expect($gameMessage._speakerName).toBe('Martha');
});

it('resolves actor references in MZ speaker fields before actor_name lookup', () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$gameActors', { actor: id => id === 3 ? { name: () => 'マーサ' } : null });
    expect(translateOnTheFlyMessageMethods.resolveSpeakerSourceName('\\N[3]')).toBe('マーサ');
    expect(translateOnTheFlyMessageMethods.resolveSpeakerSourceName('男性')).toBe('男性');
    expect(translateOnTheFlyMessageMethods.resolveSpeakerSourceName('\\N[99]')).toBe('\\N[99]');
});
