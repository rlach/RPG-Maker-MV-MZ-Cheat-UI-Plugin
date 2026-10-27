import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock(
    '../cheat-engine/www/cheat/js/translation-runtime/ObjectTranslationModalMethods.js',
    () => ({ loadMapDataById: vi.fn() })
);
import AIEngine from '../cheat-engine/www/cheat/translate-engines/ai-engine/AIEngine.js';
import * as adapters from '../cheat-engine/www/cheat/translate-engines/plugins/translators/GeneralPluginTagsTranslators.js';
import { TRPSkitTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/TrpSkitTranslator.js';
import { DTextPictureTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/DTextPictureTranslator.js';
import { FtkrCustomSimpleActorStatusTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/FtkrCustomSimpleActorStatusTranslator.js';

let engine;
beforeEach(() => {
    vi.stubGlobal('window', globalThis);
    engine = new AIEngine({ sourceLang: 'ja', targetLang: 'en' });
    vi.stubGlobal('__TranslationRuntime', { engine });
});
afterEach(() => vi.unstubAllGlobals());

function roundTrip(text) {
    const encoded = engine.tagManager.preprocessTags(text);
    expect(encoded.preprocessedText).not.toBe(text);
    const decoded = engine.tagManager.postprocessTags(
        encoded.preprocessedText,
        encoded.tagCounts,
        encoded.caseMap
    );
    expect(decoded.text).toBe(text);
    expect(decoded.valid).toBe(true);
    return encoded.preprocessedText;
}

it.each([
    ['MkrControlCharacterExTranslator', '\\ME[勝利,\\V[4],100,0]\\N[2,3]\\IM[8]'],
    ['EnemyPositionTranslator', '<PosX:100><PosY:200>'],
    ['MnkrEnemyIconTranslator', '<MNKR_EnemyIcon:64,65>'],
    ['FtkrExBattleCommandTranslator', '<FTKR_ACTOR_COMMAND:custom 27 1 27>'],
    ['TmEventItemExTranslator', '<subCategory:card>'],
    ['HzRandomChoiceTranslator', '<random><timer>'],
    ['PermanentStateTranslator', '<永続ステート><Permanent>'],
    ['SkillEffectScriptTranslator', '<script>123</script>'],
    ['FtkrSkillCounterTranslator', '<InvalidSkillType:1,2>'],
])(
    'registers %s only for its own enabled plugin and preserves technical payloads',
    (name, text) => {
        const translator = new adapters[name]();
        vi.stubGlobal('$plugins', [{ name: 'SeedPresserUI', status: true }]);
        expect(translator.detectPlugin()).toBe(false);
        $plugins.push({ name: translator.getPluginName(), status: true });
        expect(translator.detectPlugin()).toBe(true);
        expect(translator.enablePluginTranslation()).toBe(true);
        for (const format of ['tags', 'legacy']) {
            engine.tagManager.setTagFormat(format);
            roundTrip(text);
        }
    }
);

it.each([false, true])(
    'loads renamed TRP controls from separate config before/after runtime parsing (%s)',
    (parsed) => {
        const codes = { expression: 'FA', pose: 'PO', motion: 'MA', animation: 'ANI' };
        vi.stubGlobal('$plugins', [
            { name: 'TRP_Skit', status: true, parameters: {} },
            {
                name: 'TRP_SkitConfig',
                status: true,
                parameters: { controlCharacters: JSON.stringify(codes) },
            },
        ]);
        vi.stubGlobal('TRP_CORE', parsed ? { skitParameters: { controlCharacters: codes } } : {});
        vi.stubGlobal('Game_Message', class {});
        expect(new TRPSkitTranslator().enablePluginTranslation()).toBe(true);
        roundTrip('\\N<みお>');
        const encoded = roundTrip('\\FA[odoroki]\\PO[naked niko]\\MA[jump]');
        expect(encoded).not.toContain('odoroki');
        expect(encoded).not.toContain('naked niko');
    }
);

it('preserves nested dynamic DText database and icon references', () => {
    vi.stubGlobal(
        'Game_Screen',
        class {
            setDTextPicture() {}
        }
    );
    vi.stubGlobal(
        'Game_Picture',
        class {
            updateDTextVariable() {}
        }
    );
    expect(new DTextPictureTranslator().enablePluginTranslation()).toBe(true);
    roundTrip('\\WEAPON[\\V[532]]\\ITEM[\\V[524]]\\I[\\V[413]]');
});

it('registers generic FTKR CSS sections without registering game-specific note fields', () => {
    vi.stubGlobal('Window_Base', class {});
    new FtkrCustomSimpleActorStatusTranslator().enablePluginTranslation();
    roundTrip('<CSS_画像:hensei_tatie_mamiya>123</CSS_画像>');
    const symbols = engine.tagManager.tagEntries.map((entry) => entry.tagSymbol);
    for (const gameField of ['tatsuta_bust', 'hensei', 'soubiSiri', 'birthday', 'noteValue'])
        expect(symbols).not.toContain(gameField);
});
