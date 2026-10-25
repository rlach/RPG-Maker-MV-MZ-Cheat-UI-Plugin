import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AIEngine from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/AIEngine.js';
import { ConfigManager } from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/ConfigManager.js';
import { StreamJsonParser } from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/StreamJsonParser.js';
import {
    translationResponseSchema,
    structuredRequestParameters,
} from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/StructuredOutput.js';
import {
    createTranslationRuntimeStateDefaults,
    serializePersistedTranslationSettings,
} from '../../../../../../cheat-engine/www/cheat/js/translation-runtime/TranslationRuntimeDefaults.js';

vi.mock('../../../../../../cheat-engine/www/cheat/js/translation-runtime/TranslationRuntime.js', () => ({ ensureTranslationRuntime: vi.fn() }));
vi.mock('../../../../../../cheat-engine/www/cheat/js/TranslateOnTheFlyState.js', () => ({ TranslateOnTheFlyState: { isEnabled: () => false, setEnabled: () => {} } }));
import Panel from '../../../../../../cheat-engine/www/cheat/panels/TranslateOnTheFlyPanel.js';

afterEach(() => vi.unstubAllGlobals());

describe('experimental Strata constrained decoding', () => {
    it('keeps translation IDs exact, values strings and missing keys recoverable', () => {
        const schema = translationResponseSchema(['m0', 'm12', 't3d']);
        expect(schema.additionalProperties).toBe(false);
        expect(Object.keys(schema.properties)).toEqual(['m0', 'm12', 't3d']);
        expect(schema.properties.m0).toEqual({ type: 'string' });
        expect(schema.required).toBeUndefined();
        expect(schema.patternProperties).toBeUndefined();
        expect(
            translationResponseSchema(['m0'], { allowKnowledgeBase: true }).properties.kbase.items
                .properties.translation.type
        ).toBe('string');
    });

    it('is opt-in and only affects the compatible provider', () => {
        const engine = new AIEngine({});
        expect(engine.useStrataConstrained).toBe(false);
        expect(structuredRequestParameters(engine, {})).toEqual({
            response_format: { type: 'json_object' },
        });
        engine.aiUseStrataConstrained = true;
        const result = structuredRequestParameters(engine, {}, { expectedKeys: ['m1'] });
        expect(result.strata_constrained).toBe(true);
        expect(result.reasoning_effort).toBe('none');
        expect(result.response_format.json_schema.schema.properties.m1.type).toBe('string');
        engine.provider = 'openwebui';
        expect(structuredRequestParameters(engine, {}).strata_constrained).toBeUndefined();
    });

    it('persists the option and exposes the standard settings control', () => {
        const engine = new AIEngine({});
        engine.aiUseStrataConstrained = true;
        expect(engine.configManager.getData().aiUseStrataConstrained).toBe(true);
        expect(createTranslationRuntimeStateDefaults([]).aiUseStrataConstrained).toBe(false);
        expect(
            serializePersistedTranslationSettings({
                engineSettings: { openApi: engine.getConfigData() },
            }).engineSettings.openApi.aiUseStrataConstrained
        ).toBe(true);
        expect(ConfigManager.getTemplate()).toContain('Experimental: Use strata constrained');
    });

    it('sends JSON on every request, overrides thinking only with the option, and keeps explicit repair schemas', async () => {
        const calls = [];
        vi.stubGlobal(
            'fetch',
            vi.fn(async (_url, options) => {
                calls.push(JSON.parse(options.body));
                return new Response(
                    JSON.stringify({ choices: [{ message: { content: '{"m1":"Hello"}' } }] }),
                    { headers: { 'content-type': 'application/json' } }
                );
            })
        );
        const engine = new AIEngine({});
        engine.reasoningEffort = 'high';
        engine.selectedModel = 'test';
        const payload = { messages: [{ role: 'user', content: 'Translate' }], max_tokens: 100 };
        await engine.requestChatCompletion(payload, { expectedKeys: ['m1'] });
        engine.aiUseStrataConstrained = true;
        await engine.requestChatCompletion(payload, { expectedKeys: ['m1'] });
        await engine.retryHandler.retryJsonRepair('{"m1":bad}', 0, false, ['m1']);
        await engine.retryHandler.retryTranslationWithError(
            { ...payload, messages: [{ role: 'user', content: 'Translate: {"m1":"Hello"}' }] },
            '{"m1":bad}'
        );
        expect(calls[0].response_format).toEqual({ type: 'json_object' });
        expect(calls[0].reasoning_effort).toBe('high');
        for (const body of calls.slice(1)) {
            expect(body.strata_constrained).toBe(true);
            expect(body.reasoning_effort).toBe('none');
            expect(Object.keys(body.response_format.json_schema.schema.properties)).toEqual(['m1']);
        }
        expect(payload.response_format).toBeUndefined();
    });

    it('forwards the panel checkbox into real requests and sends explicit none when disabled', async () => {
        const calls = [];
        vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
            calls.push(JSON.parse(options.body));
            return new Response(JSON.stringify({ choices: [{ message: { content: '{"m1":"Hello"}' } }] }),
                { headers: { 'content-type': 'application/json' } });
        }));
        const runtime = { saveSettings: vi.fn() };
        const engine = new AIEngine(runtime);
        engine.reasoningEffort = 'none';
        Object.assign(runtime, engine.getConfigMethods());
        const panel = { _runtime: runtime, syncRuntimeRefs: vi.fn(), callRuntime: Panel.methods.callRuntime };
        await Panel.methods.onChangeAiUseStrataConstrained.call(panel, true);
        expect(engine.getConfigData().aiUseStrataConstrained).toBe(true);
        await engine.requestChatCompletion({ messages: [{ role: 'user', content: 'Translate' }] }, { expectedKeys: ['m1'] });
        expect(calls[0].strata_constrained).toBe(true);
        expect(calls[0].reasoning_effort).toBe('none');
        expect(calls[0].response_format.json_schema.schema.properties.m1).toEqual({ type: 'string' });
        await Panel.methods.onChangeAiUseStrataConstrained.call(panel, false);
        await engine.requestChatCompletion({ messages: [{ role: 'user', content: 'Translate' }] });
        expect(calls[1].strata_constrained).toBeUndefined();
        expect(calls[1].reasoning_effort).toBe('none');
        expect(runtime.saveSettings).toHaveBeenCalledTimes(2);
    });

    it('uses the shared model and persistence flow for checkbox and dropdown changes', async () => {
        const runtime = { aiUseStrataConstrained: false };
        runtime.engine = new AIEngine(runtime);
        runtime.bindEngineConfigTo = target => Object.assign(target, runtime.engine.getConfigData());
        runtime.saveSettings = vi.fn(() => {
            expect(runtime.aiUseStrataConstrained).toBe(runtime.engine.useStrataConstrained);
            expect(runtime.aiReasoningEffort).toBe(runtime.engine.reasoningEffort);
        });
        Object.assign(runtime, runtime.engine.getConfigMethods());
        const panel = { _runtime: runtime, stateVersion: 0, syncRuntimeRefs: vi.fn(), callRuntime: Panel.methods.callRuntime };
        Panel.computed.aiUseStrataConstrained.set.call(panel, true);
        await Panel.methods.onChangeAiUseStrataConstrained.call(panel, true);
        expect(runtime.engine.useStrataConstrained).toBe(true);
        Panel.computed.aiReasoningEffort.set.call(panel, 'high');
        await Panel.methods.onChangeAiReasoningEffort.call(panel, 'high');
        expect(runtime.engine.reasoningEffort).toBe('high');
        expect(runtime.saveSettings).toHaveBeenCalledTimes(2);
    });

    it('writes checkbox changes to the real settings file and restores the request contract after restart', async () => {
        vi.stubGlobal('require', createRequire(import.meta.url));
        const { KeyValueStorage } = await import('../../../../../../cheat-engine/www/cheat/js/KeyValueStorage.js');
        const { translateOnTheFlySettingsMethods } = await import('../../../../../../cheat-engine/www/cheat/js/translation-runtime/TranslateOnTheFlySettingsMethods.js');
        const dir = mkdtempSync(path.join(tmpdir(), 'strata-setting-'));
        const file = path.join(dir, 'settings.json');
        const createRuntime = () => ({
            ...createTranslationRuntimeStateDefaults([]), ...translateOnTheFlySettingsMethods,
            kvStorage: new KeyValueStorage(file), saveGameTranslationSettings() {},
            loadGameTranslationSettings() {}, applyGameTranslationEngineSettings() {},
        });
        try {
            const runtime = createRuntime();
            runtime.translationEngine = 'openApi';
            runtime.engine = new AIEngine(runtime);
            Object.assign(runtime, runtime.engine.getConfigMethods());
            const panel = { _runtime: runtime, stateVersion: 0, syncRuntimeRefs: vi.fn(), callRuntime: Panel.methods.callRuntime };
            Panel.computed.aiUseStrataConstrained.set.call(panel, true);
            await Panel.methods.onChangeAiUseStrataConstrained.call(panel, true);
            expect(JSON.parse(readFileSync(file, 'utf8')).engineSettings.openApi.aiUseStrataConstrained).toBe(true);
            const restarted = createRuntime();
            restarted.loadSettings();
            restarted.engine = new AIEngine(restarted);
            restarted.restoreTranslationEngineSettings();
            Object.assign(restarted, restarted.engine.getConfigData(), restarted.engine.getConfigMethods());
            expect(restarted.engine.useStrataConstrained).toBe(true);
            expect(Panel.computed.aiUseStrataConstrained.get.call({ _runtime: restarted, stateVersion: 0 })).toBe(true);
            const requests = [];
            vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
                requests.push(JSON.parse(options.body));
                return new Response(JSON.stringify({ choices: [{ message: { content: '{"m1":"Hello"}' } }] }),
                    { headers: { 'content-type': 'application/json' } });
            }));
            await restarted.engine.requestChatCompletion({ messages: [{ role: 'user', content: 'Translate' }] }, { expectedKeys: ['m1'] });
            expect(requests[0].strata_constrained).toBe(true);
            expect(requests[0].reasoning_effort).toBe('none');
            const reopenedPanel = { _runtime: restarted, stateVersion: 0, syncRuntimeRefs: vi.fn(), callRuntime: Panel.methods.callRuntime };
            Panel.computed.aiUseStrataConstrained.set.call(reopenedPanel, false);
            await Panel.methods.onChangeAiUseStrataConstrained.call(reopenedPanel, false);
            const disabled = createRuntime();disabled.loadSettings();disabled.engine = new AIEngine(disabled);disabled.restoreTranslationEngineSettings();
            expect(disabled.engine.useStrataConstrained).toBe(false);
        } finally { rmSync(dir, { recursive: true, force: true }); }
    });

    it('uses a separate boolean JSON contract for language checking', async () => {
        const engine = new AIEngine({});
        engine.aiUseStrataConstrained = true;
        engine.requestChatCompletion = vi.fn(async () => ({ text: '{"isTranslated":false}' }));
        expect(
            (
                await engine.validationService.validateResponseLanguage(
                    'Hello',
                    'English',
                    'Japanese'
                )
            ).isTranslated
        ).toBe(false);
        const [payload, options] = engine.requestChatCompletion.mock.calls[0];
        expect(payload.messages[0].content).toContain('"isTranslated"');
        expect(options.responseSchema.properties.isTranslated.type).toBe('boolean');
    });

    it('rejects duplicate and invented IDs even when JSON.parse would silently accept them', () => {
        const engine = new AIEngine({});
        expect(() => StreamJsonParser.parseObjectStrict('{"m1":"A","m1":"B"}')).toThrow(
            'duplicate_key'
        );
        expect(() => StreamJsonParser.parseObjectStrict('{"m1":"A","m\\u0031":"B"}')).toThrow(
            'duplicate_key'
        );
        expect(() => engine.parseTranslatedMapFromText('{"m1":"A"} {"m1":"B"}', ['m1'])).toThrow(
            'duplicate_key'
        );
        expect(() => engine.parseTranslatedMapFromText('{"m9":"A"}', ['m1'])).toThrow(
            'unknown_key'
        );
        expect(engine.parseTranslatedMapFromText('{"m1":"A"}', ['m1', 'm2'])).toEqual({ m1: 'A' });
        expect(
            engine.validationService.validateTranslatedMapShape({ m1: 'A', unknown: 'B' }, [
                { jsonKey: 'm1' },
            ]).unknownKeys
        ).toEqual(['unknown']);
    });
});
