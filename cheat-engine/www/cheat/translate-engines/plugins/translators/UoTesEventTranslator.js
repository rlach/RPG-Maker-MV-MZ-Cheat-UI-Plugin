import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { collectEventCommandEntries } from '../../../js/EventCommandTraversal.js';

const CACHE_TYPE_BY_ENTRY_TYPE = Object.freeze({
    message: 'message',
    message_portrait: 'message',
    scroll_text: 'scroll_text',
    choice: 'choice',
    speaker: 'speaker',
});

function resolveCacheTypeForEntry(entryType) {
    return CACHE_TYPE_BY_ENTRY_TYPE[entryType] || 'message';
}

/**
 * Loads a TES event JSON file via XMLHttpRequest.
 * @param {string} url
 * @returns {Promise<Array|null>}
 */
function loadTesFileByUrl(url) {
    return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url);
        xhr.overrideMimeType('application/json');
        xhr.onload = function () {
            if (xhr.status < 400) {
                try {
                    resolve(JSON.parse(xhr.responseText));
                } catch {
                    resolve(null);
                }
            } else {
                resolve(null);
            }
        };
        xhr.onerror = function () {
            resolve(null);
        };
        xhr.send();
    });
}

/**
 * Lists JSON filenames in a directory by fetching a directory index.
 * Falls back to Node.js fs when available (NW.js / Electron offline mode).
 * @param {string} dirPath
 * @returns {string[]} filenames without extension
 */
function listTesFilenames(dirPath) {
    // NW.js / Electron path — fs is available
    if (typeof require === 'function' && typeof process === 'object') {
        try {
            const fs = require('fs');
            const path = require('path');

            const cwd = typeof process !== 'undefined' && process ? process.cwd() : '.';

            // Try both game-root-relative and www-relative paths.
            // In NW.js, process.cwd() is the folder containing Game.exe (one level above www/).
            const candidateDirs = [path.join(cwd, dirPath), path.join(cwd, 'www', dirPath)];

            let resolvedDir = '';
            for (const candidate of candidateDirs) {
                if (fs.existsSync(candidate)) {
                    resolvedDir = candidate;
                    break;
                }
            }

            if (!resolvedDir) {
                return [];
            }

            return fs
                .readdirSync(resolvedDir)
                .filter((f) => f.toLowerCase().endsWith('.json'))
                .map((f) => f.slice(0, -5));
        } catch {
            return [];
        }
    }

    // Browser mode: no directory listing available
    return [];
}

export class UoTesEventTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'uoTesEvent';
    }

    getPluginLabel() {
        return 'uoTesEvent';
    }

    /**
     * Primary cache type for getCacheType() contract.
     * Individual entries carry their own cacheType (message / choice / etc.).
     */
    getCacheType() {
        return 'message';
    }

    /**
     * Read the configured Main Dir from plugin parameters.
     * @returns {string}
     */
    getMainDir() {
        if (!Array.isArray(window.$plugins)) {
            return './data/tes/';
        }

        const entry = window.$plugins.find(
            (p) => p && typeof p.name === 'string' && p.name === 'uoTesEvent'
        );

        const configured =
            typeof entry?.parameters?.['Main Dir'] === 'string'
                ? entry.parameters['Main Dir'].trim()
                : '';

        return configured || './data/tes/';
    }

    // ── No runtime hook needed ────────────────────────────────────────────
    // TES events ultimately run as standard RPG Maker interpreter commands.
    // Show Text (101/401) and Show Choices (102) are already intercepted by
    // the base cheat runtime. enablePluginTranslation() is intentionally empty.

    enablePluginTranslation() {
        // No runtime hook required.
        // The base cheat runtime intercepts Show Text and Show Choices commands
        // that TES events produce during gameplay, so translations stored in the
        // message / choice caches are applied automatically.
    }

    // ── Scan pipeline ─────────────────────────────────────────────────────

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

        this._scanPromise = this.buildScanEntries()
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[UoTesEventTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const mainDir = this.getMainDir();
        const filenames = listTesFilenames(mainDir);

        if (filenames.length === 0) {
            console.warn(
                `[UoTesEventTranslator] No TES files found in "${mainDir}". ` +
                    'Directory listing is only supported in NW.js / Electron (offline) mode.'
            );
            return [];
        }

        const entries = [];

        for (const filename of filenames) {
            const url = mainDir + filename + '.json';
            try {
                const list = await loadTesFileByUrl(url);
                if (!Array.isArray(list)) {
                    continue;
                }

                this.collectEntriesFromList(list, { filename }, entries);
            } catch (error) {
                console.warn(`[UoTesEventTranslator] Failed to scan TES file "${filename}"`, error);
            }
        }

        return entries;
    }

    /**
     * Extract translatable entries from a TES event command list.
     * @param {Array} list - RPG Maker event command list
     * @param {object} sourceMeta - metadata for source attribution
     * @param {Array} output - accumulator
     */
    collectEntriesFromList(list, sourceMeta, output) {
        const rawEntries = collectEventCommandEntries(list);

        for (const raw of rawEntries) {
            const text = typeof raw.value === 'string' ? raw.value : '';
            if (!text.trim()) {
                continue;
            }

            const cacheType = resolveCacheTypeForEntry(raw.type);

            output.push({
                text,
                cacheType,
                source: {
                    ...sourceMeta,
                    entryType: raw.type,
                    cmdIndex: raw.cmdIndex,
                },
            });
        }
    }

    // ── Translation pipeline ──────────────────────────────────────────────

    buildUniquePendingItems(panel) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!text.trim()) {
                continue;
            }

            const cacheType = entry.cacheType || this.getCacheType();
            const cacheKey = panel.getCacheKey(text, cacheType);

            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: cacheType,
                    id: `plugin_uo_tes_event_${byCacheKey.size}`,
                    value: text,
                    cacheKey,
                });
            }
        }

        return Array.from(byCacheKey.values());
    }

    collectUntranslated({ panel }) {
        if (!panel) {
            return [];
        }

        const items = this.buildUniquePendingItems(panel);
        return items.filter((item) => !panel.hasUsableCacheValue(item.cacheKey));
    }

    countPluginAmountSync({ panel }) {
        if (!panel) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        const items = this.buildUniquePendingItems(panel);
        const totalStrings = items.length;
        const leftStrings = items.filter(
            (item) => !panel.hasUsableCacheValue(item.cacheKey)
        ).length;

        return { total: totalStrings, left: leftStrings, totalStrings, leftStrings };
    }
}
