import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import {
    previewNamePatternRepair,
    applyNamePatternRepair,
} from '../cheat-engine/www/cheat/js/NamePatternCacheRepair.js';
import { Alert } from '../cheat-engine/www/cheat/js/AlertHelper.js';
const state = vi.hoisted(() => ({ runtime: null }));
vi.mock('../cheat-engine/www/cheat/js/translation-runtime/TranslationRuntime.js', () => ({
    ensureTranslationRuntime: () => state.runtime,
}));
let runtime;
const pattern = String.raw`\\n\<([^<>]+)\>`;
beforeEach(() => {
    runtime = {
        sourceLang: 'ja',
        targetLang: 'en',
        translationCache: new Map([
            ['actor_name:ja-en-ユージン', 'Eugene'],
            ['actor_name:ja-en-John', 'John'],
            ['message:ja-en-one', '\\N<ユージン>Ugh...\\!Nggghhh...! ユージン'],
            ['message:ja-en-two', '\\N<John>Hello'],
            ['message:ja-en-three', '\\N<未知>Hi'],
            ['message:ja-fr-other', '\\N<ユージン>Bonjour'],
        ]),
        persistCache: vi.fn(),
        notifyCacheRuntime: vi.fn(),
    };
    state.runtime = runtime;
    vi.stubGlobal('window', { Alert: { info: vi.fn(), error: vi.fn() } });
    vi.spyOn(Alert, 'info').mockImplementation(() => {});
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

it('previews only real active-pair changes and replaces group 1 without touching dialogue or keys', () => {
    const before = new Map(runtime.translationCache);
    const plan = previewNamePatternRepair(runtime, pattern);
    expect(plan.changes).toEqual([
        {
            cacheKey: 'message:ja-en-one',
            before: '\\N<ユージン>Ugh...\\!Nggghhh...! ユージン',
            after: '\\N<Eugene>Ugh...\\!Nggghhh...! ユージン',
        },
    ]);
    expect(runtime.translationCache).toEqual(before);
    expect(runtime.persistCache).not.toHaveBeenCalled();
    expect(applyNamePatternRepair(runtime, plan)).toBe(1);
    expect([...runtime.translationCache.keys()]).toEqual([...before.keys()]);
    expect(runtime.persistCache).toHaveBeenCalledWith(['message:ja-en-one']);
});

it('supports hand-entered patterns, repeated names and exact capture positions', () => {
    runtime.translationCache.set('message:ja-en-custom', 'ユージン:ユージン; ユージン:ユージン');
    const plan = previewNamePatternRepair(runtime, 'ユージン:(ユージン)');
    expect(plan.changes[0].after).toBe('ユージン:Eugene; ユージン:Eugene');
    runtime.translationCache.set('message:ja-en-spaces', '<  ユージン  >');
    expect(previewNamePatternRepair(runtime, '<([^<>]+)>').changes.at(-1).after).toBe(
        '<  Eugene  >'
    );
    expect(previewNamePatternRepair(runtime, '()').changes).toEqual([]);
    expect(() => previewNamePatternRepair(runtime, '[')).toThrow();
});

it('uses official profile precedence and leaves concurrently edited values untouched', () => {
    runtime.nameProfilesByLangPair = { 'ja-en': { ユージン: { translation: 'Official Eugene' } } };
    const plan = previewNamePatternRepair(runtime, pattern);
    expect(plan.changes[0].after).toContain('<Official Eugene>');
    runtime.translationCache.set('message:ja-en-one', 'New edit');
    expect(applyNamePatternRepair(runtime, plan)).toBe(0);
    expect(runtime.translationCache.get('message:ja-en-one')).toBe('New edit');
    runtime.targetLang = 'fr';
    expect(() => applyNamePatternRepair(runtime, plan)).toThrow('Language pair changed');
});

it('opens an accurate confirmation without writes and applies only through the confirm action', async () => {
    const panel = (await import('../cheat-engine/www/cheat/panels/TranslateNamesPanel.js')).default;
    const context = { namePattern: pattern, refresh: vi.fn() };
    panel.methods.previewPatternNameRepair.call(context);
    expect(context.nameRepairOpen).toBe(true);
    expect(context.nameRepairPreview.count).toBe(1);
    expect(context.nameRepairPreview.before).not.toBe(context.nameRepairPreview.after);
    expect(runtime.persistCache).not.toHaveBeenCalled();
    context.nameRepairOpen = false; // Dismissing the dialog is read-only.
    expect(runtime.persistCache).not.toHaveBeenCalled();
    panel.methods.previewPatternNameRepair.call(context);
    panel.methods.applyPatternNameRepair.call(context);
    expect(runtime.persistCache).toHaveBeenCalledOnce();
    expect(context.nameRepairOpen).toBe(false);
});

it('always opens a visible result or error when the window has no Alert global', async () => {
    window.Alert = undefined;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const panel = (await import('../cheat-engine/www/cheat/panels/TranslateNamesPanel.js')).default;
    const context = { namePattern: 'DOES_NOT_MATCH', refresh: vi.fn() };
    panel.methods.previewPatternNameRepair.call(context);
    expect(context.nameRepairOpen).toBe(true);
    expect(context.nameRepairPreview.count).toBe(0);
    context.namePattern = '[';
    panel.methods.previewPatternNameRepair.call(context);
    expect(context.nameRepairOpen).toBe(true);
    expect(context.nameRepairError).toContain('Cannot preview');
    expect(context._namePatternRepairPlan).toBeNull();
    expect(runtime.persistCache).not.toHaveBeenCalled();
});

it('supports NW.js without match indices while preserving capture offsets and backreferences', () => {
    const NativeRegExp = RegExp;
    vi.stubGlobal('RegExp', function (value, flags) {
        if (flags?.includes('d')) throw new SyntaxError('Unsupported d flag');
        return new NativeRegExp(value, flags);
    });
    expect(previewNamePatternRepair(runtime, pattern).changes[0].after).toContain('\\N<Eugene>');
    runtime.translationCache.set('message:ja-en-custom', 'ユージン:ユージン-xx');
    const plan = previewNamePatternRepair(runtime, String.raw`ユージン:(ユージン)-(x)\2`);
    expect(plan.changes[0].after).toBe('ユージン:Eugene-xx');
    runtime.translationCache.set('message:ja-en-octal', 'ユージン:\u0002');
    expect(previewNamePatternRepair(runtime, String.raw`(ユージン):\2`).changes[0].after).toBe(
        'Eugene:\u0002'
    );
    expect(
        previewNamePatternRepair(runtime, String.raw`(?<name>ユージン):`).changes.some((change) =>
            change.after.startsWith('Eugene:')
        )
    ).toBe(true);
});
