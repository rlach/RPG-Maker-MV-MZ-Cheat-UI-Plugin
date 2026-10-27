import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../cheat-engine/www/cheat/js/translation-runtime/TranslationRuntime.js', () => ({
    ensureTranslationRuntime: vi.fn(),
}));
import Snackbar from '../cheat-engine/www/cheat/components/AlertSnackbar.js';
import TagPanel from '../cheat-engine/www/cheat/panels/TranslateTagManagerPanel.js';
import { TagManager } from '../cheat-engine/www/cheat/translate-engines/ai-engine/TagManager.js';
import {
    SIMPLE_NEWLINE_TAG_CONFIG,
    TAG_CONFIGS,
} from '../cheat-engine/www/cheat/translate-engines/ai-engine/constants.js';
import { isolateWindowComponent } from '../cheat-engine/www/cheat/js/WindowUiLibraries.js';
afterEach(() => vi.useRealTimers());
it('isolates cached Vue constructors throughout shared components and mixins', () => {
    const child = { _Ctor: { 0: 'parent constructor' }, methods: { test() {} } };
    const options = {
        _Ctor: { 0: 'parent root' },
        _base: 'parent Vue',
        components: { child },
        mixins: [child],
        extends: child,
    };
    const clone = isolateWindowComponent(options);
    expect(clone._Ctor).toBeUndefined();
    expect(clone._base).toBeUndefined();
    expect(clone.components.child._Ctor).toBeUndefined();
    expect(clone.mixins[0]).toBe(clone.components.child);
    expect(clone.extends).toBe(clone.components.child);
    expect(child._Ctor[0]).toBe('parent constructor');
});
function snackbar() {
    const context = {
        ...Snackbar.data(),
        $nextTick: (callback) => Promise.resolve().then(callback),
    };
    for (const [name, method] of Object.entries(Snackbar.methods))
        context[name] = method.bind(context);
    return context;
}
it('queues notifications with a full independent timeout and ignores stale timeout callbacks', async () => {
    vi.useFakeTimers();
    const component = snackbar();
    component.show({ text: 'First', timeout: 1000 });
    await Promise.resolve();
    const firstId = component.activeNotification.id;
    await vi.advanceTimersByTimeAsync(700);
    component.show({ text: 'Second', timeout: 2000 });
    expect(component.text[0].value).toBe('First');
    await vi.advanceTimersByTimeAsync(300);
    expect(component.text[0].value).toBe('Second');
    component.dismiss(firstId);
    await vi.advanceTimersByTimeAsync(1999);
    expect(component.showSnackbar).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(component.activeNotification).toBeNull();
});
it('keeps persistent notifications until dismissal and clears pending timers on teardown', async () => {
    vi.useFakeTimers();
    const component = snackbar();
    component.show({ text: { text: '<b>HTML</b>', html: true }, timeout: -1 });
    component.show({ text: 'Next', timeout: 500 });
    await vi.advanceTimersByTimeAsync(10000);
    expect(component.text[0].html).toBe(true);
    component.dismiss();
    await Promise.resolve();
    expect(component.text[0].value).toBe('Next');
    Snackbar.beforeDestroy.call(component);
    await vi.advanceTimersByTimeAsync(1000);
    expect(component.activeNotification).toBeNull();
});
it.each(['tags', 'legacy'])(
    'shows the newline source and actual %s encoding separately',
    (format) => {
        const manager = new TagManager(null);
        manager.setTagFormat(format);
        const context = { _runtime: { engine: { tagManager: manager } } };
        expect(TagPanel.methods.formatTagDisplay.call(context, SIMPLE_NEWLINE_TAG_CONFIG)).toBe(
            '\\n'
        );
        expect(TagPanel.methods.formatTagEncoding.call(context, SIMPLE_NEWLINE_TAG_CONFIG)).toBe(
            manager.preprocessTags('\n').preprocessedText
        );
        const variable = TAG_CONFIGS.find((tag) => tag.tagSymbol === 'V');
        expect(TagPanel.methods.formatTagEncoding.call(context, variable).replace('N', '5')).toBe(
            manager.preprocessTags('\\V[5]').preprocessedText
        );
    }
);

it('shows actual masked XML encodings despite their normalized transport brackets', () => {
    const manager = new TagManager(null);
    const tag = {
        tagSymbol: 'Ref',
        style: 'xml',
        type: 'withCustomParameter',
        bracket: 'none',
        maskValue: true,
        requiredConsistency: true,
        description: 'Reference',
    };
    manager.setCustomTagConfigs([tag]);
    const context = { _runtime: { engine: { tagManager: manager } } };
    expect(TagPanel.methods.formatTagEncoding.call(context, tag)).toBe(
        manager.preprocessTags('<Ref:secret>').preprocessedText
    );
});
