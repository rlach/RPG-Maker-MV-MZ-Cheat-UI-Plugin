import { describe, it, expect } from 'vitest';
import {
    trimString,
    normalizeEntry,
    storedMapToEntries,
    entriesToStoredMap,
    mergeEntryIntoMap,
    mergeEntriesIntoMap,
    findRelevantEntries,
    buildKnowledgeHints,
    buildKbaseInstruction,
    extractKbaseEntries,
    stripKbaseFromMap,
    getKnowledgeFileName,
} from '../../../../../cheat-engine/www/cheat/js/KnowledgeBase.js';

// ---------------------------------------------------------------------------
// trimString
// ---------------------------------------------------------------------------

describe('trimString', () => {
    it('trims whitespace from strings', () => {
        expect(trimString('  hello  ')).toBe('hello');
    });

    it('returns empty string for non-string values', () => {
        expect(trimString(null)).toBe('');
        expect(trimString(undefined)).toBe('');
        expect(trimString(42)).toBe('');
    });
});

// ---------------------------------------------------------------------------
// normalizeEntry
// ---------------------------------------------------------------------------

describe('normalizeEntry', () => {
    it('normalizes a complete entry', () => {
        const result = normalizeEntry({
            key: '  Force  ',
            translation: ' Moc ',
            info: ' context ',
            plugin: ' MyPlugin ',
        });
        expect(result).toEqual({
            key: 'Force',
            translation: 'Moc',
            info: 'context',
            plugin: 'MyPlugin',
        });
    });

    it('returns null when key is empty after trim', () => {
        expect(normalizeEntry({ key: '   ', translation: 'x' })).toBeNull();
    });

    it('returns null for non-object input', () => {
        expect(normalizeEntry(null)).toBeNull();
        expect(normalizeEntry('string')).toBeNull();
    });

    it('fills missing fields with empty strings', () => {
        const result = normalizeEntry({ key: 'Jedi' });
        expect(result).toEqual({
            key: 'Jedi',
            translation: '',
            info: '',
            plugin: '',
        });
    });
});

// ---------------------------------------------------------------------------
// storedMapToEntries / entriesToStoredMap round-trip
// ---------------------------------------------------------------------------

describe('storedMapToEntries', () => {
    it('converts stored map to entry array', () => {
        const stored = {
            Force: { translation: 'Moc', info: 'Magic power' },
            Jedi: { translation: 'Dżedaj', info: '', plugin: 'MyPlugin' },
        };
        const entries = storedMapToEntries(stored);
        expect(entries).toHaveLength(2);
        expect(entries[0]).toEqual({
            key: 'Force',
            translation: 'Moc',
            info: 'Magic power',
            plugin: '',
        });
        expect(entries[1]).toEqual({
            key: 'Jedi',
            translation: 'Dżedaj',
            info: '',
            plugin: 'MyPlugin',
        });
    });

    it('skips entries with empty keys', () => {
        const stored = { '': { translation: 'x' }, '  ': { translation: 'y' } };
        expect(storedMapToEntries(stored)).toHaveLength(0);
    });

    it('returns empty array for non-object input', () => {
        expect(storedMapToEntries(null)).toEqual([]);
        expect(storedMapToEntries([])).toEqual([]);
    });
});

describe('entriesToStoredMap', () => {
    it('converts entries to stored map', () => {
        const entries = [
            { key: 'Force', translation: 'Moc', info: 'Magic', plugin: '' },
            { key: 'Jedi', translation: 'Dżedaj', info: '', plugin: 'SG' },
        ];
        const map = entriesToStoredMap(entries);
        expect(map).toEqual({
            Force: { translation: 'Moc', info: 'Magic' },
            Jedi: { translation: 'Dżedaj', info: '', plugin: 'SG' },
        });
    });

    it('collapses duplicate keys (last write wins)', () => {
        const entries = [
            { key: 'Force', translation: 'A', info: '' },
            { key: 'Force', translation: 'B', info: 'updated' },
        ];
        const map = entriesToStoredMap(entries);
        expect(map.Force.translation).toBe('B');
        expect(map.Force.info).toBe('updated');
    });

    it('filters out entries with empty keys', () => {
        const entries = [{ key: '', translation: 'x' }];
        expect(Object.keys(entriesToStoredMap(entries))).toHaveLength(0);
    });
});

describe('round-trip storedMap <-> entries', () => {
    it('preserves data through round-trip', () => {
        const original = {
            Force: { translation: 'Moc', info: 'Magic used by Jedi', plugin: 'SG' },
        };
        const entries = storedMapToEntries(original);
        const rebuilt = entriesToStoredMap(entries);
        expect(rebuilt.Force.translation).toBe('Moc');
        expect(rebuilt.Force.info).toBe('Magic used by Jedi');
        expect(rebuilt.Force.plugin).toBe('SG');
    });
});

// ---------------------------------------------------------------------------
// mergeEntryIntoMap
// ---------------------------------------------------------------------------

describe('mergeEntryIntoMap', () => {
    it('adds a new entry when key is absent', () => {
        const map = {};
        const changed = mergeEntryIntoMap(map, {
            key: 'Force',
            translation: 'Moc',
            info: 'desc',
        });
        expect(changed).toBe(true);
        expect(map.Force).toEqual({ translation: 'Moc', info: 'desc' });
    });

    it('does NOT overwrite existing non-empty translation', () => {
        const map = { Force: { translation: 'Moc', info: '' } };
        const changed = mergeEntryIntoMap(map, {
            key: 'Force',
            translation: 'Power',
            info: '',
        });
        expect(changed).toBe(false);
        expect(map.Force.translation).toBe('Moc');
    });

    it('fills empty translation when existing translation is empty', () => {
        const map = { Force: { translation: '', info: '' } };
        const changed = mergeEntryIntoMap(map, {
            key: 'Force',
            translation: 'Moc',
            info: '',
        });
        expect(changed).toBe(true);
        expect(map.Force.translation).toBe('Moc');
    });

    it('updates info when incoming is non-empty and different', () => {
        const map = { Force: { translation: 'Moc', info: 'old desc' } };
        const changed = mergeEntryIntoMap(map, {
            key: 'Force',
            translation: '',
            info: 'new desc',
        });
        expect(changed).toBe(true);
        expect(map.Force.info).toBe('new desc');
    });

    it('does NOT update info when incoming info is empty', () => {
        const map = { Force: { translation: 'Moc', info: 'existing' } };
        const changed = mergeEntryIntoMap(map, {
            key: 'Force',
            translation: '',
            info: '',
        });
        expect(changed).toBe(false);
        expect(map.Force.info).toBe('existing');
    });

    it('does NOT clear info when incoming info is empty', () => {
        const map = { Force: { translation: 'Moc', info: 'keep me' } };
        mergeEntryIntoMap(map, { key: 'Force', translation: '', info: '' });
        expect(map.Force.info).toBe('keep me');
    });

    it('fills plugin only when existing plugin is empty', () => {
        const map = { Force: { translation: 'Moc', info: '' } };
        mergeEntryIntoMap(map, { key: 'Force', translation: '', info: '', plugin: 'SG' });
        expect(map.Force.plugin).toBe('SG');
    });

    it('does NOT overwrite existing plugin', () => {
        const map = { Force: { translation: 'Moc', info: '', plugin: 'Existing' } };
        mergeEntryIntoMap(map, { key: 'Force', translation: '', info: '', plugin: 'New' });
        expect(map.Force.plugin).toBe('Existing');
    });

    it('returns false for null/empty incoming', () => {
        const map = {};
        expect(mergeEntryIntoMap(map, null)).toBe(false);
        expect(mergeEntryIntoMap(map, { key: '' })).toBe(false);
    });

    it('trims key and values before merge', () => {
        const map = {};
        mergeEntryIntoMap(map, { key: '  Jedi  ', translation: '  Dżedaj  ', info: '  x  ' });
        expect(map.Jedi).toBeDefined();
        expect(map.Jedi.translation).toBe('Dżedaj');
        expect(map.Jedi.info).toBe('x');
    });
});

describe('mergeEntriesIntoMap', () => {
    it('merges multiple entries', () => {
        const map = { Force: { translation: 'Moc', info: '' } };
        const changed = mergeEntriesIntoMap(map, [
            { key: 'Jedi', translation: 'Dżedaj', info: '' },
            { key: 'Force', translation: 'Power', info: 'new desc' },
        ]);
        expect(changed).toBe(true);
        expect(map.Jedi).toBeDefined();
        expect(map.Force.translation).toBe('Moc'); // not overwritten
        expect(map.Force.info).toBe('new desc'); // updated
    });

    it('returns false for empty array', () => {
        const map = {};
        expect(mergeEntriesIntoMap(map, [])).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// findRelevantEntries
// ---------------------------------------------------------------------------

describe('findRelevantEntries', () => {
    const entries = [
        { key: 'Jedi', translation: 'Dżedaj', info: 'Ktoś władający mocą', plugin: '' },
        { key: 'Force', translation: 'Moc', info: 'Magia', plugin: '' },
        { key: 'May', translation: 'Maj', info: '', plugin: '' },
    ];

    it('finds entries whose key appears in preprocessed texts (case-insensitive)', () => {
        const texts = ['May the force be with you, Luke', 'Thanks Kenobi!'];
        const relevant = findRelevantEntries(entries, texts);
        const keys = relevant.map((e) => e.key);
        expect(keys).toContain('Force');
        expect(keys).toContain('May');
        expect(keys).not.toContain('Jedi');
    });

    it('returns empty when no entries match', () => {
        const texts = ['Hello world'];
        expect(findRelevantEntries(entries, texts)).toHaveLength(0);
    });

    it('returns empty for empty inputs', () => {
        expect(findRelevantEntries([], ['text'])).toHaveLength(0);
        expect(findRelevantEntries(entries, [])).toHaveLength(0);
    });

    it('is case-insensitive', () => {
        const texts = ['THE FORCE IS STRONG'];
        const relevant = findRelevantEntries(entries, texts);
        expect(relevant.map((e) => e.key)).toContain('Force');
    });
});

// ---------------------------------------------------------------------------
// buildKnowledgeHints
// ---------------------------------------------------------------------------

describe('buildKnowledgeHints', () => {
    it('builds comma-separated hint string', () => {
        const entries = [
            { key: 'Force', translation: 'Moc', info: 'Magic' },
            { key: 'May', translation: 'Maj', info: '' },
        ];
        const hints = buildKnowledgeHints(entries);
        expect(hints).toBe('Force: Moc (Magic), May: Maj');
    });

    it('shows ? for entries without translation', () => {
        const entries = [{ key: 'Force', translation: '', info: 'Magic' }];
        expect(buildKnowledgeHints(entries)).toBe('Force: ? (Magic)');
    });

    it('skips entries without both translation and info', () => {
        const entries = [{ key: 'Force', translation: '', info: '' }];
        expect(buildKnowledgeHints(entries)).toBe('');
    });

    it('returns empty for no entries', () => {
        expect(buildKnowledgeHints([])).toBe('');
    });
});

// ---------------------------------------------------------------------------
// buildKbaseInstruction
// ---------------------------------------------------------------------------

describe('buildKbaseInstruction', () => {
    it('returns non-empty instruction string with kbase example', () => {
        const instruction = buildKbaseInstruction();
        expect(instruction).toContain('"kbase"');
        expect(instruction).toContain('"key"');
        expect(instruction).toContain('"translation"');
        expect(instruction).toContain('"description"');
    });
});

// ---------------------------------------------------------------------------
// extractKbaseEntries
// ---------------------------------------------------------------------------

describe('extractKbaseEntries', () => {
    it('extracts and normalizes kbase entries from LLM response', () => {
        const translatedMap = {
            m0: 'translated text',
            kbase: [
                {
                    key: '  NewName  ',
                    translation: '  NewTrans  ',
                    description: '  desc  ',
                },
            ],
        };
        const entries = extractKbaseEntries(translatedMap);
        expect(entries).toEqual([
            { key: 'NewName', translation: 'NewTrans', info: 'desc' },
        ]);
    });

    it('returns empty array when kbase is missing', () => {
        expect(extractKbaseEntries({ m0: 'text' })).toEqual([]);
    });

    it('returns empty array when kbase is not an array', () => {
        expect(extractKbaseEntries({ kbase: 'string' })).toEqual([]);
    });

    it('filters out entries without key', () => {
        const translatedMap = {
            kbase: [
                { key: '', translation: 'x' },
                { key: '  ', translation: 'y' },
                { translation: 'z' },
                { key: 'Valid', translation: 'OK' },
            ],
        };
        const entries = extractKbaseEntries(translatedMap);
        expect(entries).toHaveLength(1);
        expect(entries[0].key).toBe('Valid');
    });

    it('handles description field only (not desctiption typo)', () => {
        const translatedMap = {
            kbase: [{ key: 'A', translation: 'B', desctiption: 'typo' }],
        };
        const entries = extractKbaseEntries(translatedMap);
        expect(entries[0].info).toBe(''); // typo ignored
    });

    it('handles null input', () => {
        expect(extractKbaseEntries(null)).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// stripKbaseFromMap
// ---------------------------------------------------------------------------

describe('stripKbaseFromMap', () => {
    it('removes kbase key from map', () => {
        const map = { m0: 'text', kbase: [{ key: 'a' }] };
        const result = stripKbaseFromMap(map);
        expect(result.kbase).toBeUndefined();
        expect(result.m0).toBe('text');
    });

    it('handles map without kbase', () => {
        const map = { m0: 'text' };
        expect(stripKbaseFromMap(map)).toEqual({ m0: 'text' });
    });

    it('handles null gracefully', () => {
        expect(stripKbaseFromMap(null)).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// getKnowledgeFileName
// ---------------------------------------------------------------------------

describe('getKnowledgeFileName', () => {
    it('builds file name from language pair', () => {
        expect(getKnowledgeFileName('ja', 'en')).toBe('knowledge.ja-en.json');
    });

    it('uses unknown for empty lang', () => {
        expect(getKnowledgeFileName('', '')).toBe('knowledge.unknown-unknown.json');
    });

    it('trims whitespace', () => {
        expect(getKnowledgeFileName(' ja ', ' en ')).toBe('knowledge.ja-en.json');
    });
});
