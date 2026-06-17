import { describe, expect, it } from 'vitest';
import { StreamGuardrails } from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/StreamGuardrails.js';
import {
    STREAM_CANCEL_REASON,
    STREAM_MONITOR_CHECK_INTERVAL,
    STREAM_OPEN_BRACE_MAX_CHARS,
} from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/constants.js';

const keys2 = ['m0', 'm1'];

function makeState(expectedKeys = keys2, options = {}) {
    return StreamGuardrails.createMonitorState(expectedKeys, options);
}

function check(state, text, force = true) {
    return StreamGuardrails.checkGuardrails(state, text, force);
}

describe('normalizeBannedPhrases', () => {
    it('returns empty array for non-array input', () => {
        expect(StreamGuardrails.normalizeBannedPhrases(null)).toEqual([]);
        expect(StreamGuardrails.normalizeBannedPhrases('hello')).toEqual([]);
        expect(StreamGuardrails.normalizeBannedPhrases(undefined)).toEqual([]);
    });

    it('normalizes and deduplicates phrases case-insensitively', () => {
        const result = StreamGuardrails.normalizeBannedPhrases(['Foo', '  foo  ', 'BAR', 'bar']);
        expect(result).toEqual([
            { phrase: 'Foo', key: 'foo' },
            { phrase: 'BAR', key: 'bar' },
        ]);
    });

    it('skips empty strings and non-string entries', () => {
        const result = StreamGuardrails.normalizeBannedPhrases(['', 42, null, 'ok']);
        expect(result).toEqual([{ phrase: 'ok', key: 'ok' }]);
    });
});

describe('findBannedPhraseInJsonText', () => {
    const phrases = StreamGuardrails.normalizeBannedPhrases(['tool_call', 'JSON']);

    it('returns null for empty / invalid input', () => {
        expect(StreamGuardrails.findBannedPhraseInJsonText('', phrases)).toBe(null);
        expect(StreamGuardrails.findBannedPhraseInJsonText(null, phrases)).toBe(null);
        expect(StreamGuardrails.findBannedPhraseInJsonText('hello', [])).toBe(null);
        expect(StreamGuardrails.findBannedPhraseInJsonText('hello', null)).toBe(null);
    });

    it('detects banned phrase case-insensitively', () => {
        expect(StreamGuardrails.findBannedPhraseInJsonText('use TOOL_CALL here', phrases)).toBe(
            'tool_call'
        );
        expect(StreamGuardrails.findBannedPhraseInJsonText('return json object', phrases)).toBe(
            'JSON'
        );
    });

    it('returns null when no phrases match', () => {
        expect(StreamGuardrails.findBannedPhraseInJsonText('hello world', phrases)).toBe(null);
    });
});

describe('findBannedPhraseInScan', () => {
    const phrases = StreamGuardrails.normalizeBannedPhrases(['badword']);

    it('returns null for null scan or empty phrases', () => {
        expect(StreamGuardrails.findBannedPhraseInScan(null, phrases)).toBe(null);
        expect(StreamGuardrails.findBannedPhraseInScan({}, [])).toBe(null);
    });

    it('detects phrase in complete objects', () => {
        const scan = { objects: [{ text: '{"m0":"contains badword"}' }], partialObjectText: '' };
        expect(StreamGuardrails.findBannedPhraseInScan(scan, phrases)).toBe('badword');
    });

    it('detects phrase in partial object text', () => {
        const scan = { objects: [], partialObjectText: '{"m0":"badword' };
        expect(StreamGuardrails.findBannedPhraseInScan(scan, phrases)).toBe('badword');
    });

    it('returns null when no match', () => {
        const scan = { objects: [{ text: '{"m0":"clean"}' }], partialObjectText: '' };
        expect(StreamGuardrails.findBannedPhraseInScan(scan, phrases)).toBe(null);
    });
});

describe('countPhraseOccurrences', () => {
    it('returns 0 for empty or missing input', () => {
        expect(StreamGuardrails.countPhraseOccurrences('', 'json')).toBe(0);
        expect(StreamGuardrails.countPhraseOccurrences(null, 'json')).toBe(0);
        expect(StreamGuardrails.countPhraseOccurrences('hello', '')).toBe(0);
        expect(StreamGuardrails.countPhraseOccurrences('hello', null)).toBe(0);
    });

    it('counts non-overlapping case-insensitive occurrences', () => {
        expect(StreamGuardrails.countPhraseOccurrences('JSON json JSON', 'json')).toBe(3);
        expect(StreamGuardrails.countPhraseOccurrences('no match here', 'json')).toBe(0);
        expect(StreamGuardrails.countPhraseOccurrences('JSONjson', 'json')).toBe(2);
    });

    it('handles adjacent non-overlapping occurrences', () => {
        expect(StreamGuardrails.countPhraseOccurrences('aaa', 'aa')).toBe(1);
    });
});

describe('buildBannedPhrasesAllowedCounts', () => {
    const phrases = StreamGuardrails.normalizeBannedPhrases(['JSON', 'tool_call']);

    it('returns empty object for non-array phrases', () => {
        expect(StreamGuardrails.buildBannedPhrasesAllowedCounts(null, 'JSON')).toEqual({});
    });

    it('counts zero when inputText is empty or missing', () => {
        const result = StreamGuardrails.buildBannedPhrasesAllowedCounts(phrases, '');
        expect(result['json']).toBe(0);
        expect(result['tool_call']).toBe(0);
    });

    it('counts occurrences in inputText case-insensitively', () => {
        const result = StreamGuardrails.buildBannedPhrasesAllowedCounts(
            phrases,
            'Please return JSON. Also JSON. Use tool_call.'
        );
        expect(result['json']).toBe(2);
        expect(result['tool_call']).toBe(1);
    });

    it('treats missing inputText as empty (all counts 0)', () => {
        const result = StreamGuardrails.buildBannedPhrasesAllowedCounts(phrases, null);
        expect(result['json']).toBe(0);
        expect(result['tool_call']).toBe(0);
    });
});

describe('countPhraseOccurrencesInScan', () => {
    const phraseItem = { phrase: 'JSON', key: 'json' };

    it('returns 0 for null scan or null phraseItem', () => {
        expect(StreamGuardrails.countPhraseOccurrencesInScan(null, phraseItem)).toBe(0);
        expect(StreamGuardrails.countPhraseOccurrencesInScan({}, null)).toBe(0);
        expect(StreamGuardrails.countPhraseOccurrencesInScan({}, { phrase: 'x', key: '' })).toBe(0);
    });

    it('counts across complete objects and partial text', () => {
        const scan = {
            objects: [
                { text: '{"m0":"JSON object","m1":"json again"}' },
                { text: '{"m2":"no match"}' },
            ],
            partialObjectText: '{"m3":"JSON',
        };
        // objects[0]: 2, objects[1]: 0, partial: 1 → total 3
        expect(StreamGuardrails.countPhraseOccurrencesInScan(scan, phraseItem)).toBe(3);
    });

    it('returns 0 when no match anywhere', () => {
        const scan = {
            objects: [{ text: '{"m0":"clean text"}' }],
            partialObjectText: '{"m1":"also clean',
        };
        expect(StreamGuardrails.countPhraseOccurrencesInScan(scan, phraseItem)).toBe(0);
    });
});

describe('findExcessBannedPhrase', () => {
    const phrases = StreamGuardrails.normalizeBannedPhrases(['JSON']);

    it('returns null for null scan or empty phrases', () => {
        expect(StreamGuardrails.findExcessBannedPhrase(null, phrases, {})).toBe(null);
        expect(StreamGuardrails.findExcessBannedPhrase({}, [], {})).toBe(null);
    });

    it('cancels when occurrence count exceeds allowed (default 0)', () => {
        const scan = { objects: [{ text: '{"m0":"JSON result"}' }], partialObjectText: '' };
        expect(StreamGuardrails.findExcessBannedPhrase(scan, phrases, { json: 0 })).toBe('JSON');
    });

    it('does not cancel when occurrence count equals allowed', () => {
        // input had 1 "JSON", response has 1 "JSON"
        const scan = { objects: [{ text: '{"m0":"JSON result"}' }], partialObjectText: '' };
        expect(StreamGuardrails.findExcessBannedPhrase(scan, phrases, { json: 1 })).toBe(null);
    });

    it('cancels when occurrence count exceeds allowed threshold', () => {
        // input had 2, response has 3
        const scan = {
            objects: [{ text: '{"m0":"JSON and JSON and JSON"}' }],
            partialObjectText: '',
        };
        expect(StreamGuardrails.findExcessBannedPhrase(scan, phrases, { json: 2 })).toBe('JSON');
    });

    it('does not cancel when missing allowedCounts entry treats allowed as 0 but no occurrence', () => {
        const scan = { objects: [{ text: '{"m0":"clean"}' }], partialObjectText: '' };
        expect(StreamGuardrails.findExcessBannedPhrase(scan, phrases, {})).toBe(null);
    });
});

describe('extractInFlightTopLevelKey', () => {
    it('returns null for non-string / empty input', () => {
        expect(StreamGuardrails.extractInFlightTopLevelKey(null)).toBe(null);
        expect(StreamGuardrails.extractInFlightTopLevelKey('')).toBe(null);
    });

    it('extracts a closed key after comma', () => {
        const result = StreamGuardrails.extractInFlightTopLevelKey('{"m0":"a", "m1": "b"');
        expect(result).toEqual({ key: 'm1', isClosed: true });
    });

    it('extracts a partially typed key', () => {
        const result = StreamGuardrails.extractInFlightTopLevelKey('{"m0":"a", "m');
        expect(result).toEqual({ key: 'm', isClosed: false });
    });

    it('extracts key right after opening brace', () => {
        const result = StreamGuardrails.extractInFlightTopLevelKey('{"m0');
        expect(result).toEqual({ key: 'm0', isClosed: false });
    });

    it('returns null when no pair delimiter found', () => {
        expect(StreamGuardrails.extractInFlightTopLevelKey('hello')).toBe(null);
    });
});

describe('isExpectedKeyProgress', () => {
    it('returns true when expectedKeys is empty or not an array', () => {
        expect(StreamGuardrails.isExpectedKeyProgress([], 'm0', true)).toBe(true);
        expect(StreamGuardrails.isExpectedKeyProgress(null, 'm0', true)).toBe(true);
    });

    it('matches closed key exactly', () => {
        expect(StreamGuardrails.isExpectedKeyProgress(['m0', 'm1'], 'm0', true)).toBe(true);
        expect(StreamGuardrails.isExpectedKeyProgress(['m0', 'm1'], 'x9', true)).toBe(false);
    });

    it('matches prefix for open (in-progress) key', () => {
        expect(StreamGuardrails.isExpectedKeyProgress(['m0', 'm1'], 'm', false)).toBe(true);
        expect(StreamGuardrails.isExpectedKeyProgress(['m0', 'm1'], 'x', false)).toBe(false);
    });
});

describe('buildValueLengthSettings', () => {
    it('applies default multiplier=3 and minimum=30', () => {
        const result = StreamGuardrails.buildValueLengthSettings(['m0'], {});
        expect(result.lengthMultiplierForMaxLength).toBe(3);
        expect(result.minimumMaxLength).toBe(30);
        expect(result.valueLengthLimitsByKey.m0).toBe(30); // no source length → minimum
    });

    it('uses provided source lengths', () => {
        const result = StreamGuardrails.buildValueLengthSettings(['m0', 'm1'], {
            expectedValueLengthsByKey: { m0: 100, m1: 5 },
            lengthMultiplierForMaxLength: 2,
            minimumMaxLength: 10,
        });
        expect(result.valueLengthLimitsByKey.m0).toBe(200); // 100 * 2
        expect(result.valueLengthLimitsByKey.m1).toBe(10); // max(10, 5*2=10)
        expect(result.maxValueLengthLimit).toBe(200);
    });
});

describe('extractInFlightTopLevelValueString', () => {
    it('returns null for non-string / empty input', () => {
        expect(StreamGuardrails.extractInFlightTopLevelValueString(null)).toBe(null);
        expect(StreamGuardrails.extractInFlightTopLevelValueString('')).toBe(null);
    });

    it('detects an open value string with its length', () => {
        const result = StreamGuardrails.extractInFlightTopLevelValueString('{"m0": "hello wor');
        expect(result).toEqual({ key: 'm0', valueLength: 9 }); // "hello wor" = 9 chars
    });

    it('returns null when value string is closed', () => {
        const result = StreamGuardrails.extractInFlightTopLevelValueString('{"m0": "hello world"');
        expect(result).toBe(null);
    });

    it('counts escaped characters correctly', () => {
        // \"hi\" => each escaped char pair counts the second char
        const result = StreamGuardrails.extractInFlightTopLevelValueString('{"m0": "a\\nb');
        // a (1) + escape triggers + n counted (1) + b (1) = 3
        expect(result).toEqual({ key: 'm0', valueLength: 3 });
    });
});

describe('isMapComplete', () => {
    it('returns false for null/non-object map', () => {
        expect(StreamGuardrails.isMapComplete(null, keys2)).toBe(false);
    });

    it('returns true when all keys present', () => {
        expect(StreamGuardrails.isMapComplete({ m0: 'a', m1: 'b' }, keys2)).toBe(true);
    });

    it('returns false when a key is missing', () => {
        expect(StreamGuardrails.isMapComplete({ m0: 'a' }, keys2)).toBe(false);
    });

    it('returns true when expectedKeys is not an array', () => {
        expect(StreamGuardrails.isMapComplete({ m0: 'a' }, null)).toBe(true);
    });
});

describe('countMatchedKeys', () => {
    it('returns 0 for invalid input', () => {
        expect(StreamGuardrails.countMatchedKeys(null, keys2)).toBe(0);
        expect(StreamGuardrails.countMatchedKeys({ m0: 'a' }, null)).toBe(0);
    });

    it('counts matching keys', () => {
        expect(StreamGuardrails.countMatchedKeys({ m0: 'a', m1: 'b', extra: 'c' }, keys2)).toBe(2);
        expect(StreamGuardrails.countMatchedKeys({ m0: 'a' }, keys2)).toBe(1);
    });
});

describe('updateBestState', () => {
    it('updates bestMap when score improves', () => {
        const state = makeState();
        StreamGuardrails.updateBestState(state, { m0: 'a' });
        expect(state.bestMap).toEqual({ m0: 'a' });
        expect(state.bestIsComplete).toBe(false);
        expect(state.bestScore).toBe(1);
    });

    it('prefers complete map over partial', () => {
        const state = makeState();
        StreamGuardrails.updateBestState(state, { m0: 'a' });
        StreamGuardrails.updateBestState(state, { m0: 'x', m1: 'y' });
        expect(state.bestMap).toEqual({ m0: 'x', m1: 'y' });
        expect(state.bestIsComplete).toBe(true);
    });

    it('does nothing for null candidate', () => {
        const state = makeState();
        StreamGuardrails.updateBestState(state, null);
        expect(state.bestMap).toBe(null);
    });
});

describe('createMonitorState', () => {
    it('initializes all fields', () => {
        const state = makeState(['m0'], { bannedPhrases: ['bad'] });
        expect(state.expectedKeys).toEqual(['m0']);
        expect(state.expectedKeySet).toBeInstanceOf(Set);
        expect(state.expectedKeySet.has('m0')).toBe(true);
        expect(state.bannedPhrases.length).toBe(1);
        expect(state.lastCheckedCharCount).toBe(0);
        expect(state.bestMap).toBe(null);
        expect(state.bestScore).toBe(0);
        expect(state.bestIsComplete).toBe(false);
        expect(state.cancelReason).toBe(null);
        expect(state.cancelMeta).toBe(null);
    });

    it('stores bannedPhrasesAllowedCounts as all-zeros when no inputText', () => {
        const state = makeState(['m0'], { bannedPhrases: ['JSON'] });
        expect(state.bannedPhrasesAllowedCounts).toEqual({ json: 0 });
    });

    it('stores bannedPhrasesAllowedCounts counted from inputText', () => {
        const state = makeState(['m0'], {
            bannedPhrases: ['JSON', 'tool_call'],
            inputText: 'Please output JSON and JSON. No tool_call needed.',
        });
        expect(state.bannedPhrasesAllowedCounts['json']).toBe(2);
        expect(state.bannedPhrasesAllowedCounts['tool_call']).toBe(1);
    });
});

describe('checkGuardrails - full path coverage', () => {
    describe('invalid state', () => {
        it('returns no-cancel for null state', () => {
            const result = StreamGuardrails.checkGuardrails(null, '{}', true);
            expect(result.shouldCancel).toBe(false);
            expect(result.bestMap).toBe(null);
        });
    });

    describe('interval gating', () => {
        it('skips check when not enough chars accumulated (force=false)', () => {
            const state = makeState();
            // First forced check sets lastCheckedCharCount
            check(state, '{"m0":"a","m1":"b"}', true);

            // Add a few chars — below STREAM_MONITOR_CHECK_INTERVAL
            const shortText = '{"m0":"a","m1":"b"}' + 'x'.repeat(STREAM_MONITOR_CHECK_INTERVAL - 2);
            const result = check(state, shortText, false);
            // Should not cancel, and should return cached bestMap
            expect(result.shouldCancel).toBe(false);
        });

        it('runs check when enough chars accumulated (force=false)', () => {
            const state = makeState();
            const completeJson = '{"m0":"a","m1":"b"}';
            check(state, completeJson, true);

            // Enough trailing chars to pass interval
            const longTrailing = completeJson + 'x'.repeat(STREAM_MONITOR_CHECK_INTERVAL + 10);
            const result = check(state, longTrailing, false);
            // Should cancel because complete JSON was followed by non-whitespace
            expect(result.shouldCancel).toBe(true);
            expect(result.cancelReason).toBe(STREAM_CANCEL_REASON.COMPLETE_JSON_CONTINUED);
        });
    });

    describe('non-string rawText', () => {
        it('returns no-cancel for null rawText', () => {
            const state = makeState();
            const result = check(state, null, true);
            expect(result.shouldCancel).toBe(false);
        });
    });

    describe('NO_OPENING_BRACE', () => {
        it('cancels when no { found after STREAM_OPEN_BRACE_MAX_CHARS chars', () => {
            const state = makeState();
            const noJson = 'a'.repeat(STREAM_OPEN_BRACE_MAX_CHARS + 1);
            const result = check(state, noJson);
            expect(result.shouldCancel).toBe(true);
            expect(result.cancelReason).toBe(STREAM_CANCEL_REASON.NO_OPENING_BRACE);
        });

        it('does not cancel when { appears within limit', () => {
            const state = makeState();
            const text = 'a'.repeat(STREAM_OPEN_BRACE_MAX_CHARS - 5) + '{"m0":"hello';
            const result = check(state, text);
            expect(result.shouldCancel).toBe(false);
        });

        it('does not cancel when text is short and has no brace', () => {
            const state = makeState();
            const result = check(state, 'hello');
            expect(result.shouldCancel).toBe(false);
        });
    });

    describe('BANNED_PHRASE', () => {
        it('cancels when banned phrase found in complete object', () => {
            const state = makeState(keys2, { bannedPhrases: ['tool_call'] });
            const text = '{"m0":"use tool_call here","m1":"ok"}';
            const result = check(state, text);
            expect(result.shouldCancel).toBe(true);
            expect(result.cancelReason).toBe(STREAM_CANCEL_REASON.BANNED_PHRASE);
            expect(state.cancelMeta.phrase).toBe('tool_call');
        });

        it('cancels when banned phrase found in partial object', () => {
            const state = makeState(keys2, { bannedPhrases: ['tool_call'] });
            const text = '{"m0":"some tool_call';
            const result = check(state, text);
            expect(result.shouldCancel).toBe(true);
            expect(result.cancelReason).toBe(STREAM_CANCEL_REASON.BANNED_PHRASE);
        });

        it('does not cancel when no banned phrases configured', () => {
            const state = makeState(keys2);
            const text = '{"m0":"tool_call","m1":"b"}';
            const result = check(state, text);
            expect(result.shouldCancel).toBe(false);
        });
    });

    describe('BANNED_PHRASE (input threshold)', () => {
        it('does not cancel when response occurrence count equals input count', () => {
            // Input has "JSON" 2 times → response may contain up to 2
            const state = makeState(keys2, {
                bannedPhrases: ['JSON'],
                inputText: 'Output JSON. Also JSON.',
            });
            const text = '{"m0":"JSON result","m1":"JSON ok"}';
            const result = check(state, text);
            expect(result.shouldCancel).toBe(false);
        });

        it('cancels when response occurrence count exceeds input count', () => {
            // Input has "JSON" 1 time → 2nd occurrence in response triggers cancel
            const state = makeState(keys2, {
                bannedPhrases: ['JSON'],
                inputText: 'Return JSON please.',
            });
            const text = '{"m0":"JSON JSON","m1":"ok"}';
            const result = check(state, text);
            expect(result.shouldCancel).toBe(true);
            expect(result.cancelReason).toBe(STREAM_CANCEL_REASON.BANNED_PHRASE);
            expect(state.cancelMeta.phrase).toBe('JSON');
        });

        it('cancels on first occurrence when phrase absent from input', () => {
            // inputText has 0 occurrences of "tool_call"
            const state = makeState(keys2, {
                bannedPhrases: ['tool_call'],
                inputText: 'Translate the following text.',
            });
            const text = '{"m0":"use tool_call here","m1":"ok"}';
            const result = check(state, text);
            expect(result.shouldCancel).toBe(true);
            expect(result.cancelReason).toBe(STREAM_CANCEL_REASON.BANNED_PHRASE);
        });

        it('does not cancel when response has exactly allowed occurrences across objects and partial', () => {
            // Input has 1 "JSON" → allow 1 in response
            const state = makeState(keys2, {
                bannedPhrases: ['JSON'],
                inputText: 'Return JSON.',
            });
            // 1 occurrence in partial — exactly at the threshold
            const text = '{"m0":"JSON val';
            const result = check(state, text);
            expect(result.shouldCancel).toBe(false);
        });

        it('handles multiple banned phrases with different input counts independently', () => {
            const state = makeState(keys2, {
                bannedPhrases: ['JSON', 'tool_call'],
                inputText: 'JSON JSON tool_call',
            });
            // json: 2 allowed, tool_call: 1 allowed
            // Response has json=2 (ok), tool_call=2 (exceeds) → should cancel on tool_call
            const text = '{"m0":"JSON and JSON","m1":"tool_call tool_call"}';
            const result = check(state, text);
            expect(result.shouldCancel).toBe(true);
            expect(result.cancelReason).toBe(STREAM_CANCEL_REASON.BANNED_PHRASE);
            expect(state.cancelMeta.phrase).toBe('tool_call');
        });
    });

    describe('UNKNOWN_KEY (in-flight)', () => {
        it('cancels when in-flight closed key is not expected', () => {
            const state = makeState(['m0', 'm1']);
            const text = '{"m0":"a", "badKey": "val';
            const result = check(state, text);
            expect(result.shouldCancel).toBe(true);
            expect(result.cancelReason).toBe(STREAM_CANCEL_REASON.UNKNOWN_KEY);
        });

        it('cancels when in-flight partial key prefix cannot match any expected key', () => {
            const state = makeState(['m0', 'm1']);
            const text = '{"m0":"a", "z';
            const result = check(state, text);
            expect(result.shouldCancel).toBe(true);
            expect(result.cancelReason).toBe(STREAM_CANCEL_REASON.UNKNOWN_KEY);
        });

        it('does not cancel when in-flight key prefix matches expected key', () => {
            const state = makeState(['m0', 'm1']);
            const text = '{"m0":"a", "m';
            const result = check(state, text);
            expect(result.shouldCancel).toBe(false);
        });
    });

    describe('UNKNOWN_KEY (parsed) (complete objects with unknown keys)', () => {
        it('cancels when a fully parsed key is not in expectedKeySet', () => {
            const state = makeState(['m0']);
            const text = '{"m0":"a","extra":"b"}';
            const result = check(state, text);
            expect(result.shouldCancel).toBe(true);
            expect(result.cancelReason).toBe(STREAM_CANCEL_REASON.UNKNOWN_KEY);
            expect(state.cancelMeta.key).toBe('extra');
        });
    });

    describe('DUPLICATE_KEY', () => {
        it('cancels when duplicate keys are detected in the stream', () => {
            const state = makeState(['m0', 'm1']);
            // Raw text with duplicate key — JSON.parse takes last, but parser detects dupe
            const text = '{"m0":"a","m0":"b","m1":"c"}';
            const result = check(state, text);
            expect(result.shouldCancel).toBe(true);
            expect(result.cancelReason).toBe(STREAM_CANCEL_REASON.DUPLICATE_KEY);
            expect(state.cancelMeta.duplicateKeys).toContain('m0');
        });
    });

    describe('value too long (in-flight)', () => {
        it('cancels when an in-flight value exceeds per-key length limit', () => {
            const state = makeState(['m0', 'm1'], {
                expectedValueLengthsByKey: { m0: 10, m1: 10 },
                lengthMultiplierForMaxLength: 2,
                minimumMaxLength: 5,
            });
            // m0 limit = max(5, 10*2) = 20
            const longValue = 'x'.repeat(25);
            const text = `{"m0":"${longValue}`;
            const result = check(state, text);
            expect(result.shouldCancel).toBe(true);
            expect(result.cancelReason).toBe(STREAM_CANCEL_REASON.TRIM_TOO_LONG);
        });

        it('does not cancel when value is within limit', () => {
            const state = makeState(['m0', 'm1'], {
                expectedValueLengthsByKey: { m0: 10, m1: 10 },
                lengthMultiplierForMaxLength: 2,
                minimumMaxLength: 5,
            });
            const shortValue = 'x'.repeat(15);
            const text = `{"m0":"${shortValue}`;
            const result = check(state, text);
            expect(result.shouldCancel).toBe(false);
        });
    });

    describe('COMPLETE_JSON_CONTINUED', () => {
        it('cancels when non-whitespace text follows complete JSON', () => {
            const state = makeState();
            const json = JSON.stringify({ m0: 'a', m1: 'b' });
            // First check: captures bestMap
            check(state, json);
            // Second check: trailing garbage
            const result = check(state, json + ',\n"kbase' + 'CodeableConcept'.repeat(500) + '"');
            expect(result.shouldCancel).toBe(true);
            expect(result.cancelReason).toBe(STREAM_CANCEL_REASON.COMPLETE_JSON_CONTINUED);
            expect(result.bestMap).toEqual({ m0: 'a', m1: 'b' });
        });

        it('cancels when only whitespace follows complete JSON', () => {
            const state = makeState();
            const json = JSON.stringify({ m0: 'a', m1: 'b' });
            const result = check(state, json + '\n  \t  ');
            expect(result.shouldCancel).toBe(true);
            expect(result.cancelReason).toBe(STREAM_CANCEL_REASON.COMPLETE_JSON_CONTINUED);
            expect(result.bestMap).toEqual({ m0: 'a', m1: 'b' });
        });

        it('does not cancel when JSON is complete with no trailing chars', () => {
            const state = makeState();
            const json = JSON.stringify({ m0: 'a', m1: 'b' });
            const result = check(state, json);
            expect(result.shouldCancel).toBe(false);
            expect(result.bestMap).toEqual({ m0: 'a', m1: 'b' });
        });

        it('preserves bestMap from the complete JSON even after cancellation', () => {
            const state = makeState();
            const json = JSON.stringify({ m0: 'first', m1: 'second' });
            check(state, json);

            const garbage = json + '\nsome random garbage output looping forever';
            const result = check(state, garbage);
            expect(result.shouldCancel).toBe(true);
            expect(result.bestMap).toEqual({ m0: 'first', m1: 'second' });
        });
    });

    describe('regression: CodeableConcept loop after complete JSON', () => {
        it('cancels immediately when LLM loops nonsense after valid 50-key JSON', () => {
            const keys = Array.from({ length: 50 }, (_, i) => `m${i}`);
            const map = Object.fromEntries(keys.map((k, i) => [k, `Translation ${i}`]));
            const json = JSON.stringify(map);

            const state = makeState(keys);
            // First chunk: complete JSON arrives
            check(state, json);
            expect(state.bestIsComplete).toBe(true);

            // Second chunk: LLM starts looping CodeableConcept
            const looped = json + ',\n"kbaseCodeableConcept' + 'CodeableConcept'.repeat(800);
            const result = check(state, looped);
            expect(result.shouldCancel).toBe(true);
            expect(result.cancelReason).toBe(STREAM_CANCEL_REASON.COMPLETE_JSON_CONTINUED);
            // All 50 keys are preserved
            for (const key of keys) {
                expect(result.bestMap).toHaveProperty(key);
            }
        });

        it('cancels when JSON is structurally closed but missing expected keys, then LLM loops', () => {
            // 100 expected keys but JSON only contains 73 of them
            const allKeys = Array.from({ length: 100 }, (_, i) => `m${i}`);
            const partialMap = Object.fromEntries(
                allKeys.slice(0, 73).map((k, i) => [k, `Translation ${i}`])
            );
            const json = JSON.stringify(partialMap);

            const state = makeState(allKeys);
            // JSON is structurally complete but bestIsComplete is false (27 keys missing)
            check(state, json);
            expect(state.bestIsComplete).toBe(false);

            // LLM continues with garbage after the closed JSON
            const looped = json + ',\n"kbaseCodeableConcept' + 'CodeableConcept'.repeat(800);
            const result = check(state, looped);
            expect(result.shouldCancel).toBe(true);
            expect(result.cancelReason).toBe(STREAM_CANCEL_REASON.COMPLETE_JSON_CONTINUED);
            // The 73 keys we got are still preserved
            expect(Object.keys(result.bestMap).length).toBe(73);
        });
    });

    describe('INVALID_JSON_PROGRESS', () => {
        it('cancels when partial JSON has invalid structure outside of a string', () => {
            const state = makeState(['m0', 'm1']);
            // Key "m1" is followed by a digit instead of colon — invalid key-parsing progress
            const text = '{"m0":"ok", "m1" 123';
            const result = check(state, text);
            expect(result.shouldCancel).toBe(true);
            expect(result.cancelReason).toBe(STREAM_CANCEL_REASON.INVALID_JSON_PROGRESS);
        });
    });

    describe('happy paths — no cancellation', () => {
        it('accepts valid in-progress JSON with matching keys', () => {
            const state = makeState(['m0', 'm1', 'm2']);
            const text = '{"m0":"hello","m1":"world","m2":"in prog';
            const result = check(state, text);
            expect(result.shouldCancel).toBe(false);
            expect(result.bestMap).toBeTruthy();
            expect(result.bestMap.m0).toBe('hello');
            expect(result.bestMap.m1).toBe('world');
        });

        it('accepts complete JSON exactly matching expected keys', () => {
            const state = makeState();
            const text = '{"m0":"hello","m1":"world"}';
            const result = check(state, text);
            expect(result.shouldCancel).toBe(false);
            expect(result.bestMap).toEqual({ m0: 'hello', m1: 'world' });
            expect(state.bestIsComplete).toBe(true);
        });

        it('tracks bestMap progressively as stream grows', () => {
            const state = makeState(['m0', 'm1', 'm2']);

            check(state, '{"m0":"a"', true);
            expect(state.bestMap).toEqual({ m0: 'a' });
            expect(state.bestIsComplete).toBe(false);

            check(state, '{"m0":"a","m1":"b"', true);
            expect(state.bestMap).toEqual({ m0: 'a', m1: 'b' });

            check(state, '{"m0":"a","m1":"b","m2":"c"}', true);
            expect(state.bestMap).toEqual({ m0: 'a', m1: 'b', m2: 'c' });
            expect(state.bestIsComplete).toBe(true);
        });

        it('handles JSON with preamble text before opening brace', () => {
            const state = makeState();
            const text = 'Here is the translation:\n{"m0":"a","m1":"b"}';
            const result = check(state, text);
            expect(result.shouldCancel).toBe(false);
            expect(result.bestMap).toEqual({ m0: 'a', m1: 'b' });
        });
    });

    describe('analyzeAndScan - partial repair', () => {
        it('repairs partial object and returns candidate map', () => {
            const { candidateMap } = StreamGuardrails.analyzeAndScan('{"m0":"hello","m1":"wor', [
                'm0',
                'm1',
            ]);
            expect(candidateMap).toBeTruthy();
            expect(candidateMap.m0).toBe('hello');
        });

        it('returns null candidateMap for empty text', () => {
            const { candidateMap } = StreamGuardrails.analyzeAndScan('', ['m0']);
            expect(candidateMap).toBe(null);
        });
    });
});
