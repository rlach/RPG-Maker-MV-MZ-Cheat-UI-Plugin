import { describe, expect, it } from 'vitest';
import {
    getMessageSourceTextVariants,
    buildMessageCacheLookupKeys,
} from '../../../../../../cheat-engine/www/cheat/js/MessageCacheKeyHelper.js';

function makeCacheKey(text, type) {
    return `${type}:ja-en-${text}`;
}

describe('MessageCacheKeyHelper', () => {
    it('adds IDSP fallback variant for control-tag-leading text', () => {
        const source = '\\SM[shake]めぐる\n「いっいだいっ……！ や、やめて……！」';
        const variants = getMessageSourceTextVariants(source);

        expect(variants).toContain(source);
        expect(variants).toContain(`\u3000${source}`);
    });

    it('does not add IDSP fallback for regular indented text', () => {
        const source = '\u3000Plain dialogue line';
        const variants = getMessageSourceTextVariants(source);

        expect(variants).toEqual([source]);
    });

    it('builds lookup keys that include no-IDSP cache key for IDSP runtime text', () => {
        const baseText = '\\SM[shake]めぐる\n「いっいだいっ……！ や、やめて……！」';
        const runtimeSeenText = `\u3000${baseText}`;
        const lookupKeys = buildMessageCacheLookupKeys(makeCacheKey, runtimeSeenText, false);

        expect(lookupKeys).toContain(makeCacheKey(baseText, 'message'));
        expect(lookupKeys).toContain(makeCacheKey(runtimeSeenText, 'message'));
    });
});
