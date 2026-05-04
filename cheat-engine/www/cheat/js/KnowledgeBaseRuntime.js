/**
 * KnowledgeBaseRuntime – root-window backed runtime store for the Knowledge Base.
 *
 * Mirrors the TranslateCacheRuntime pattern:
 *  - State rooted on the game (root) window via ensureRootWindowStateValue.
 *  - Cross-window notifications via root event bus.
 *  - Per-language-pair JSON file persistence in translate-cache directory.
 */

import {
    ensureRootWindowStateValue,
    subscribeRootWindowEvent,
    notifyRootWindowEvent,
} from './RootWindowState.js';

import {
    storedMapToEntries,
    mergeEntriesIntoMap,
    getKnowledgeFileName,
    normalizeEntry,
} from './KnowledgeBase.js';

const ROOT_STATE_KEY = '__CheatKnowledgeBaseStore';
const RUNTIME_EVENT_NAME = 'cheat:knowledge-base-updated';

// ---------------------------------------------------------------------------
// Root-window state bootstrap
// ---------------------------------------------------------------------------

function ensureKnowledgeStore() {
    return ensureRootWindowStateValue(ROOT_STATE_KEY, () => ({
        /** @type {Record<string, { translation: string, info: string, plugin?: string }>} */
        data: {},
        sourceLang: '',
        targetLang: '',
        version: 0,
    }));
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

function notifyKnowledgeBaseChanged(reason = 'unknown') {
    const store = ensureKnowledgeStore();
    store.version = (store.version || 0) + 1;
    notifyRootWindowEvent(RUNTIME_EVENT_NAME, {
        reason,
        version: store.version,
        timestamp: Date.now(),
    });
}

/**
 * Subscribe to knowledge base change events.
 * @param {(detail: object) => void} handler
 * @returns {() => void} Unsubscribe function.
 */
export function onKnowledgeBaseChanged(handler) {
    if (typeof handler !== 'function') {
        return () => {};
    }
    ensureKnowledgeStore();
    return subscribeRootWindowEvent(RUNTIME_EVENT_NAME, handler);
}

// ---------------------------------------------------------------------------
// Persistence helpers (fs-based, NW.js / Electron environment)
// ---------------------------------------------------------------------------

function getCacheDirectoryPath() {
    return './www/cheat-settings/translate-cache';
}

function getFilePath(sourceLang, targetLang) {
    const path = require('path');
    return path.join(getCacheDirectoryPath(), getKnowledgeFileName(sourceLang, targetLang));
}

function ensureDirectoryExists(dirPath) {
    const fs = require('fs');
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function readJsonFileSync(filePath) {
    const fs = require('fs');
    if (!fs.existsSync(filePath)) {
        return null;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
}

function writeJsonFileAtomicSync(filePath, data) {
    const fs = require('fs');
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpPath, filePath);
}

// ---------------------------------------------------------------------------
// Load / Save
// ---------------------------------------------------------------------------

/**
 * Load knowledge from disk for the given language pair.
 * Replaces current in-memory data.
 *
 * @param {string} sourceLang
 * @param {string} targetLang
 */
export function loadKnowledgeFromDisk(sourceLang, targetLang) {
    const store = ensureKnowledgeStore();
    store.sourceLang = sourceLang || '';
    store.targetLang = targetLang || '';

    try {
        const filePath = getFilePath(sourceLang, targetLang);
        const payload = readJsonFileSync(filePath);

        if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
            store.data = payload;
        } else {
            store.data = {};
        }
    } catch (error) {
        console.warn('[KnowledgeBaseRuntime] Failed to load knowledge file', error);
        store.data = {};
    }

    notifyKnowledgeBaseChanged('loaded');
}

/**
 * Persist current in-memory knowledge to disk.
 */
export function saveKnowledgeToDisk() {
    const store = ensureKnowledgeStore();
    if (!store.sourceLang || !store.targetLang) {
        return;
    }

    try {
        ensureDirectoryExists(getCacheDirectoryPath());
        const filePath = getFilePath(store.sourceLang, store.targetLang);
        writeJsonFileAtomicSync(filePath, store.data);
    } catch (error) {
        console.warn('[KnowledgeBaseRuntime] Failed to save knowledge file', error);
    }
}

// ---------------------------------------------------------------------------
// CRUD API
// ---------------------------------------------------------------------------

/**
 * Get all knowledge entries as an array.
 * @returns {Array<{ key: string, translation: string, info: string, plugin: string }>}
 */
export function getKnowledgeEntries() {
    const store = ensureKnowledgeStore();
    return storedMapToEntries(store.data);
}

/**
 * Get the raw stored map (reference – callers should not mutate directly).
 * @returns {Record<string, { translation: string, info: string, plugin?: string }>}
 */
export function getKnowledgeMap() {
    return ensureKnowledgeStore().data;
}

/**
 * Set a single knowledge entry (add or full overwrite – used by panel inline editing).
 *
 * @param {{ key: string, translation?: string, info?: string, plugin?: string }} entry
 * @returns {boolean}
 */
export function setKnowledgeEntry(entry) {
    const normalized = normalizeEntry(entry);
    if (!normalized) {
        return false;
    }

    const store = ensureKnowledgeStore();
    const value = {
        translation: normalized.translation,
        info: normalized.info,
    };
    if (normalized.plugin) {
        value.plugin = normalized.plugin;
    }
    store.data[normalized.key] = value;

    saveKnowledgeToDisk();
    notifyKnowledgeBaseChanged('entry-set');
    return true;
}

/**
 * Delete a knowledge entry by key.
 * @param {string} key
 * @returns {boolean}
 */
export function deleteKnowledgeEntry(key) {
    const trimmed = typeof key === 'string' ? key.trim() : '';
    if (!trimmed) {
        return false;
    }

    const store = ensureKnowledgeStore();
    if (!(trimmed in store.data)) {
        return false;
    }

    delete store.data[trimmed];
    saveKnowledgeToDisk();
    notifyKnowledgeBaseChanged('entry-deleted');
    return true;
}

/**
 * Merge entries into the knowledge base using the standard merge policy
 * (no overwrite of existing translation unless empty, update info if different).
 *
 * @param {Array<{ key: string, translation?: string, info?: string, plugin?: string }>} entries
 * @returns {boolean} true if any changes were applied.
 */
export function mergeKnowledgeEntries(entries) {
    const store = ensureKnowledgeStore();
    const changed = mergeEntriesIntoMap(store.data, entries);

    if (changed) {
        saveKnowledgeToDisk();
        notifyKnowledgeBaseChanged('entries-merged');
    }

    return changed;
}

/**
 * Replace all knowledge data (used during language-pair switch).
 * @param {Record<string, object>} data
 */
export function replaceKnowledgeData(data) {
    const store = ensureKnowledgeStore();
    store.data = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    notifyKnowledgeBaseChanged('data-replaced');
}

/**
 * Get current language pair from the store.
 * @returns {{ sourceLang: string, targetLang: string }}
 */
export function getKnowledgeLangPair() {
    const store = ensureKnowledgeStore();
    return {
        sourceLang: store.sourceLang || '',
        targetLang: store.targetLang || '',
    };
}

/**
 * Reload knowledge if the language pair changed.
 * @param {string} sourceLang
 * @param {string} targetLang
 */
export function ensureKnowledgeForLangPair(sourceLang, targetLang) {
    const store = ensureKnowledgeStore();
    const src = (sourceLang || '').trim();
    const tgt = (targetLang || '').trim();

    if (store.sourceLang === src && store.targetLang === tgt) {
        return;
    }

    // Save current data first (if we had a valid pair)
    if (store.sourceLang && store.targetLang) {
        saveKnowledgeToDisk();
    }

    loadKnowledgeFromDisk(src, tgt);
}
