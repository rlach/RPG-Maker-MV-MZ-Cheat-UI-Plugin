import { BasePluginTranslator } from './BasePluginTranslator.js';

/**
 * Base class for translators that pre-scan a static data source at
 * prepare-time and deliver a flat list of { text, source } entries to
 * the translation pipeline.
 *
 * Subclasses must implement:
 *   buildScanEntries()  → { text, source }[] | null
 *   getCacheType()      → string
 *
 * Optionally override:
 *   getEntryIdPrefix()  → string  (defaults to 'plugin_<lowercased plugin name>')
 */
export class ExternBaseTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    // ── Abstract (must be overridden) ─────────────────────────────────────

    /** @abstract @returns {Array|null} */
    buildScanEntries() {
        return null;
    }

    /** @abstract @returns {string} */
    getCacheType() {
        return '';
    }

    getEntryIdPrefix() {
        return `plugin_${String(this.getPluginName())
            .toLowerCase()
            .replaceAll(/[^a-z0-9]+/g, '_')}`;
    }

    // ── Scan lifecycle ────────────────────────────────────────────────────

    async prepareTranslator() {
        if (!this.ensureDetection()) {
            return;
        }

        if (this._scanPrepared) {
            return;
        }

        if (this._scanPromise) {
            return this._scanPromise;
        }

        this._scanPromise = Promise.resolve(this.buildScanEntries())
            .then((entries) => {
                if (!Array.isArray(entries)) {
                    return;
                }

                this._scanEntries = entries;
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn(`[${this.constructor.name}] Scan failed`, error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    ensureScanEntriesSync() {
        if (this._scanPrepared && this._scanEntries.length > 0) {
            return;
        }

        const entries = this.buildScanEntries();
        if (!Array.isArray(entries)) {
            return;
        }

        this._scanEntries = entries;
        this._scanPrepared = true;
    }

    // ── Translation pipeline ──────────────────────────────────────────────

    buildUniquePendingItems(runtime) {
        this.ensureScanEntriesSync();

        const byCacheKey = new Map();
        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!text.trim()) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `${this.getEntryIdPrefix()}_${byCacheKey.size}`,
                    value: text,
                    cacheKey,
                });
            }
        }

        return Array.from(byCacheKey.values());
    }

    collectUntranslated({ runtime }) {
        if (!runtime) {
            return [];
        }

        const items = this.buildUniquePendingItems(runtime);
        return items.filter((item) => !runtime.hasUsableCacheValue(item.cacheKey));
    }

    countPluginAmountSync({ runtime }) {
        if (!runtime) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        const items = this.buildUniquePendingItems(runtime);
        const totalStrings = items.length;
        const leftStrings = items.filter(
            (item) => !runtime.hasUsableCacheValue(item.cacheKey)
        ).length;

        return { total: totalStrings, left: leftStrings, totalStrings, leftStrings };
    }
}
