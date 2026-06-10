import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock(
    '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/PluginTranslatorRegistry.js',
    () => ({
        PLUGIN_TRANSLATOR_REGISTRY: {
            buildEventCommandTraversalOptions: vi.fn(() => ({})),
            resolveMessageCacheSourceText: vi.fn(({ text }) => text),
            ensureDetectionStarted: vi.fn(),
            getDetectedTranslatorInstances: vi.fn(() => []),
        },
    })
);

import { CurrentEvent } from '../../../../../../../cheat-engine/www/cheat/translate-engines/translation-phases/CurrentEvent.js';

function buildShowTextEvent(messageTexts) {
    const list = [];

    for (const text of messageTexts) {
        list.push({ code: 101, parameters: ['', 0, 0, 2, ''] });
        list.push({ code: 401, parameters: [text] });
    }

    return list;
}

function createRuntime({ list, startIndex, charLimit = 20, failedCacheKeys = [] }) {
    const interpreter = {
        _list: list,
        _index: startIndex,
        _waitMode: 'message',
        isRunning() {
            return true;
        },
    };

    const runtime = {
        charLimit,
        batchItemsLimit: 999,
        pendingTranslations: new Map(),
        failedTranslations: new Map(),
        translationCache: new Map(),
        currentGameMessage: null,
        findMessageInterpreter() {
            return interpreter;
        },
        resolveOriginalMessageContext(currentText, currentSpeaker) {
            return {
                text: currentText,
                speaker: currentSpeaker || '',
            };
        },
        getMessageCacheType() {
            return 'message';
        },
        isMessageCacheType(type) {
            return type === 'message' || type === 'message_portrait';
        },
        getMessageCacheLookupKeys(value, options = {}) {
            const primary = this.getMessageCacheKey(value, options);
            return [primary];
        },
        getMessageCacheKey(value, options = {}) {
            const type = options.hasPortrait ? 'message_portrait' : 'message';
            return this.getCacheKey(value, type);
        },
        getCacheKey(value, type) {
            return `${type}:ja-en:${value}`;
        },
        hasUsableCacheValue(cacheKey) {
            return this.translationCache.has(cacheKey) && this.translationCache.get(cacheKey) !== '';
        },
    };

    for (const key of failedCacheKeys) {
        runtime.failedTranslations.set(key, Date.now());
    }

    return runtime;
}

describe('CurrentEvent translateAhead from middle of event', () => {
    beforeEach(() => {
        globalThis.window = globalThis;
        globalThis.$gameMessage = {
            isChoice: () => false,
            choices: () => [],
            _translateOriginalChoices: null,
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete globalThis.window;
        delete globalThis.$gameMessage;
    });

    it('collects from landing point to end, then wraps to start until char limit', () => {
        const messages = ['M01', 'M02', 'M03', 'M04', 'M05', 'M06', 'M07', 'M08'];
        const list = buildShowTextEvent(messages);

        // We enter event in the middle (message 05 line command index).
        const runtime = createRuntime({
            list,
            startIndex: 9,
            charLimit: 15,
        });

        const strategy = CurrentEvent.getInstance().configure({
            currentText: 'M05',
            currentSpeakerName: '',
            maxDepth: 999,
            messageHasPortrait: false,
        });

        const items = strategy.collectUntranslated({ runtime });
        const messageValues = items.filter((item) => item.type === 'message').map((item) => item.value);

        expect(messageValues).toEqual(['M05', 'M06', 'M07', 'M08', 'M01']);
    });

    it('does not drop ahead messages only because they were previously marked as failed', () => {
        const messages = ['A01', 'A02', 'A03', 'A04', 'A05', 'A06'];
        const list = buildShowTextEvent(messages);

        const failedKeys = ['A02', 'A03', 'A04', 'A05', 'A06'].map(
            (text) => `message:ja-en:${text}`
        );

        const runtime = createRuntime({
            list,
            startIndex: 1,
            charLimit: 30,
            failedCacheKeys: failedKeys,
        });

        const strategy = CurrentEvent.getInstance().configure({
            currentText: 'A01',
            currentSpeakerName: '',
            maxDepth: 999,
            messageHasPortrait: false,
        });

        const items = strategy.collectUntranslated({ runtime });
        const messageValues = items.filter((item) => item.type === 'message').map((item) => item.value);

        expect(messageValues).toContain('A02');
        expect(messageValues).toContain('A03');
        expect(messageValues).toContain('A04');
    });

    it('wraps from end to start when entering near the end with limited budget', () => {
        const messages = Array.from({ length: 30 }, (_, idx) => {
            return `N${String(idx + 1).padStart(2, '0')}`;
        });
        const list = buildShowTextEvent(messages);

        // Enter close to the end (message 25 line command index).
        // Budget fits 8 short messages, so expected: 25-30 then 01-02.
        const runtime = createRuntime({
            list,
            startIndex: 49,
            charLimit: 24,
        });

        const strategy = CurrentEvent.getInstance().configure({
            currentText: 'N25',
            currentSpeakerName: '',
            maxDepth: 999,
            messageHasPortrait: false,
        });

        const items = strategy.collectUntranslated({ runtime });
        const messageValues = items.filter((item) => item.type === 'message').map((item) => item.value);

        expect(messageValues).toEqual(['N25', 'N26', 'N27', 'N28', 'N29', 'N30', 'N01', 'N02']);
    });
});
