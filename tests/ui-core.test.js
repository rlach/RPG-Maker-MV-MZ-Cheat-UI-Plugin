import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../cheat-engine/www/cheat/js/translation-runtime/TranslationRuntime.js', () => ({
    ensureTranslationRuntime: vi.fn(),
}));
import Snackbar from '../cheat-engine/www/cheat/components/AlertSnackbar.js';
import { Alert } from '../cheat-engine/www/cheat/js/AlertHelper.js';
import { BatchSummaryReporter } from '../cheat-engine/www/cheat/translate-engines/batch-manager/BatchSummaryReporter.js';
import TagPanel from '../cheat-engine/www/cheat/panels/TranslateTagManagerPanel.js';
import { TagManager } from '../cheat-engine/www/cheat/translate-engines/ai-engine/TagManager.js';
import {
    SIMPLE_NEWLINE_TAG_CONFIG,
    TAG_CONFIGS,
} from '../cheat-engine/www/cheat/translate-engines/ai-engine/constants.js';
import { isolateWindowComponent } from '../cheat-engine/www/cheat/js/WindowUiLibraries.js';
afterEach(() => vi.useRealTimers());
it('isolates compiled Vue render functions throughout shared components and mixins', () => {
    const render = () => null;
    const child = { template: '<span/>', render, methods: { test() {} } };
    const options = {
        template: '<div/>',
        render,
        components: { child },
        mixins: [child],
        extends: child,
    };
    const clone = isolateWindowComponent(options);
    expect(clone.render).toBeUndefined();
    expect(clone.components.child.render).toBeUndefined();
    expect(clone.mixins[0]).toBe(clone.components.child);
    expect(clone.extends).toBe(clone.components.child);
    expect(child.render).toBe(render);
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
it('shows the original translation summary as a warning when cache suspicions exist', () => {
    const warning = vi.spyOn(Alert, 'warn').mockImplementation(() => {});
    try {
        const summary = BatchSummaryReporter.buildSummary({ totalItems: 2, successes: 2 });
        BatchSummaryReporter.showAlert(summary, 3);
        expect(warning).toHaveBeenCalledWith(
            '[BatchSummary]\nsuccess: 2/2 (100%)\n3 suspicious translations',
            null,
            5000
        );
    } finally {
        warning.mockRestore();
    }
});
it('holds translation errors and queued alerts until the user dismisses the error', async () => {
    vi.useFakeTimers();
    const component = snackbar();
    Snackbar.mounted.call(component);
    try {
        const summary = BatchSummaryReporter.buildSummary({
            totalItems: 2,
            successes: 1,
            failures: 1,
        });
        BatchSummaryReporter.showAlert(summary);
        Alert.info('Queued information', null, 1000);
        await vi.advanceTimersByTimeAsync(60000);
        expect(component.color).toBe('red');
        expect(component.activeNotification).not.toBeNull();
        expect(component.notifications).toHaveLength(1);
        component.dismiss();
        await Promise.resolve();
        expect(component.text[0].value).toBe('Queued information');
        await vi.advanceTimersByTimeAsync(1000);
        expect(component.activeNotification).toBeNull();
    } finally {
        Snackbar.beforeUnmount.call(component);
    }
});
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
    Snackbar.beforeUnmount.call(component);
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

it('reports completed translations as success while preserving recovery diagnostics', () => {
    const summary = BatchSummaryReporter.buildSummary({
        totalItems: 2,
        successes: 2,
        failures: 0,
        currentPhaseErrors: 3,
        totalCumulativeErrors: 12938,
        errorStats: { recoveryAttempts: 12938, recoveredErrors: 2, byType: { invalid_json: 3 } },
    });
    expect(summary.hasErrors).toBe(false);
    expect(summary.message).toContain('recovery strategy uses: 12938');
    expect(summary.message).toContain('invalid_json: 3');
    expect(
        BatchSummaryReporter.buildSummary({ totalItems: 2, successes: 1, failures: 0 }).hasErrors
    ).toBe(true);
});

it('reports a completed dry run with its own pending-key summary', () => {
    const input = {
        totalItems: 3,
        successes: 0,
        failures: 3,
        totalCumulativeErrors: 3,
        errorStats: { byType: { dry_run: 3 } },
    };
    const dry = BatchSummaryReporter.buildSummary({ ...input, dryRun: true });
    expect(dry.hasErrors).toBe(false);
    expect(dry.title).toBe('[DryRunSummary]');
    expect(dry.uniquePendingKeys).toBe(3);
    expect(dry.message).not.toContain('errors:');
    expect(BatchSummaryReporter.buildSummary(input).hasErrors).toBe(true);
});

it('counts dry-run keys once across phases and excludes keys already translated', () => {
    const dry = BatchSummaryReporter.buildSummary({
        dryRun: true,
        totalItems: 13000,
        dryRunItems: [
            { cacheKey: 'a' },
            { cacheKey: 'a' },
            { cacheKey: 'b' },
            { cacheKey: 'done' },
            { cacheKey: 'b' },
        ],
        runtime: { hasUsableCacheValue: (key) => key === 'done' },
    });
    expect(dry.uniquePendingKeys).toBe(2);
    expect(dry.message).toBe('Dry run completed.\nUnique keys awaiting translation: 2');
    expect(dry.hasErrors).toBe(false);
});
