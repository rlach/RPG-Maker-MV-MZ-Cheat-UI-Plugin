import { afterEach, expect, it, vi } from 'vitest';
import { CbrEroStatusMzPortTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/CbrEroStatusMzPortTranslator.js';
import { HbNotificationTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/HbNotificationTranslator.js';
import { FtkrSkillExpansionTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/FTKRSkillExpansionTranslator.js';
import { GetInformationTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/GetInformationTranslator.js';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
it('scans CBR MZ labels and values from referenced variables only', async () => {
    vi.stubGlobal('window', {
        $plugins: [
            {
                name: 'CBR_eroStatus_1',
                status: true,
                parameters: { txtSubject_1: '\\c[3]前回', txtSubject_2: '\\v[211]' },
            },
        ],
    });
    const t = new CbrEroStatusMzPortTranslator();
    t.collectCommandTexts([
        { code: 122, parameters: [211, 211, 0, 4, '"考えないようにしている。"'] },
        { code: 122, parameters: [999, 999, 0, 4, '"画像ファイル名"'] },
    ]);
    await t.collectAdditionalTexts();
    expect([...t.entries.keys()]).toContain('考えないようにしている。');
    expect([...t.entries.keys()]).not.toContain('画像ファイル名');
});
it('extracts only HB notification message arguments and preserves technical notification type', () => {
    const t = new HbNotificationTranslator();
    t.collectCommandTexts([
        { code: 355, parameters: ["HB_Notifier.add('noti', 'エロステータスが更新されました');"] },
    ]);
    expect([...t.entries.keys()]).toEqual(['エロステータスが更新されました']);
});
it('reuses canonical equipment descriptions for ordinary and FTKR help without mutating objects', () => {
    class Help {
        setItem(item) {
            this.setText(item.actorId ? item.descs[0].description : item.description);
        }
        setText(text) {
            this.text = text;
        }
    }
    vi.stubGlobal('window', { Window_Help: Help });
    const t = new FtkrSkillExpansionTranslator();
    const r = {
        isTranslationEnabled: () => true,
        getCacheKey: (text, type) => type + ':' + text,
        trackCacheKeyUsage: vi.fn(),
        hasUsableCacheValue: () => true,
        translationCache: new Map([['weapon_description:短い剣。', 'A short sword.']]),
    };
    vi.spyOn(t, 'getRuntime').mockReturnValue(r);
    t.installEquipmentHelpHook();
    const help = new Help();
    const item = { wtypeId: 2, description: '短い剣。' };
    help.setItem(item);
    expect(help.text).toBe('A short sword.');
    help.setItem({ ...item, actorId: 1, descs: [{ description: '短い剣。' }] });
    expect(help.text).toBe('A short sword.');
    expect(item.description).toBe('短い剣。');
    expect(Object.hasOwn(help, 'setText')).toBe(false);
});
it('recognizes GetInformationMZ and collects its native MZ message command', () => {
    const t = new GetInformationTranslator();
    expect(t.getPluginAliases()).toContain('GetInformationMZ');
    const entries = [];
    t.collectShowInfoCommandsFromList(
        [{ code: 357, parameters: ['GetInformationMZ', 'showInfo', '', { text: '通知' }] }],
        {},
        entries
    );
    expect(entries.map((entry) => entry.text)).toEqual(['通知']);
});

it('translates CBR variable text at presentation and HB notifications before layout', () => {
    const source = '考えないようにしている。';
    class Base {
        convertEscapeCharacters(text) {
            return text.replace('\\v[211]', source);
        }
        drawTextEx(text) {
            return this.convertEscapeCharacters(text);
        }
    }
    class Status extends Base {}
    class Window_Notification extends Base {}
    vi.stubGlobal('window', { Window_Base: Base, Window_EroStatus: Status });
    const cbr = new CbrEroStatusMzPortTranslator();
    const hb = new HbNotificationTranslator();
    cbr.entries.set(source, { text: source });
    hb.entries.set('通知', { text: '通知' });
    const r = {
        isTranslationEnabled: () => true,
        getCacheKey: (text) => text,
        trackCacheKeyUsage: vi.fn(),
        hasUsableCacheValue: (key) => r.translationCache.has(key),
        translationCache: new Map([
            [source, 'She tries not to think about it.'],
            ['通知', 'Notification'],
        ]),
    };
    for (const t of [cbr, hb]) {
        vi.spyOn(t, 'getRuntime').mockReturnValue(r);
        vi.spyOn(t, 'precomputeCounts').mockResolvedValue();
        expect(t.enablePluginTranslation()).toBe(true);
    }
    expect(new Status().drawTextEx('\\v[211]')).toBe('She tries not to think about it.');
    expect(new Window_Notification().drawTextEx('\\FS[18]\\c[17]通知')).toBe(
        '\\FS[18]\\c[17]Notification'
    );
    expect(r.trackCacheKeyUsage.mock.calls.some(([key]) => key === 'Notification')).toBe(false);
});
