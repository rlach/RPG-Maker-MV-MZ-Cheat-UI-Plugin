import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { readJavaScriptLiteralData } from './JavaScriptTextCatalog.js';
import { parseJsonSafely } from './TranslatorHelpers.js';
import { collectProject3Data, parseProject3Text } from './Project3TextCatalog.js';

/** Project3 author suite (MZ, RJ01758616): external event scripts and custom
 * Bitmap/PIXI menus. Frozen dialogue APIs are wrapped at presentation only;
 * source tables, scene commands, asset paths and speaker-dependent logic stay original.
 */
export class Project3UiTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'Project3DialogueWindow';
    }
    getPluginLabel() {
        return 'Project3 custom interface and dialogue';
    }
    getPluginAliases() {
        return NAMES;
    }
    getCacheType() {
        return 'plugin_project3_ui';
    }
    shouldScanEventData() {
        return false;
    }
    collectParameterTexts() {
        /* Runtime parameters may already contain display translations. */
    }
    collectSourceCatalog(source) {
        const catalog = super.collectSourceCatalog(source);
        const typed = new Map();
        for (const object of readJavaScriptLiteralData(source, []).objects)
            collectProject3Data(object, typed);
        for (const entry of catalog.entries) {
            if (typed.has(entry.text)) Object.assign(entry, typed.get(entry.text));
        }
        for (const entry of typed.values()) {
            if (!catalog.entries.some((item) => item.text === entry.text))
                catalog.entries.push(entry);
        }
        return catalog;
    }
    async collectAdditionalTexts() {
        const fs = require('fs');
        const path = require('path');
        const root = [path.dirname(process.mainModule.filename), process.cwd()]
            .flatMap((base) => [base, path.join(base, 'www')])
            .find((base) => fs.existsSync(path.join(base, 'data/EventTexts')));
        if (!root) throw new Error('Cannot locate Project3 event text sources');
        const walk = async (directory) => {
            for (const file of await fs.promises.readdir(directory, { withFileTypes: true })) {
                const filename = path.join(directory, file.name);
                if (file.isDirectory()) await walk(filename);
                else if (file.name.endsWith('.json')) {
                    collectProject3Data(
                        parseJsonSafely(await fs.promises.readFile(filename, 'utf8')),
                        this.entries
                    );
                } else if (file.name.endsWith('.txt') && !file.name.includes('動画ファイル名')) {
                    const text = await fs.promises.readFile(filename, 'utf8');
                    for (const entry of parseProject3Text(text, file.name))
                        this.entries.set(entry.text, entry);
                }
            }
        };
        await walk(path.join(root, 'data/EventTexts'));
        for (const file of await fs.promises.readdir(path.join(root, 'data'))) {
            if (/^BattleReactions(?:_[AB])?\.txt$/.test(file)) {
                for (const entry of parseProject3Text(
                    await fs.promises.readFile(path.join(root, 'data', file), 'utf8'),
                    file
                ))
                    this.entries.set(entry.text, entry);
            } else if (
                /^(?:ShopTexts|FirstRobotBattleEvent|Marine(?:First|Second|Third)DefeatEvent)\.json$/.test(
                    file
                )
            ) {
                collectProject3Data(
                    parseJsonSafely(
                        await fs.promises.readFile(path.join(root, 'data', file), 'utf8')
                    ),
                    this.entries
                );
            }
        }
    }
    getPendingSourceEntries() {
        return super.getPendingSourceEntries().map((entry) => ({
            ...entry,
            type: entry.type === 'actor_name' ? 'speaker' : entry.type,
        }));
    }
    getPendingItemCacheTypes(item) {
        return [item.type === 'speaker' ? 'actor_name' : item.type];
    }
    enablePluginTranslation() {
        const api = window.Project3DialogueWindow;
        const textPrototype = window.PIXI?.Text?.prototype;
        const descriptor = textPrototype && Object.getOwnPropertyDescriptor(textPrototype, 'text');
        if (typeof api?.draw !== 'function' || !descriptor?.set || !descriptor.configurable)
            return false;
        if (!super.enablePluginTranslation()) return false;
        const translator = this;
        window.Project3DialogueWindow = Object.freeze({
            ...api,
            draw(bitmap, options = {}) {
                const runtime = translator.getRuntime();
                if (!translator.isRuntimeTranslationActive(runtime))
                    return api.draw(bitmap, options);
                const display = { ...options };
                if (typeof options.text === 'string' && options.text.trim()) {
                    const known =
                        translator.entries.has(options.text) ||
                        translator.templates.some((entry) => entry.pattern.test(options.text));
                    const translated = known
                        ? translator.resolveText(options.text, runtime, 0, false)
                        : translator.resolveRuntimeTranslation(options.text, runtime, ['message']);
                    display.text =
                        translated === options.text
                            ? options.text
                            : runtime.wrapText(
                                  runtime.cleanTranslatedText(translated),
                                  runtime.maxLineWidth
                              );
                }
                if (options.speaker)
                    display.speaker = translator.resolveRuntimeTranslation(
                        options.speaker,
                        runtime,
                        ['actor_name']
                    );
                for (const field of ['title', 'closeLabel', 'nextLabel'])
                    if (display[field])
                        display[field] = translator.resolveText(display[field], runtime);
                return api.draw(bitmap, display);
            },
        });
        let catalogReady = false;
        const pendingLabels = new Map();
        Object.defineProperty(textPrototype, 'text', {
            ...descriptor,
            set(value) {
                if (!catalogReady) pendingLabels.set(this, value);
                descriptor.set.call(this, translator.resolveText(value, translator.getRuntime()));
            },
        });
        this.scanPromise?.then(
            () => {
                catalogReady = true;
                for (const [label, source] of pendingLabels)
                    if (!label.destroyed) label.text = source;
                pendingLabels.clear();
            },
            () => pendingLabels.clear()
        );
        return true;
    }
}
const NAMES = [
    'Project3NumberFormat',
    'Project3PressRepeat',
    'UIGlassPictureButtons',
    'Project3ResearchMenu',
    'Project3StreamingMenu',
    'Project3DialogueWindow',
    'Project3EventText',
    'Project3FinalSceneTransition',
    'Project3GaugeTrail',
    'Project3BeforeDayAction',
    'AutoBattleScreen',
    'WorldMapPrototype',
    'SortieExecutiveSelect',
    'Project3EventSkip',
    'MagicalGirlTrainingScene',
    'Project3DefenseTurn',
    'Project3SaveLoad',
    'Project3ButtonFrames',
    'SquadFormationScreen',
    'FacilityManagementScreen',
    'FacilityTowerBattle',
    'ExecutiveParameters',
    'ExecutiveRosterScreen',
    'Project3HomeEnergyHud',
    'Project3HomeTalk',
    'EnergyHostageShop',
    'Project3EventArchive',
    'Project3FinalAssaultEvent',
    'Project3FinalDeclarationEvent',
    'Project3FinalConfrontationEvent',
    'Project3FinalCommandCenterEvent',
    'Project3FinalOriginEvent',
    'Project3FinalNemesisEvent',
    'Project3FinalOrbEvent',
    'Project3FinalEpilogueEvent',
    'Project3PortraitAdjuster',
    'Project3VirtualCutinAdjuster',
    'Project3TrainingFaceAdjuster',
    'Project3GlobalDebug',
    'GiantRobotBoss',
    'Project3RobotSeAdjuster',
    'Project3IllustratedHome',
    'Project3ButtonHoverZoom',
    'Project3FreeTraining',
    'Project3EndingBeamMovie',
    'Project3FinalCalculation',
    'Project3StreamingDialogue',
    'Project3StreamingContent',
    'Project3RandomMap',
    'Project3StreamingImagePolicy',
    'Project3VideoTextureGuard',
];
