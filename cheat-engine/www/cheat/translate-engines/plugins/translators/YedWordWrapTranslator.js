import { BasePluginTranslator } from '../BasePluginTranslator.js';

const RUNTIME_HOOK_GUARD = '__CHEAT_YED_WORD_WRAP_TRANSLATOR_HOOKED__';
const WRAP_TEXT_PATCH_GUARD = '__CHEAT_YED_WORD_WRAP_WRAP_TEXT_PATCHED__';
const WRAP_TAG_RE = /<wrap>/i;
const BR_TAG_RE = /<br\s*\/?>/gi;

function resolveRuntime() {
    const ensureRuntime = globalThis['__ensureTranslationRuntime'];
    if (typeof ensureRuntime === 'function') {
        return ensureRuntime();
    }

    return globalThis['__TranslationRuntime'] || null;
}

function isRuntimeTranslationActive(runtime) {
    if (!runtime) {
        return false;
    }

    const translationEnabled =
        typeof runtime.isTranslationEnabled === 'function'
            ? !!runtime.isTranslationEnabled()
            : !!runtime.enabled;

    return translationEnabled || !!runtime.translateCacheWhenDisabled;
}

function tokenizeByBrTag(text) {
    const input = String(text || '');
    const tokens = [];
    let cursor = 0;
    let match = null;

    BR_TAG_RE.lastIndex = 0;

    while ((match = BR_TAG_RE.exec(input)) !== null) {
        const index = Number(match.index) || 0;
        tokens.push({ type: 'text', value: input.slice(cursor, index) });
        tokens.push({ type: 'br', value: match[0] });
        cursor = BR_TAG_RE.lastIndex;
    }

    tokens.push({ type: 'text', value: input.slice(cursor) });
    return tokens;
}

function wrapSegmentTextByBrOnly(runtimeContext, originalWrapText, text, maxWidth, options) {
    const segments = String(text || '').split('\n');
    let rebuilt = '';

    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const wrappedSegment = originalWrapText.call(runtimeContext, segment, maxWidth, options);
        const wrappedLines = String(wrappedSegment || '').split('\n');
        rebuilt += wrappedLines.join('<br>');

        // Keep original newlines untouched.
        if (i < segments.length - 1) {
            rebuilt += '\n';
        }
    }

    return rebuilt;
}

export class YedWordWrapTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'YED_WordWrap';
    }

    getPluginLabel() {
        return 'YED WordWrap';
    }

    getCacheType() {
        return 'plugin_yed_word_wrap';
    }

    enablePluginTranslation() {
        if (window[RUNTIME_HOOK_GUARD]) {
            return;
        }

        const runtime = resolveRuntime();
        if (!runtime || typeof runtime.wrapText !== 'function') {
            return;
        }

        const runtimeProto = Object.getPrototypeOf(runtime);
        if (!runtimeProto || typeof runtimeProto.wrapText !== 'function') {
            return;
        }

        if (runtimeProto[WRAP_TEXT_PATCH_GUARD]) {
            window[RUNTIME_HOOK_GUARD] = true;
            return;
        }

        const cacheType = this.getCacheType();
        const originalWrapText = runtimeProto.wrapText;

        runtimeProto.wrapText = function (text, maxWidth, options = {}) {
            const sourceText = String(text || '');
            if (!sourceText || !WRAP_TAG_RE.test(sourceText)) {
                return originalWrapText.call(this, text, maxWidth, options);
            }

            try {
                const activeRuntime = resolveRuntime();
                if (!isRuntimeTranslationActive(activeRuntime)) {
                    return originalWrapText.call(this, text, maxWidth, options);
                }

                if (
                    activeRuntime &&
                    typeof activeRuntime.getCacheKey === 'function' &&
                    typeof activeRuntime.markCacheKeySeen === 'function'
                ) {
                    const cacheKey = activeRuntime.getCacheKey(sourceText, cacheType);
                    activeRuntime.markCacheKeySeen(cacheKey);
                }

                const tokens = tokenizeByBrTag(sourceText);
                const rebuilt = tokens
                    .map((token) => {
                        if (token.type === 'br') {
                            return token.value;
                        }

                        return wrapSegmentTextByBrOnly(
                            this,
                            originalWrapText,
                            token.value,
                            maxWidth,
                            options
                        );
                    })
                    .join('');

                return rebuilt;
            } catch (error) {
                console.warn('[YedWordWrapTranslator] Failed to apply <br>-aware wrapping', error);
                return originalWrapText.call(this, text, maxWidth, options);
            }
        };

        runtimeProto[WRAP_TEXT_PATCH_GUARD] = true;
        window[RUNTIME_HOOK_GUARD] = true;
    }

    async prepareTranslator() {
        return;
    }

    async buildScanEntries() {
        return [];
    }

    collectUntranslated() {
        return [];
    }

    countPluginAmountSync() {
        return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
    }
}
