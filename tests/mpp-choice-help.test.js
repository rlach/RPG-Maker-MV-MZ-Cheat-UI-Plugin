import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock(
    '../cheat-engine/www/cheat/js/translation-runtime/ObjectTranslationModalMethods.js',
    () => ({ loadMapDataById: vi.fn() })
);
import { MppChoiceExTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/MppChoiceExTranslator.js';

let translator, runtime, message, choices;
const source = ['施設や部隊の成果物の受け取りや維持費の支払い', '部隊の回復、訓練'];
beforeEach(() => {
    vi.stubGlobal('window', globalThis);
    class Message {
        setChoiceHelpTexts(texts) {
            this._helpTexts = texts;
        }
        helpTexts() {
            return this._helpTexts;
        }
    }
    class Choices {
        index() {
            return this.selected || 0;
        }
        updateHelp() {
            const texts =
                typeof message.helpTexts === 'function'
                    ? message.helpTexts()[this.index()]
                    : message._helpTexts[this.index()];
            this.rendered = texts ? texts.join('\n') : '';
            if (this.fail) throw new Error('draw failure');
        }
    }
    vi.stubGlobal('Game_Message', Message);
    vi.stubGlobal('Window_ChoiceList', Choices);
    vi.stubGlobal('__CHEAT_MPP_CHOICE_EX_TRANSLATOR_HOOKED__', false);
    message = new Message();
    message.setChoiceHelpTexts([source, ['別の説明'], undefined]);
    vi.stubGlobal('$gameMessage', message);
    runtime = {
        translationCache: new Map(),
        getCacheKey: (value) => value,
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
        trackCacheKeyUsage: vi.fn(),
        cleanTranslatedText: (text) => text,
        maxLineWidth: 0,
    };
    translator = new MppChoiceExTranslator();
    translator.getRuntime = () => runtime;
    translator.isRuntimeTranslationActive = () => true;
    expect(translator.enablePluginTranslation()).toBe(true);
    choices = new Choices();
});
afterEach(() => vi.unstubAllGlobals());

it('reads translations at hover time even when loaded after choices were opened, without harvesting outputs', () => {
    const original = message._helpTexts;
    choices.updateHelp();
    expect(choices.rendered).toBe(source.join('\n'));
    runtime.translationCache.set(
        source.join('\n'),
        'Receive products and pay costs.\nRecover and train units.'
    );
    choices.updateHelp();
    expect(choices.rendered).toBe('Receive products and pay costs.\nRecover and train units.');
    choices.selected = 1;
    choices.updateHelp();
    choices.selected = 0;
    choices.updateHelp();
    expect(message._helpTexts).toBe(original);
    expect(message._helpTexts[0]).toBe(source);
    expect(Object.hasOwn(message, 'helpTexts')).toBe(false);
    const seen = runtime.trackCacheKeyUsage.mock.calls.map(([key]) => key);
    expect(seen).toContain(source.join('\n'));
    expect(seen).not.toContain('Receive products and pay costs.\nRecover and train units.');
});

it('keeps variable escape commands until the native message renderer resolves them', () => {
    const text = '資金：\\V[8]\\G　治安：\\V[13]\n公的な資金を投入します。';
    message.setChoiceHelpTexts([text.split('\n')]);
    runtime.translationCache.set(text, 'Funds: \\V[8]\\G Order: \\V[13]\nInvest public funds.');
    choices.updateHelp();
    expect(choices.rendered).toContain('Funds: \\V[8]\\G');
    expect(message._helpTexts[0].join('\n')).toBe(text);
});

it('supports private help tables, missing entries and translation disabled', () => {
    message.helpTexts = undefined;
    runtime.translationCache.set(source.join('\n'), 'English');
    choices.updateHelp();
    expect(choices.rendered).toBe('English');
    translator.isRuntimeTranslationActive = () => false;
    choices.updateHelp();
    expect(choices.rendered).toBe(source.join('\n'));
    choices.selected = 2;
    choices.updateHelp();
    expect(choices.rendered).toBe('');
});

it('restores source data when the native help renderer throws', () => {
    const original = message._helpTexts;
    runtime.translationCache.set(source.join('\n'), 'English');
    choices.fail = true;
    expect(() => choices.updateHelp()).toThrow('draw failure');
    expect(message._helpTexts).toBe(original);
    expect(message.helpTexts()).toBe(original);
});

it('scans the same multiline comment block used by MPP 4.3.5 at runtime', () => {
    const entries = [];
    translator.collectChoiceTextsFromList(
        [
            { code: 108, parameters: ['選択肢ヘルプ'] },
            ...source.map((text) => ({ code: 408, parameters: [text] })),
            { code: 0, parameters: [] },
        ],
        { scope: 'commonEvent' },
        entries
    );
    expect(entries[0].text).toBe(source.join('\n'));
    expect(entries[0].cacheType).toBe('plugin_mpp_choice_ex');
});
