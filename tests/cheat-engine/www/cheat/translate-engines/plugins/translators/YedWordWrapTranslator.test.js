import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const RUNTIME_HOOK_GUARD = '__CHEAT_YED_WORD_WRAP_TRANSLATOR_HOOKED__';
const WRAP_TEXT_PATCH_GUARD = '__CHEAT_YED_WORD_WRAP_WRAP_TEXT_PATCHED__';

let YedWordWrapTranslator;

beforeAll(async () => {
    if (!globalThis.window) {
        globalThis.window = globalThis;
    }

    const module =
        await import('../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/YedWordWrapTranslator.js');
    YedWordWrapTranslator = module.YedWordWrapTranslator;
});

function cleanupWrapPatch(runtime) {
    delete globalThis.window[RUNTIME_HOOK_GUARD];

    if (!runtime) {
        return;
    }

    const proto = Object.getPrototypeOf(runtime);
    if (proto && proto[WRAP_TEXT_PATCH_GUARD]) {
        delete proto[WRAP_TEXT_PATCH_GUARD];
    }
}

function createRuntime(overrides = {}) {
    class RuntimeMock {
        wrapText(text) {
            return String(text || '');
        }
    }

    const runtime = new RuntimeMock();
    runtime.translationCache = new Map();
    runtime.enabled = true;
    runtime.translateCacheWhenDisabled = false;
    runtime.isTranslationEnabled = () => true;
    runtime.getPreferredMessageCacheEntry = vi.fn(() => null);
    runtime.hasCurrentMessagePortrait = vi.fn(() => false);

    Object.assign(runtime, overrides);
    return runtime;
}

describe('YedWordWrapTranslator', () => {
    beforeEach(() => {
        delete globalThis.__ensureTranslationRuntime;
        delete globalThis.__TranslationRuntime;
        delete globalThis.window[RUNTIME_HOOK_GUARD];
    });

    it('uses message cache lookup instead of harvesting plugin cache key', () => {
        const runtime = createRuntime({
            getCacheKey: vi.fn(),
            trackCacheKeyUsage: vi.fn(),
        });

        globalThis.__ensureTranslationRuntime = () => runtime;
        const translator = new YedWordWrapTranslator();

        translator.enablePluginTranslation();

        runtime.wrapText('<wrap>"What the, damn it!"\n\n\n', 280, {});

        expect(runtime.getPreferredMessageCacheEntry).toHaveBeenCalledOnce();
        expect(runtime.getPreferredMessageCacheEntry).toHaveBeenCalledWith(
            '<wrap>"What the, damn it!"\n\n\n',
            { hasPortrait: false }
        );
        expect(runtime.getCacheKey).not.toHaveBeenCalled();
        expect(runtime.trackCacheKeyUsage).not.toHaveBeenCalled();

        cleanupWrapPatch(runtime);
    });

    it('does not touch message cache for text without <wrap>', () => {
        const runtime = createRuntime();

        globalThis.__ensureTranslationRuntime = () => runtime;
        const translator = new YedWordWrapTranslator();

        translator.enablePluginTranslation();

        runtime.wrapText('Regular text', 280, {});

        expect(runtime.getPreferredMessageCacheEntry).not.toHaveBeenCalled();

        cleanupWrapPatch(runtime);
    });
});
