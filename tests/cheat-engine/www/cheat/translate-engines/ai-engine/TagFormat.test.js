import { afterEach, describe, expect, it, vi } from 'vitest';
import { TagSyntax } from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/TagSyntax.js';
import { TagManager } from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/TagManager.js';
import AIEngine from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/AIEngine.js';
import {
    TAG_TYPE,
    TAG_STYLE,
} from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/constants.js';
import TagPanel from '../../../../../../cheat-engine/www/cheat/panels/TranslateTagManagerPanel.js';

vi.mock(
    '../../../../../../cheat-engine/www/cheat/js/translation-runtime/TranslationRuntime.js',
    () => ({ ensureTranslationRuntime: vi.fn() })
);
vi.mock('../../../../../../cheat-engine/www/cheat/js/KnowledgeBaseRuntime.js', () => ({
    ensureKnowledgeForLangPair() {},
    getKnowledgeEntries: () => [],
}));

afterEach(() => vi.unstubAllGlobals());

const customTags = [
    {
        description: 'Nested name',
        tagSymbol: 'NI',
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        bracket: '[',
        maskValue: false,
        requiredConsistency: true,
    },
    {
        description: 'Portrait filename',
        tagSymbol: 'PORTRAIT',
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        bracket: '[',
        maskValue: true,
        requiredConsistency: true,
    },
    {
        description: 'XML caption',
        tagSymbol: 'Caption',
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        style: TAG_STYLE.XML,
        maskValue: false,
        requiredConsistency: true,
    },
];

describe.each(['tags', 'legacy'])('%s tag transport', (format) => {
    function manager() {
        const tm = new TagManager(null);
        tm.setTagFormat(format);
        tm.setCustomTagConfigs(customTags);
        return tm;
    }

    it.each(['[', '<', '(', '{'])(
        'preserves nested %s values with masking enabled or disabled',
        (open) => {
            const close = { '[': ']', '<': '>', '(': ')', '{': '}' }[open];
            for (const maskValue of [false, true]) {
                const tm = manager();
                tm.setCustomTagConfigs([
                    {
                        description: 'Nested custom value',
                        tagSymbol: 'Q',
                        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
                        bracket: open,
                        maskValue,
                        requiredConsistency: true,
                    },
                ]);
                const source = `\\Q${open}outer${open}inner${close}${close}`;
                const packed = tm.preprocessTags(source);
                expect(
                    tm.postprocessTags(packed.preprocessedText, packed.tagCounts, packed.caseMap)
                ).toMatchObject({ valid: true, text: source });
            }
        }
    );

    it('preserves Japanese name brackets while rejecting a fabricated transport tag', () => {
        const tm = manager();
        const source = 'Magic【カンディダ＝ローザ】\nUse【カンディダ＝ローザ】';
        const packed = tm.preprocessTags(source);
        const translated = packed.preprocessedText.replaceAll(
            '【カンディダ＝ローザ】',
            '【Candida Rosa】'
        );
        expect(tm.postprocessTags(translated, packed.tagCounts, packed.caseMap)).toMatchObject({
            valid: true,
            text: 'Magic【Candida Rosa】\nUse【Candida Rosa】',
        });
        const fabricated = translated.replace('【Candida Rosa】', tm.syntax.encode('Candida Rosa'));
        const result = tm.postprocessTags(fabricated, packed.tagCounts, packed.caseMap);
        expect(result.valid).toBe(false);
        expect(result.unresolvedTags[0].tag).toBe(tm.syntax.encode('Candida Rosa'));
    });

    it('roundtrips numeric, no-parameter, nested, masked, XML, newline and long-run tags', () => {
        const tm = manager();
        const source =
            '\\C[2]【カンディダ＝ローザ】\\G \\NI[\\V[1]] \\PORTRAIT[hero[happy]] <Caption:Title>\n' +
            ' '.repeat(20);
        const packed = tm.preprocessTags(source);
        expect(packed.caseMap.tagFormat).toBe(format);
        expect(packed.preprocessedText).toContain(new TagSyntax(format).encode('sn'));
        expect(packed.preprocessedText).toContain('【カンディダ＝ローザ】');
        expect(packed.preprocessedText).not.toContain('hero[happy]');
        expect(
            tm.postprocessTags(packed.preprocessedText, packed.tagCounts, packed.caseMap)
        ).toMatchObject({ valid: true, text: source });
        expect(tm.validateUnknownTags(packed.preprocessedText, packed)).toEqual({
            valid: true,
            unknownTags: [],
        });
        const entry = tm.customParameterEntries.find((e) => e.tagSymbol === 'NI');
        const translated = packed.preprocessedText.replace('Title', 'Translated title');
        expect(tm.postprocessTags(translated, packed.tagCounts, packed.caseMap).text).toContain(
            '<Caption:Translated title>'
        );
        expect(entry).toBeTruthy();
    });

    it('rejects missing, duplicated, unknown, malformed and invalid masked tags', () => {
        const tm = manager();
        const syntax = tm.syntax;
        const packed = tm.preprocessTags('A\\V[1]\n\\PORTRAIT[secret]');
        const variable = syntax.encode('wi1');
        for (const text of [
            packed.preprocessedText.replace(variable, ''),
            packed.preprocessedText + variable,
            packed.preprocessedText + syntax.encode('unknown'),
            packed.preprocessedText + syntax.open + 'broken',
        ]) {
            expect(tm.postprocessTags(text, packed.tagCounts, packed.caseMap).valid).toBe(false);
        }
        const masked = tm.customParameterEntries.find((e) => e.tagSymbol === 'PORTRAIT');
        const badMask = packed.preprocessedText.replace(
            syntax.encode(`${masked.tagId}[0]`),
            syntax.encode(`${masked.tagId}[99]`)
        );
        expect(tm.postprocessTags(badMask, packed.tagCounts, packed.caseMap).valid).toBe(false);
    });

    it('uses the original request format if the dropdown changes before its response arrives', () => {
        const tm = manager();
        const source = '\\NI[\\V[2]]\n\\PORTRAIT[face]';
        const packed = tm.preprocessTags(source);
        tm.setTagFormat(format === 'tags' ? 'legacy' : 'tags');
        expect(
            tm.postprocessTags(packed.preprocessedText, packed.tagCounts, packed.caseMap)
        ).toMatchObject({ valid: true, text: source });
        expect(tm.syntax.format).not.toBe(format);
    });

    it('shares unknown-tag validation with ValidationService, including nested tokens', () => {
        const engine = new AIEngine({});
        engine.aiTagFormat = format;
        engine.setCustomTags(customTags);
        const syntax = engine.tagManager.syntax;
        const packed = engine.tagManager.preprocessTags('\\NI[\\V[1]]');
        const bad = packed.preprocessedText.replace(/wi1/, 'invented');
        const result = engine.validationService.validateNoHallucinations(bad, packed);
        expect(result.valid).toBe(false);
        expect(result.hallucinations).toContain('invented');
        expect(
            engine.validationService.validateNoHallucinations(packed.preprocessedText, packed).valid
        ).toBe(true);
        const unknown = syntax.encode('madeup');
        expect(engine.validationService.validateNoHallucinations(unknown, packed).valid).toBe(
            false
        );
    });

    it('sends matching system/custom/boxing instructions and restores the batch response', async () => {
        const engine = new AIEngine({
            sourceLang: 'ja',
            targetLang: 'en',
            translationCache: new Map(),
            addBoxWidthInfoToLlmPrompt: true,
            cleanTranslatedText: (text) => text,
            wrapText: (text) => text,
        });
        engine.aiTagFormat = format;
        engine.systemPrompt = 'Preserve [b=sn] and translate [b=na<Name>]. Never change 【】.';
        engine.askAiIfTextTranslated = false;
        engine.selectedModel = 'test';
        vi.spyOn(engine.tagManager, 'buildNameHints').mockReturnValue('');
        const syntax = new TagSyntax(format);
        const request = vi
            .spyOn(engine, 'requestChatCompletion')
            .mockImplementation(async (payload) => {
                const system = payload.messages.find((m) => m.role === 'system').content;
                const user = payload.messages.findLast((m) => m.role === 'user').content;
                const input = JSON.parse(user.slice(user.indexOf('{')));
                expect(system).toContain(syntax.encode('sn'));
                expect(system).toContain(syntax.encode('na<Name>'));
                const other = new TagSyntax(format === 'tags' ? 'legacy' : 'tags');
                expect(system).not.toContain(other.open);
                expect(Object.values(input)[0]).toContain(syntax.encode('sn'));
                // Exercise a format change while this request is in flight.
                engine.aiTagFormat = other.format;
                return { text: JSON.stringify(input) };
            });
        const source = '【カンディダ＝ローザ】\nText';
        const result = await engine.batchTranslate([
            { type: 'item_description', id: 1, value: source, cacheKey: 'test' },
        ]);
        expect(request).toHaveBeenCalledOnce();
        expect(result.failures).toEqual([]);
        expect(result.successes[0].translated).toBe(source);
    });
});

it('adapts nested saved prompt examples in both directions without modifying the setting', () => {
    const legacy = 'Keep [b=ni[[b=wi1]]] and [b=sn], [b=na<Name>] and [/b].';
    const modern = 'Keep ⟪TAG:ni[⟪TAG:wi1⟫]⟫ and ⟪TAG:sn⟫, ⟪TAG:na<Name>⟫ and ⟪/TAG⟫.';
    expect(new TagSyntax().formatPrompt(legacy)).toBe(modern);
    expect(new TagSyntax('legacy').formatPrompt(modern)).toBe(legacy);
    expect(new TagSyntax().formatPrompt('Preserve b=sn and never add [b=...')).toBe(
        'Preserve ⟪TAG:sn⟫ and never add ⟪TAG:...'
    );
});

it('exposes a single format selector in Tag Manager and updates its newline preview', () => {
    expect(TagPanel.template).toContain('LLM tag format');
    const engine = new AIEngine({});
    expect(engine.aiTagFormat).toBe('tags');
    expect(engine.configManager.getData().aiTagFormatOptions).toHaveLength(2);
    for (const format of ['legacy', 'tags']) {
        engine.aiTagFormat = format;
        const context = { _runtime: { engine } };
        expect(TagPanel.methods.formatTagDisplay.call(context, { _isSimpleNTag: true })).toBe(
            '\\n'
        );
        expect(TagPanel.methods.formatTagEncoding.call(context, { _isSimpleNTag: true })).toBe(
            new TagSyntax(format).encode('sn')
        );
    }
});
