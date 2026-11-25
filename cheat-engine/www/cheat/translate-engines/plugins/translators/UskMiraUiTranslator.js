import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';
import { readJavaScriptLiteralData } from './JavaScriptTextCatalog.js';
import { TAG_TYPE, TAG_STYLE, TAG_BRACKET } from '../../ai-engine/constants.js';

/** usuki98 Mira suite (MZ, RJ01499436). Translate display literals, terms and
 * UskCsvLoader tips at window/plugin escape boundaries. Leave native bitmap
 * drawing, event IDs, loaded dictionaries and game integrity checks unchanged.
 * ExternMessage dialogue is collected by its dedicated standard-message adapter.
 */
export class UskMiraUiTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'UskMiraTerms';
    }
    getPluginAliases() {
        return [
            'UskMiraTerms',
            'UskMiraStatusEX',
            'UskMiraDungeon',
            'UskMiraEvents',
            'UskMessageSceneEx',
        ];
    }
    getCacheType() {
        return 'plugin_usk_mira_ui';
    }
    getSourcePluginNames() {
        return [
            'SceneCustomMenuEx',
            'UskDebugDevToolsOnStart',
            'UskCoreOverWrite',
            'UskNumberInputEx',
            'UskKeyRepeatIntervalEx',
            'UskAddState',
            'UskInlineImage',
            'UskCsvLoader',
            'UskMiraTerms',
            'UskCommonEventCommentTag',
            'UskEasyScripts',
            'UskInteractiveMusic',
            'UskAnimationNoWait',
            'UskDropItemNameEx',
            'UskFontCustom',
            'UskSkillCheckTargetState',
            'UskSubstituteEx',
            'UskBattleWindowEx',
            'UskEnemyAllStateIcons',
            'UskEnemyHpGauge',
            'UskBattleSkillNameWindow',
            'UskBattleTurnEndCommon',
            'UskBattleEnemyDrawEx',
            'UskIterateBattlerEx',
            'UskDropRateLuk',
            'UskGaugeColor',
            'UskCriticalDamage',
            'UskEquipAddState',
            'UskSaveFileListEx',
            'UskEnemyNameEx',
            'UskAchievementSave',
            'UskLocalDataArmors',
            'UskGainItemNameKeep',
            'UskEnemyLevel',
            'UskMiraStatusEX',
            'UskMiraDungeon',
            'UskMiraEvents',
            'UskMiraCoordinate',
            'UskMiraCutIn',
            'UskStandingPicture',
            'UskMiraHonor',
            'UskBattleAnimationForActor',
            'UskUniqueLog',
            'UskMoveSpeed',
            'UskMessageSceneEx',
            'UskMapEventSelfSwitch',
            'UskSelectItemWindowEx',
            'UskEncountEvent',
            'UskItemListEx',
            'UskVoiceControl',
            'UskMiraVoice',
            'UskLayerReorder',
        ].filter((name) => !['UskCoreOverWrite', 'UskDebugDevToolsOnStart'].includes(name));
    }
    shouldScanEventData() {
        return false;
    }
    addDisplaySource(text, cacheType = this.getCacheType()) {
        if (!this.isUsableText(text)) return;
        this.entries.set(text, { text, cacheType });
    }
    collectEventSources(list) {
        for (let index = 0; index < list.length; index++) {
            const command = list[index];
            const parameters = command.parameters || [];
            if (command.code === 355) {
                let script = String(parameters[0]);
                while (list[index + 1]?.code === 655) script += '\n' + list[++index].parameters[0];
                if (/(?:USKLOG|MIRA|ES\.)/.test(script))
                    for (const entry of this.extractCatalog(script).entries)
                        this.entries.set(entry.text, entry);
            }
            if ([108, 408].includes(command.code)) {
                for (const match of String(parameters[0]).matchAll(/<eventNotice:([^>]+)>/g))
                    this.addDisplaySource(match[1]);
            }
            if (command.code === 122 && parameters[3] === 4 && typeof parameters[4] === 'string') {
                const catalog = this.extractCatalog(parameters[4]);
                for (const entry of catalog.entries)
                    this.entries.set(entry.text, { ...entry, cacheType: 'message' });
            }
        }
    }
    async collectAdditionalTexts() {
        this.textResources = new Map();
        // Read immutable files: local armor instances and display variables are
        // often already expanded or translated by the time a menu opens.
        for (const [file, type] of [
            ['Actors', 'actor'],
            ['Items', 'item'],
            ['Weapons', 'weapon'],
            ['Armors', 'armor'],
        ]) {
            const response = await fetch(`data/${file}.json`);
            if (!response.ok) throw new Error(`Cannot read Usk display database: ${file}`);
            for (const row of await response.json()) {
                if (!row) continue;
                this.addDisplaySource(row.name, `${type}_name`);
                if (type !== 'actor') this.addDisplaySource(row.description, `${type}_description`);
            }
        }
        const scripts = this.findPluginEntry('TextScriptBase');
        for (const encoded of parseJsonSafely(scripts?.parameters.TextList, [])) {
            const row = parseJsonSafely(encoded, {});
            if (!this.isUsableText(row.Text)) continue;
            const isScript = /^(?:\s*(?:\/\/|[({]|(?:const|let|var|return)\b)|[\w$.]+\s*\()/.test(
                row.Text
            );
            if (isScript) {
                for (const entry of this.extractCatalog(row.Text).entries)
                    this.entries.set(entry.text.replace(/\\\\/g, '\\'), {
                        ...entry,
                        text: entry.text.replace(/\\\\/g, '\\'),
                        parts: entry.parts?.map((part) => part.replace(/\\\\/g, '\\')),
                    });
            } else
                this.addDisplaySource(
                    row.Text,
                    /^chara_/.test(row.Id) ? 'speaker' : this.getCacheType()
                );
        }
        const events = await fetch('data/CommonEvents.json');
        if (!events.ok) throw new Error('Cannot read Usk display events');
        for (const event of await events.json())
            if (event?.list) this.collectEventSources(event.list);
        const maps = await fetch('data/MapInfos.json');
        if (!maps.ok) throw new Error('Cannot read Usk map source list');
        await Promise.all(
            (await maps.json())
                .filter((map) => map?.id)
                .map(async (map) => {
                    const response = await fetch(`data/Map${String(map.id).padStart(3, '0')}.json`);
                    if (!response.ok) throw new Error(`Cannot read Usk display map: ${map.id}`);
                    const source = await response.json();
                    for (const event of source.events || [])
                        for (const page of event?.pages || []) this.collectEventSources(page.list);
                })
        );
        const plugin = this.findPluginEntry('UskMiraTerms');
        if (plugin?.status) {
            const response = await fetch(`js/plugins/${plugin.name}.js`);
            if (!response.ok) throw new Error('Cannot read UskMiraTerms');
            const { bindings } = readJavaScriptLiteralData(await response.text(), ['TERMS']);
            for (const text of Object.values(bindings.TERMS || {}))
                if (this.isUsableText(text)) this.entries.set(text, { text });
        }
        const loader = this.findPluginEntry('UskCsvLoader');
        if (!loader?.status) return;
        for (const filename of parseJsonSafely(loader.parameters.csvFiles, [])) {
            if (
                typeof filename !== 'string' ||
                !/^[A-Za-z0-9_/-]+$/.test(filename) ||
                filename.includes('..')
            )
                throw new Error('Invalid UskCsvLoader filename');
            const response = await fetch(`data/${filename}.csv`);
            if (!response.ok) throw new Error(`Cannot read UskCsvLoader source: ${filename}`);
            // Use the game's pure CSV reader; never call parseUskCsv, which mutates USKCSV.
            for (const row of window.CsvImportor.parseFromCSV(await response.text())) {
                const text = row.slice(1).join('').trim();
                if (this.isUsableText(text)) {
                    this.entries.set(text, { text });
                    this.textResources.set(row[0], text);
                }
            }
        }
    }
    enablePluginTranslation() {
        const base = window.Window_Base?.prototype;
        if (
            typeof base?.convertEscapeCharacters !== 'function' ||
            typeof window.CsvImportor?.parseFromCSV !== 'function'
        )
            return false;
        if (!super.enablePluginTranslation()) return false;
        this.registerPluginCustomTags(
            ['UTX', 'UTERMS', 'TERMS', 'SDATA'].map((tagSymbol) => ({
                description: 'Native Usk display reference; preserve identifier',
                tagSymbol,
                type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
                style: TAG_STYLE.ESCAPE,
                bracket: TAG_BRACKET.SQUARE,
                maskValue: true,
                requiredConsistency: true,
            }))
        );
        const translator = this;
        // PluginManagerEx expansion also serves boot-time logic. Keep that
        // shared API native and translate only the window's display result.
        const convert = base.convertEscapeCharacters;
        base.convertEscapeCharacters = function (text, ...args) {
            const runtime = translator.getRuntime();
            // Resolve whole descriptions and symbolic references before the
            // native renderer expands names, counters and inline resources.
            const referenced =
                typeof text === 'string'
                    ? // eslint-disable-next-line no-control-regex -- Native windows can pass RPG Maker ESC controls.
                      text.replace(/(?:\\|\x1b)UTX\[([^\]]+)\]/gi, (token, id) => {
                          const source = translator.textResources?.get(id);
                          if (!source) return token;
                          const translated = translator.resolveText(source, runtime);
                          return translated === source ? token : translated;
                      })
                    : text;
            const prepared = translator.resolveText(referenced, runtime);
            const converted = convert.call(this, prepared, ...args);
            if (!translator.isRuntimeTranslationActive(runtime)) return converted;
            return translator.resolveEscapeConvertedText(converted, runtime);
        };
        const custom = window.Window_CustomMenu?.prototype;
        if (typeof custom?.drawDescription === 'function')
            this.hookDrawing(custom, 'drawDescription');
        return true;
    }
}
