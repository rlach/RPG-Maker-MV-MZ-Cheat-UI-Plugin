import { afterEach, expect, it, vi } from 'vitest';
import AIEngine from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/AIEngine.js';
import {
    TAG_TYPE,
    TAG_BRACKET,
} from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/constants.js';
afterEach(() => vi.unstubAllGlobals());

it.each([
    ['data/Map.json ファイルが見つかりません。', 'data/Map.json file not found.', null],
    ['JSON json', 'Json', null],
    ['json', 'JSON json', 'JSON'],
    ['原文', 'Output JSON', 'JSON'],
    ['json', 'Translated text', null],
    ['json tool_call', 'JSON TOOL_CALL', null],
    ['json tool_call', 'JSON tool_call TOOL_CALL', 'tool_call'],
])('rejects only occurrences beyond the source allowance: %s', (source, translated, expected) => {
    const engine = new AIEngine({ sourceLang: 'ja', targetLang: 'en' });
    expect(engine.findFirstBannedPhrase(translated, ['JSON', 'tool_call'], source)).toBe(expected);
});

it('accepts the reported JSON filename while rejecting excess occurrences independently per batch item', async () => {
    vi.stubGlobal('window', globalThis);
    const engine = new AIEngine({
        sourceLang: 'ja',
        targetLang: 'en',
        translationCache: new Map(),
    });
    engine.selectedModel = 'test';
    engine.askAiIfTextTranslated = false;
    engine.bannedPhrasesText = 'JSON';
    engine.addPluginTags('test', [
        {
            tagSymbol: 'COT',
            type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
            bracket: TAG_BRACKET.SQUARE,
            maskValue: true,
            requiredConsistency: true,
        },
    ]);
    vi.spyOn(engine.tagManager, 'buildNameHints').mockReturnValue('');
    // Preserve encoded tags verbatim, exercising the real preprocess/postprocess pipeline.
    vi.spyOn(engine, 'requestChatCompletion').mockImplementation(async (payload) => {
        const content = payload.messages.findLast((message) => message.role === 'user').content;
        const map = JSON.parse(content.slice(content.indexOf('{')));
        const keys = Object.keys(map);
        return {
            text: JSON.stringify({
                [keys[0]]: map[keys[0]].replace(
                    'ファイルが見つかりません。NPCイベントの取得に失敗しました。',
                    'file not found. Failed to retrieve NPC event.'
                ),
                [keys[1]]: 'Unexpected JSON output',
                [keys[2]]: 'JSON json output',
            }),
        };
    });
    const result = await engine.batchTranslate([
        {
            type: 'item_name',
            id: 1,
            value: 'MapId:data/\\COT[0].json ファイルが見つかりません。NPCイベントの取得に失敗しました。',
            cacheKey: 'one',
        },
        { type: 'item_name', id: 2, value: '原文', cacheKey: 'two' },
        { type: 'item_name', id: 3, value: 'json 原文', cacheKey: 'three' },
    ]);
    expect(result.successes).toHaveLength(1);
    expect(result.successes[0].translated).toBe(
        'MapId:data/\\COT[0].json file not found. Failed to retrieve NPC event.'
    );
    expect(result.failures).toHaveLength(2);
    expect(result.failures.map((f) => f.id)).toEqual([2, 3]);
    expect(result.failures.every((f) => f.rejectReason === 'Contains banned phrase: JSON')).toBe(
        true
    );
});
