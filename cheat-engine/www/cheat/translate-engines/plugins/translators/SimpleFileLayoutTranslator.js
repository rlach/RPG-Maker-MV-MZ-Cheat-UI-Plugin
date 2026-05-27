/**
 * SimpleFileLayoutTranslator
 *
 * Translator for SimpleFileLayout.js
 * Supported versions:
 * - v1.0.0 - v1.0.3 (MV)
 *
 * Text sources:
 * - Hardcoded save list labels rendered in Window_SavefileList.drawContents.
 */

import { BasePluginTranslator } from '../BasePluginTranslator.js';

const LABEL_CURRENT_LOCATION = '現在位置：';
const LABEL_PLAYTIME = 'プレイ時間：';

export class SimpleFileLayoutTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
    }

    getPluginName() {
        return 'SimpleFileLayout';
    }

    getPluginLabel() {
        return 'SimpleFileLayout';
    }

    getCacheType() {
        return 'plugin_simple_file_layout';
    }

    buildScanEntries() {
        return [
            {
                text: LABEL_CURRENT_LOCATION,
                source: { scope: 'pluginLiteral', field: 'locationLabel' },
            },
            {
                text: LABEL_PLAYTIME,
                source: { scope: 'pluginLiteral', field: 'playtimeLabel' },
            },
        ];
    }

    collectUntranslated({ runtime }) {
        if (!runtime) {
            return [];
        }

        const items = this._buildUniquePendingItems(runtime);
        return items.filter((item) => !runtime.hasUsableCacheValue(item.cacheKey));
    }

    getCachedCountsSync({ runtime }) {
        if (!runtime) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        const items = this._buildUniquePendingItems(runtime);
        const totalStrings = items.length;
        const leftStrings = items.filter(
            (item) => !runtime.hasUsableCacheValue(item.cacheKey)
        ).length;

        return {
            total: totalStrings,
            left: leftStrings,
            totalStrings,
            leftStrings,
        };
    }

    enablePluginTranslation() {
        const savefileListProto = window.Window_SavefileList?.prototype;
        if (
            !savefileListProto ||
            typeof savefileListProto.drawContents !== 'function' ||
            typeof savefileListProto.drawText !== 'function'
        ) {
            return false;
        }

        this._hookDrawContentsContext(savefileListProto);
        this._hookDrawText(savefileListProto);
        return true;
    }

    _hookDrawContentsContext(prototype) {
        if (prototype.__CHEAT_SIMPLE_FILE_LAYOUT_DRAW_CONTENTS_PATCHED__) {
            return;
        }

        const original = prototype.drawContents;
        prototype.drawContents = function (info, rect, valid) {
            this.__CHEAT_SIMPLE_FILE_LAYOUT_IN_DRAW_CONTENTS__ = true;
            try {
                return original.call(this, info, rect, valid);
            } finally {
                this.__CHEAT_SIMPLE_FILE_LAYOUT_IN_DRAW_CONTENTS__ = false;
            }
        };

        Object.defineProperty(prototype, '__CHEAT_SIMPLE_FILE_LAYOUT_DRAW_CONTENTS_PATCHED__', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    _hookDrawText(prototype) {
        if (prototype.__CHEAT_SIMPLE_FILE_LAYOUT_DRAW_TEXT_PATCHED__) {
            return;
        }

        const labels = new Set(this.buildScanEntries().map((entry) => entry.text));
        const original = prototype.drawText;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);

        prototype.drawText = function (text, x, y, maxWidth, align) {
            if (!this.__CHEAT_SIMPLE_FILE_LAYOUT_IN_DRAW_CONTENTS__ || !labels.has(text)) {
                return original.call(this, text, x, y, maxWidth, align);
            }

            const runtime = getRuntime();
            if (!isRuntimeTranslationActive(runtime)) {
                return original.call(this, text, x, y, maxWidth, align);
            }

            const translated = resolveRuntimeTranslation(text, runtime, 'plugin_simple_file_layout', {
                requireRuntimeTranslationActive: true,
                missValue: text,
            });

            return original.call(this, translated, x, y, maxWidth, align);
        };

        Object.defineProperty(prototype, '__CHEAT_SIMPLE_FILE_LAYOUT_DRAW_TEXT_PATCHED__', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    _buildUniquePendingItems(runtime) {
        if (!this._scanPrepared) {
            this._scanEntries = this.buildScanEntries();
            this._scanPrepared = true;
        }

        const byCacheKey = new Map();
        for (const entry of this._scanEntries) {
            const text = String(entry?.text || '');
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (byCacheKey.has(cacheKey)) {
                continue;
            }

            byCacheKey.set(cacheKey, {
                type: this.getCacheType(),
                id: `plugin_simple_file_layout_${byCacheKey.size}`,
                value: text,
                cacheKey,
            });
        }

        return Array.from(byCacheKey.values());
    }
}
