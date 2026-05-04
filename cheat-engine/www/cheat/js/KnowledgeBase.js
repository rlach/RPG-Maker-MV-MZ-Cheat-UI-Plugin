/**
 * KnowledgeBase – pure domain module for translation knowledge entries.
 *
 * Responsibilities:
 *  - Entry normalization (trim key/translation/info/plugin)
 *  - Validation (key is required)
 *  - Merge policy (do not overwrite existing translation unless empty;
 *    update info when description differs and non-empty)
 *  - Case-insensitive relevance matching over preprocessed batch strings
 *  - LLM kbase payload extraction / validation
 *  - Language-pair file-name helpers
 *
 * This module is intentionally free of DOM, window, and storage dependencies
 * so it can be unit-tested without mocks.
 */

// ---------------------------------------------------------------------------
// Entry normalization
// ---------------------------------------------------------------------------

/**
 * Trim a string value; returns empty string for non-strings.
 * @param {*} value
 * @returns {string}
 */
export function trimString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

/**
 * Normalize a single knowledge entry (in place is fine – we return a new object).
 * @param {{ key?: string, translation?: string, info?: string, plugin?: string }} raw
 * @returns {{ key: string, translation: string, info: string, plugin: string } | null}
 *   null when key is missing / empty after trim.
 */
export function normalizeEntry(raw) {
    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const key = trimString(raw.key);
    if (!key) {
        return null;
    }

    return {
        key,
        translation: trimString(raw.translation),
        info: trimString(raw.info),
        plugin: trimString(raw.plugin),
    };
}

// ---------------------------------------------------------------------------
// Stored data shape helpers
// ---------------------------------------------------------------------------

/**
 * Convert a stored knowledge map (JSON shape) into an array of normalized entries.
 *
 * Stored format:
 * ```json
 * { "keyText": { "translation": "...", "info": "...", "plugin": "..." } }
 * ```
 *
 * @param {Record<string, { translation?: string, info?: string, plugin?: string }>} storedMap
 * @returns {Array<{ key: string, translation: string, info: string, plugin: string }>}
 */
export function storedMapToEntries(storedMap) {
    if (!storedMap || typeof storedMap !== 'object' || Array.isArray(storedMap)) {
        return [];
    }

    const entries = [];
    for (const [rawKey, rawValue] of Object.entries(storedMap)) {
        const key = trimString(rawKey);
        if (!key) {
            continue;
        }

        const value =
            rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) ? rawValue : {};

        entries.push({
            key,
            translation: trimString(value.translation),
            info: trimString(value.info),
            plugin: trimString(value.plugin),
        });
    }

    return entries;
}

/**
 * Convert an array of normalized entries back into the stored map format.
 * Duplicate keys (after trim) are collapsed – last-write wins.
 *
 * @param {Array<{ key: string, translation?: string, info?: string, plugin?: string }>} entries
 * @returns {Record<string, { translation: string, info: string, plugin?: string }>}
 */
export function entriesToStoredMap(entries) {
    const map = {};
    if (!Array.isArray(entries)) {
        return map;
    }

    for (const entry of entries) {
        const normalized = normalizeEntry(entry);
        if (!normalized) {
            continue;
        }

        const value = {
            translation: normalized.translation,
            info: normalized.info,
        };

        if (normalized.plugin) {
            value.plugin = normalized.plugin;
        }

        map[normalized.key] = value;
    }

    return map;
}

// ---------------------------------------------------------------------------
// Merge policy
// ---------------------------------------------------------------------------

/**
 * Merge a single incoming entry into an existing stored map.
 *
 * Rules:
 *  - If key is new → add it.
 *  - If key exists:
 *    - translation: overwrite ONLY when existing translation is empty.
 *    - info: overwrite when incoming info is non-empty and differs from existing.
 *    - plugin: overwrite when incoming plugin is non-empty and existing is empty.
 *
 * @param {Record<string, { translation: string, info: string, plugin?: string }>} storedMap
 * @param {{ key: string, translation?: string, info?: string, plugin?: string }} incoming
 * @returns {boolean} true if the map was mutated.
 */
export function mergeEntryIntoMap(storedMap, incoming) {
    const normalized = normalizeEntry(incoming);
    if (!normalized) {
        return false;
    }

    const existing = storedMap[normalized.key];
    if (!existing) {
        // New entry
        const value = {
            translation: normalized.translation,
            info: normalized.info,
        };
        if (normalized.plugin) {
            value.plugin = normalized.plugin;
        }
        storedMap[normalized.key] = value;
        return true;
    }

    let changed = false;

    // Translation: fill only when existing is empty
    if (!trimString(existing.translation) && normalized.translation) {
        existing.translation = normalized.translation;
        changed = true;
    }

    // Info: update when incoming is non-empty and different
    if (normalized.info && trimString(existing.info) !== normalized.info) {
        existing.info = normalized.info;
        changed = true;
    }

    // Plugin: fill only when existing is empty
    if (normalized.plugin && !trimString(existing.plugin)) {
        existing.plugin = normalized.plugin;
        changed = true;
    }

    return changed;
}

/**
 * Merge multiple incoming entries into a stored map.
 * @param {Record<string, object>} storedMap
 * @param {Array<{ key: string, translation?: string, info?: string, plugin?: string }>} incomingEntries
 * @returns {boolean} true if any mutation occurred.
 */
export function mergeEntriesIntoMap(storedMap, incomingEntries) {
    if (!Array.isArray(incomingEntries) || !storedMap || typeof storedMap !== 'object') {
        return false;
    }

    let anyChanged = false;
    for (const entry of incomingEntries) {
        if (mergeEntryIntoMap(storedMap, entry)) {
            anyChanged = true;
        }
    }

    return anyChanged;
}

// ---------------------------------------------------------------------------
// Relevance matching
// ---------------------------------------------------------------------------

/**
 * Given an array of knowledge entries and an array of preprocessed strings to
 * translate, return the subset of knowledge entries whose key appears
 * (case-insensitive) anywhere inside the concatenated preprocessed texts.
 *
 * @param {Array<{ key: string, translation: string, info: string, plugin?: string }>} entries
 * @param {string[]} preprocessedTexts
 * @returns {Array<{ key: string, translation: string, info: string, plugin?: string }>}
 */
export function findRelevantEntries(entries, preprocessedTexts) {
    if (!Array.isArray(entries) || !entries.length) {
        return [];
    }

    if (!Array.isArray(preprocessedTexts) || !preprocessedTexts.length) {
        return [];
    }

    // Build a single lowercase haystack by joining all preprocessed texts.
    const haystack = preprocessedTexts.join('\n').toLowerCase();
    if (!haystack) {
        return [];
    }

    const result = [];
    for (const entry of entries) {
        const key = trimString(entry.key);
        if (!key) {
            continue;
        }

        if (haystack.includes(key.toLowerCase())) {
            result.push(entry);
        }
    }

    return result;
}

// ---------------------------------------------------------------------------
// Prompt building helpers
// ---------------------------------------------------------------------------

/**
 * Build the knowledge hint string for injection into the LLM system prompt.
 * Format: "key: translation (info)" per entry, comma-separated.
 *
 * @param {Array<{ key: string, translation: string, info?: string }>} relevantEntries
 * @returns {string}
 */
export function buildKnowledgeHints(relevantEntries) {
    if (!Array.isArray(relevantEntries) || !relevantEntries.length) {
        return '';
    }

    const parts = [];
    for (const entry of relevantEntries) {
        const key = trimString(entry.key);
        if (!key) {
            continue;
        }

        const translation = trimString(entry.translation);
        const info = trimString(entry.info);

        if (!translation && !info) {
            continue;
        }

        let hint = `${key}: ${translation || '?'}`;
        if (info) {
            hint += ` (${info})`;
        }

        parts.push(hint);
    }

    return parts.join(', ');
}

/**
 * Build the kbase instruction text appended to the prompt when the toggle is on.
 * @returns {string}
 */
export function buildKbaseInstruction() {
    return (
        'If you encounter any proper names that were not passed in the previous list, ' +
        'add them at the end in key "kbase". Add description only if you have additional ' +
        'context from the dialogue. Main focus should be key:translation pairs to ensure ' +
        'consistent naming convention. Description is optional and should be short, like ' +
        '"Capital name of SampleCountry".\n' +
        'Example:\n' +
        '"kbase": [\n' +
        '    {"key": "例題技法：例示的技法", "translation": "Example Technique of Examplatory Example", "description": "Special technique used by LLM ninja"}\n' +
        ']'
    );
}

// ---------------------------------------------------------------------------
// LLM kbase response parsing
// ---------------------------------------------------------------------------

/**
 * Extract and normalize kbase entries from a parsed LLM response map.
 *
 * @param {Record<string, *>} translatedMap – the full parsed JSON response from LLM.
 * @returns {Array<{ key: string, translation: string, info: string }>}
 *   Normalized entries (info sourced from "description" field).
 *   Entries with empty key are filtered out.
 */
export function extractKbaseEntries(translatedMap) {
    if (!translatedMap || typeof translatedMap !== 'object') {
        return [];
    }

    const kbaseRaw = translatedMap.kbase;
    if (!Array.isArray(kbaseRaw)) {
        return [];
    }

    const result = [];
    for (const item of kbaseRaw) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            continue;
        }

        const key = trimString(item.key);
        if (!key) {
            continue;
        }

        result.push({
            key,
            translation: trimString(item.translation),
            info: trimString(item.description),
        });
    }

    return result;
}

/**
 * Remove the kbase key from a translated map so downstream per-item processing
 * doesn't see it as an unexpected key.
 * @param {Record<string, *>} translatedMap
 * @returns {Record<string, *>} same object reference, mutated.
 */
export function stripKbaseFromMap(translatedMap) {
    if (translatedMap && typeof translatedMap === 'object') {
        delete translatedMap.kbase;
    }
    return translatedMap;
}

// ---------------------------------------------------------------------------
// File-path helpers
// ---------------------------------------------------------------------------

/**
 * Get the knowledge cache file name for a given language pair.
 * @param {string} sourceLang e.g. "ja"
 * @param {string} targetLang e.g. "en"
 * @returns {string} e.g. "knowledge.ja-en.json"
 */
export function getKnowledgeFileName(sourceLang, targetLang) {
    const src = trimString(sourceLang) || 'unknown';
    const tgt = trimString(targetLang) || 'unknown';
    return `knowledge.${src}-${tgt}.json`;
}
