import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RUNTIME_DIR = join(
    __dirname,
    '../../../../../../cheat-engine/www/cheat/js/translation-runtime'
);

describe('TranslationRuntime contract', () => {
    describe('notify system', () => {
        it('dispatches notifications to subscribed listeners', async () => {
            const { TranslationRuntime } = await importRuntime();
            const runtime = new TranslationRuntime();
            const calls = [];

            runtime.onNotify((level, msg) => calls.push({ level, msg }));
            runtime.notify('warn', 'test warning');
            runtime.notify('error', 'test error');

            expect(calls).toEqual([
                { level: 'warn', msg: 'test warning' },
                { level: 'error', msg: 'test error' },
            ]);
        });

        it('onNotify returns unsubscribe function', async () => {
            const { TranslationRuntime } = await importRuntime();
            const runtime = new TranslationRuntime();
            const calls = [];

            const unsub = runtime.onNotify((level, msg) => calls.push(msg));
            runtime.notify('info', 'before');
            unsub();
            runtime.notify('info', 'after');

            expect(calls).toEqual(['before']);
        });

        it('offNotify removes listener', async () => {
            const { TranslationRuntime } = await importRuntime();
            const runtime = new TranslationRuntime();
            const calls = [];

            const listener = (level, msg) => calls.push(msg);
            runtime.onNotify(listener);
            runtime.notify('info', 'first');
            runtime.offNotify(listener);
            runtime.notify('info', 'second');

            expect(calls).toEqual(['first']);
        });

        it('supports multiple listeners', async () => {
            const { TranslationRuntime } = await importRuntime();
            const runtime = new TranslationRuntime();
            const a = [];
            const b = [];

            runtime.onNotify((level, msg) => a.push(msg));
            runtime.onNotify((level, msg) => b.push(msg));
            runtime.notify('info', 'hello');

            expect(a).toEqual(['hello']);
            expect(b).toEqual(['hello']);
        });
    });

    describe('message skip provider', () => {
        it('defaults to false', async () => {
            const { TranslationRuntime } = await importRuntime();
            const runtime = new TranslationRuntime();

            expect(runtime._isMessageSkipActive()).toBe(false);
        });

        it('uses injected provider', async () => {
            const { TranslationRuntime } = await importRuntime();
            const runtime = new TranslationRuntime();

            runtime.setMessageSkipProvider(() => true);
            expect(runtime._isMessageSkipActive()).toBe(true);

            runtime.setMessageSkipProvider(() => false);
            expect(runtime._isMessageSkipActive()).toBe(false);
        });
    });

    describe('queue ETA', () => {
        it('uses queue char progress rather than cache completion', async () => {
            const { TranslationRuntime } = await importRuntime();
            const runtime = new TranslationRuntime();

            runtime.dryRunExecutedAtLeastOnce = true;
            runtime.batchThroughputSamples = [100];
            runtime.startQueueCompletionScope(['gameArrays'], 1000);
            runtime.markQueueCompletionItemsProcessed([
                {
                    value: 'x'.repeat(400),
                },
            ]);

            expect(runtime.getOverallTranslationCompletionLine()).toBe(
                'total 40.0% complete (ETA 6s)'
            );
        });
    });

    describe('architectural boundaries', () => {
        it('runtime files do not import AlertHelper', () => {
            assertNoImportInRuntimeFiles('AlertHelper');
        });

        it('runtime files do not import CheatHelper for MessageCheat', () => {
            assertNoImportInRuntimeFiles('MessageCheat');
        });

        it('runtime files do not import from panels/', () => {
            assertNoImportInRuntimeFiles("from '../panels/");
            assertNoImportInRuntimeFiles("from '../../panels/");
        });
    });
});

function assertNoImportInRuntimeFiles(pattern) {
    const files = readdirSync(RUNTIME_DIR).filter((f) => f.endsWith('.js'));

    for (const file of files) {
        const content = readFileSync(join(RUNTIME_DIR, file), 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith('import') && line.includes(pattern)) {
                throw new Error(
                    `${file}:${i + 1} imports forbidden pattern "${pattern}":\n  ${line}`
                );
            }
        }
    }
}

async function importRuntime() {
    // Dynamic import to allow test-level mocking of dependencies
    vi.stubGlobal('window', {
        ...globalThis,
        __CHEAT_EXTERNAL_WINDOW__: false,
    });

    const mod = await import(
        '../../../../../../cheat-engine/www/cheat/js/translation-runtime/TranslationRuntime.js'
    );
    return mod;
}
