import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let MessageWindowNarrowTranslator;
let runtime;
let translator;
let loadPicture;
const sourceName = '\u5802\u5b89 \u6c99\u7e54';
const header = (name) => `\u3010${name}\u3011`;

beforeAll(async () => {
    globalThis.window = globalThis;
    ({ MessageWindowNarrowTranslator } =
        await import('../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/MessageWindowNarrowTranslator.js'));
});

beforeEach(() => {
    runtime = {
        enabled: true,
        translationCache: new Map(),
        getCacheKey: (text, type) => `${type}:ja-en-${text}`,
        trackCacheKeyUsage: vi.fn(),
    };
    globalThis.__TranslationRuntime = runtime;
    delete globalThis.__ensureTranslationRuntime;
    globalThis.$gameMessage = {
        _translateOriginalText: `${header(sourceName)}Original dialogue`,
        allText: () => `${header('Saori Doan')}Translated dialogue`,
    };
    loadPicture = vi.fn(() => 'bitmap');
    globalThis.ImageManager = { loadPicture };
    translator = new MessageWindowNarrowTranslator();
});

describe('MessageWindowNarrowTranslator', () => {
    it('restores the authored filename and preserves arguments, receiver and dialogue', () => {
        translator.enablePluginTranslation();
        expect(ImageManager.loadPicture('UI_name_Saori Doan', 20)).toBe('bitmap');
        expect(loadPicture).toHaveBeenCalledWith(`UI_name_${sourceName}`, 20);
        expect(loadPicture.mock.contexts[0]).toBe(ImageManager);
        expect($gameMessage.allText()).toBe(`${header('Saori Doan')}Translated dialogue`);
    });

    it('preserves literal actor escape identifiers as the plugin does', () => {
        $gameMessage._translateOriginalText = `${header('\\N[1]')}Original`;
        expect(translator.resolvePictureName('Saori Doan', runtime)).toBe('N[1]');
    });

    it.each(['message', 'message_portrait'])(
        'resolves %s cache and tracks only original keys',
        (type) => {
            delete $gameMessage._translateOriginalText;
            const key = runtime.getCacheKey(`${header(sourceName)}Original`, type);
            runtime.translationCache.set(key, `${header('Saori Doan')}Translated`);
            expect(translator.resolvePictureName('Saori Doan', runtime)).toBe(sourceName);
            expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith(key, { harvestMissing: false });
        }
    );

    it('ignores other language pairs and refuses ambiguous reverse matches', () => {
        delete $gameMessage._translateOriginalText;
        runtime.translationCache.set(
            `message:ja-fr-${header(sourceName)}Original`,
            `${header('Saori Doan')}Text`
        );
        expect(translator.resolvePictureName('Saori Doan', runtime)).toBe('Saori Doan');
        for (const name of [sourceName, 'Other person']) {
            runtime.translationCache.set(
                runtime.getCacheKey(`${header(name)}Original`, 'message'),
                `${header('Saori Doan')}Text`
            );
        }
        expect(translator.resolvePictureName('Saori Doan', runtime)).toBe('Saori Doan');
        expect(runtime.trackCacheKeyUsage).not.toHaveBeenCalled();
    });

    it('respects inactive translation and the runtime cache-only flag', () => {
        translator.enablePluginTranslation();
        runtime.enabled = false;
        ImageManager.loadPicture('UI_name_Saori Doan');
        expect(loadPicture).toHaveBeenLastCalledWith('UI_name_Saori Doan');
        runtime.enableTranslation = true;
        ImageManager.loadPicture('UI_name_Saori Doan');
        expect(loadPicture).toHaveBeenLastCalledWith(`UI_name_${sourceName}`);
        ImageManager.loadPicture('Background');
        expect(loadPicture).toHaveBeenLastCalledWith('Background');
    });

    it('requests retry until the picture loader exists', () => {
        delete globalThis.ImageManager;
        expect(translator.enablePluginTranslation()).toBe(false);
    });
});
