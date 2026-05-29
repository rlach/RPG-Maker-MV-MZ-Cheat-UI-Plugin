/**
 * RJ324273 Game-Specific Translator
 *
 * Target plugin:
 * - InfoWindow.js (MV)
 *
 * Translation notes:
 * - The plugin renders a fixed label string in `Window_Info.refresh`.
 * - Runtime hook patches the InfoWindow instance refresh path created by
 *   `Scene_Map.start` and translates only string drawText payloads.
 *
 * Usage: Copy this file to www/cheat-settings/translate-cache/js/
 */

const BasePluginTranslator = globalThis.__CheatBasePluginTranslator;

const CACHE_TYPE = 'plugin_rj324273_info_window';
const SCENE_MAP_START_HOOK_FLAG = '__CHEAT_RJ324273_SCENE_MAP_START_HOOKED__';
const WINDOW_REFRESH_HOOK_FLAG = '__CHEAT_RJ324273_INFO_WINDOW_REFRESH_HOOKED__';
const KNOWN_LABELS = ['日数', '日目', '知識', '好感度', 'エッチ度'];
const OBSERVED_LABELS = new Set(KNOWN_LABELS);

function normalizeString(value) {
    if (typeof value === 'string') {
        return value;
    }

    if (value === null || value === undefined) {
        return '';
    }

    return String(value);
}

function splitLabelAndDynamicValue(text) {
    const source = String(text || '');
    const match = /^(\s*[^\d０-９+-][^\d０-９]*?)([\s\u3000]+[-+]?[\d０-９][\d０-９.,]*(?:[%％])?\s*)$/.exec(
        source
    );
    if (!match) {
        return null;
    }

    const label = String(match[1] || '');
    const suffix = String(match[2] || '');
    const normalizedLabel = label.trim();
    if (!normalizedLabel) {
        return null;
    }

    return {
        label,
        normalizedLabel,
        suffix,
    };
}

function splitDayLineLabelAndDynamicValue(text) {
    const source = String(text || '');
    const match = /^(\s*[-+]?[\d０-９]+\s*)(日目)([\s\u3000].*)$/.exec(source);
    if (!match) {
        return null;
    }

    const prefix = String(match[1] || '');
    const normalizedLabel = String(match[2] || '').trim();
    const suffix = String(match[3] || '');
    if (!normalizedLabel) {
        return null;
    }

    return {
        normalizedLabel,
        rebuild(translatedLabel) {
            return `${prefix}${translatedLabel}${suffix}`;
        },
    };
}

function findKnownLabelPattern(text) {
    const source = String(text || '');
    const trimmed = source.trim();
    if (!trimmed) {
        return null;
    }

    if (KNOWN_LABELS.includes(trimmed)) {
        return {
            normalizedLabel: trimmed,
            rebuild(translatedLabel) {
                return source.replace(trimmed, translatedLabel);
            },
        };
    }

    return null;
}

function extractInfoWindowLabelPattern(text) {
    const dayLinePattern = splitDayLineLabelAndDynamicValue(text);
    if (dayLinePattern) {
        return dayLinePattern;
    }

    const dynamicPattern = splitLabelAndDynamicValue(text);
    if (dynamicPattern) {
        const leadingMatch = /^\s*/.exec(dynamicPattern.label);
        const leading = leadingMatch ? String(leadingMatch[0] || '') : '';
        return {
            normalizedLabel: dynamicPattern.normalizedLabel,
            rebuild(translatedLabel) {
                return `${leading}${translatedLabel}${dynamicPattern.suffix}`;
            },
        };
    }

    return findKnownLabelPattern(text);
}

function translateInfoWindowText(sourceText, runtime, cacheType, resolveRuntimeTranslation, isUsableText, isRuntimeTranslationActive) {
    const pattern = extractInfoWindowLabelPattern(sourceText);
    if (!pattern) {
        if (/[\d０-９]/.test(sourceText)) {
            return sourceText;
        }

        const trimmedSource = String(sourceText || '').trim();
        if (!isUsableText(trimmedSource)) {
            return sourceText;
        }

        OBSERVED_LABELS.add(trimmedSource);
        const staticCacheKey = runtime.getCacheKey(trimmedSource, cacheType);
        runtime.trackCacheKeyUsage(staticCacheKey);

        if (!isRuntimeTranslationActive(runtime)) {
            return sourceText;
        }

        const staticTranslated = resolveRuntimeTranslation(trimmedSource, runtime, cacheType, {
            requireRuntimeTranslationActive: true,
            missValue: trimmedSource,
            harvestMissing: false,
        });

        return isUsableText(staticTranslated) ? sourceText.replace(trimmedSource, staticTranslated) : sourceText;
    }

    const keyText = pattern.normalizedLabel;
    OBSERVED_LABELS.add(keyText);

    const cacheKey = runtime.getCacheKey(keyText, cacheType);
    runtime.trackCacheKeyUsage(cacheKey);

    if (!isRuntimeTranslationActive(runtime)) {
        return sourceText;
    }

    const translated = resolveRuntimeTranslation(keyText, runtime, cacheType, {
        requireRuntimeTranslationActive: true,
        missValue: keyText,
        harvestMissing: false,
    });

    if (isUsableText(translated)) {
        return pattern.rebuild(translated);
    }

    return sourceText;
}

export class RJ324273Translator extends BasePluginTranslator {
    getPluginName() {
        return 'InfoWindow';
    }

    getPluginLabel() {
        return 'RJ324273 InfoWindow';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    detectPlugin() {
        return true;
    }

    enablePluginTranslation() {
        const sceneMapProto = globalThis.Scene_Map?.prototype;
        if (!sceneMapProto || typeof sceneMapProto.start !== 'function') {
            return false;
        }

        if (!sceneMapProto[SCENE_MAP_START_HOOK_FLAG]) {
            const originalStart = sceneMapProto.start;
            const patchInfoWindowInstance = this.patchInfoWindowInstance.bind(this);

            sceneMapProto.start = function () {
                const result = originalStart.apply(this, arguments);
                patchInfoWindowInstance(this._InfoWindow);
                return result;
            };

            Object.defineProperty(sceneMapProto, SCENE_MAP_START_HOOK_FLAG, {
                value: true,
                configurable: true,
                enumerable: false,
                writable: false,
            });
        }

        this.patchInfoWindowInstance(globalThis.SceneManager?._scene?._InfoWindow);
        return true;
    }

    patchInfoWindowInstance(windowInstance) {
        if (!windowInstance) {
            return;
        }

        const infoWindowProto = Object.getPrototypeOf(windowInstance);
        if (!infoWindowProto || typeof infoWindowProto.refresh !== 'function') {
            return;
        }

        if (infoWindowProto[WINDOW_REFRESH_HOOK_FLAG]) {
            return;
        }

        const originalRefresh = infoWindowProto.refresh;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);
        const isUsableText = this.isUsableText.bind(this);
        const cacheType = this.getCacheType();

        infoWindowProto.refresh = function () {
            const runtime = getRuntime();
            if (!runtime) {
                return originalRefresh.apply(this, arguments);
            }

            const originalDrawText = this.drawText;
            this.drawText = function (text, x, y, maxWidth, align) {
                let nextText = text;

                if (isUsableText(text)) {
                    const sourceText = normalizeString(text);
                    nextText = translateInfoWindowText(
                        sourceText,
                        runtime,
                        cacheType,
                        resolveRuntimeTranslation,
                        isUsableText,
                        isRuntimeTranslationActive
                    );
                }

                return originalDrawText.call(this, nextText, x, y, maxWidth, align);
            };

            try {
                return originalRefresh.apply(this, arguments);
            } finally {
                this.drawText = originalDrawText;
            }
        };

        Object.defineProperty(infoWindowProto, WINDOW_REFRESH_HOOK_FLAG, {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    async precomputeCounts() {
        return;
    }

    collectUntranslated({ runtime } = {}) {
        if (!runtime) {
            return [];
        }

        const output = [];
        const byKey = new Set();
        for (const text of OBSERVED_LABELS) {
            const key = String(text || '').trim();
            if (!key) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(key, this.getCacheType());
            if (byKey.has(cacheKey) || runtime.hasUsableCacheValue(cacheKey)) {
                continue;
            }

            byKey.add(cacheKey);
            output.push({
                type: this.getCacheType(),
                id: `plugin_rj324273_info_window_${output.length}`,
                value: key,
                cacheKey,
            });
        }

        return output;
    }

    getCachedCountsSync({ runtime } = {}) {
        if (!runtime) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        const seen = new Set();
        let totalStrings = 0;
        let leftStrings = 0;

        for (const text of OBSERVED_LABELS) {
            const key = String(text || '').trim();
            if (!key) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(key, this.getCacheType());
            if (seen.has(cacheKey)) {
                continue;
            }

            seen.add(cacheKey);
            totalStrings += 1;
            if (!runtime.hasUsableCacheValue(cacheKey)) {
                leftStrings += 1;
            }
        }

        return {
            total: totalStrings,
            left: leftStrings,
            totalStrings,
            leftStrings,
        };
    }
}
