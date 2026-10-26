import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { readJavaScriptLiteralData } from './JavaScriptTextCatalog.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

const MODULES = [
    'CageOfOrder_RandomNPCDialogue',
    'CageOfOrder_TownRumors',
    'CageOfOrder_MenuUI',
    'CageOfOrder_QuestBoard',
    'CageOfOrder_ObjectiveCore',
    'CageOfOrder_NextObjective',
    'CageOfOrder_MenuDashboard',
    'CageOfOrder_SkillTree',
    'JobChangeSystem',
    'CageOfOrder_JobProficiency',
    'CageOfOrder_ExplorationHUD',
    'CageOfOrder_ExplorationGauge',
    'CageOfOrder_DungeonNodeMap',
    'CageOfOrder_MapPortrait',
    'CageOfOrder_StatusFrame',
    'CageOfOrder_FastTravel',
    'CageOfOrder_NPCProgress',
    'CageOfOrder_UraStatus',
    'CageOfOrder_HiddenStatus',
    'CageOfOrder_EroStatus',
    'CageOfOrder_EnhancedStatus',
    'CageOfOrder_CGManifest',
    'CageOfOrder_CGGallery',
    'CageOfOrder_DefeatScene',
    'CageOfOrder_EroticAttackSystem',
];

/**
 * Cage of Order MZ plugins shipped with game v1.56:
 * RandomNPCDialogue v1.0, MenuUI v1.0.0, JobChangeSystem v3.0.0 and the
 * bundled quest/objective/dashboard/skill-tree/exploration modules.
 * Private JS tables, literals and template expressions supply these screens.
 * Parse scripts without executing them; translate at presentation boundaries so
 * command symbols, game logic, job IDs, images and persistent state stay original.
 * COT parameters preserve evaluated template values in either LLM tag format.
 * v1.56 additional screens: encoded TownRumors, hidden/enhanced status,
 * CG gallery/manifest and DefeatScene recollections. Decode rumor data and scan
 * referenced story files; translate defeat dialogue before line wrapping.
 */
export class CageOfOrderTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'CageOfOrder';
    }
    getPluginAliases() {
        return MODULES;
    }
    getPluginLabel() {
        return 'Cage of Order UI and dialogue';
    }
    getCacheType() {
        return 'plugin_cage_of_order';
    }

    collectSourceCatalog(source, name) {
        const catalog = super.collectSourceCatalog(source);
        if (name === 'CageOfOrder_EroticAttackSystem') {
            for (const entry of catalog.entries) {
                entry.text = entry.text.replace(/\\n/g, '\n');
                if (entry.parts)
                    entry.parts = entry.parts.map((part) => part.replace(/\\n/g, '\n'));
            }
        }
        if (name === 'CageOfOrder_EroStatus') {
            // This plugin's `tag` field is a visible earned title, not a control token.
            for (const object of readJavaScriptLiteralData(source, []).objects)
                if (typeof object.tag === 'string') catalog.entries.push({ text: object.tag });
        }
        if (name === 'CageOfOrder_TownRumors') {
            const { bindings } = readJavaScriptLiteralData(source, ['RUMORS_DATA_B64']);
            if (bindings.RUMORS_DATA_B64) {
                const bytes = Uint8Array.from(atob(bindings.RUMORS_DATA_B64), (c) =>
                    c.charCodeAt(0)
                );
                let level = false;
                for (const line of new TextDecoder('utf-8').decode(bytes).split(/\r?\n/)) {
                    const text = line.trim();
                    if (!text || /^[#=]/.test(text)) continue;
                    if (/^\[LEVEL_\d+\]$/.test(text)) level = true;
                    else if (level) catalog.entries.push({ text });
                }
            }
        }
        if (name === 'CageOfOrder_DefeatScene') {
            const { bindings, objects } = readJavaScriptLiteralData(source, [
                'SPECIES_DEFEAT_CONFIG',
            ]);
            this.storyFiles ??= new Set();
            for (const config of Object.values(bindings.SPECIES_DEFEAT_CONFIG || {})) {
                const variants = config.splitText ? ['Small', 'Huge'] : [''];
                for (const variant of variants)
                    for (let stage = 1; stage <= 3; stage++)
                        this.storyFiles.add(
                            `${config['textFolder' + variant]}/${config['filePrefix' + variant]}${stage}.txt`
                        );
            }
            for (const object of objects)
                if (typeof object.folder === 'string' && typeof object.file === 'string')
                    this.storyFiles.add(`${object.folder}/${object.file}`);
        }
        return catalog;
    }

    async collectAdditionalTexts() {
        await Promise.all(
            [...(this.storyFiles || [])].map(async (file) => {
                const response = await fetch(`story/defeat_scenes/${file}`);
                if (!response.ok)
                    throw new Error(`Cannot read defeat dialogue ${file}: ${response.status}`);
                this.collectDefeatDialogue(await response.text());
            })
        );
        if (this.findPluginEntry('CageOfOrder_EroticAttackSystem')?.status) {
            let skills = window.$dataSkills;
            if (!Array.isArray(skills)) {
                const response = await fetch('data/Skills.json');
                if (!response.ok) throw new Error(`Cannot read Skills: ${response.status}`);
                skills = parseJsonSafely(await response.text());
                if (!Array.isArray(skills)) throw new Error('Invalid Skills data');
            }
            for (const skill of skills) {
                // RPG Maker extracts metadata with this same colon/closing-angle syntax.
                const text = skill?.note?.match(/<eroticText:([^>]*)>/)?.[1];
                if (!this.isUsableText(text)) continue;
                const normalized = text.replace(/\\n/g, '\n');
                this.entries.set(normalized, { text: normalized });
            }
        }
    }

    collectDefeatDialogue(content) {
        for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (
                !trimmed ||
                /^@(?:cg\s+\d+|bgm|se_insert$|bgs_slow$|bgs_fast$|bgs_stop$|bgs_slow_fade$|se_cum$)/i.test(
                    trimmed
                )
            )
                continue;
            const match = trimmed.match(/^(.+?):\s*(.*)$/);
            let speaker = match?.[1].trim() || '';
            const text = match ? match[2].trim() : trimmed;
            // Match DefeatScene.parseSceneContent's presentation names exactly.
            if (speaker === 'heroine' || speaker === 'ティア') speaker = 'ティア';
            else if (speaker.includes('（心の声）') || speaker.includes('(心の声)'))
                speaker = speaker.replace('heroine', 'ティア');
            else if (speaker.startsWith('goblin'))
                speaker = speaker.replace(/^goblin/i, 'ゴブリン');
            else if (speaker === 'thief_leader') speaker = '盗賊リーダー';
            else if (/^thief\d+$/i.test(speaker)) speaker = '下っ端盗賊';
            if (!text) continue;
            for (const value of [speaker, text])
                if (this.isUsableText(value)) this.entries.set(value, { text: value });
        }
    }

    enablePluginTranslation() {
        const defeat = this.findPluginEntry('CageOfOrder_DefeatScene')?.status;
        const attacks = this.findPluginEntry('CageOfOrder_EroticAttackSystem')?.status;
        const presenter = window.CageOfOrder_EroticAttackSystem?.EroticAttackPresenter;
        if (attacks && typeof presenter?.showEroticText !== 'function') return false;
        if (
            defeat &&
            (typeof window.Window_DefeatText?.prototype.refresh !== 'function' ||
                typeof window.Window_DefeatText?.prototype.drawText !== 'function')
        )
            return false;
        if (!super.enablePluginTranslation()) return false;
        if (attacks) {
            const translator = this;
            const original = presenter.showEroticText;
            presenter.showEroticText = function (text, ...args) {
                const runtime = translator.getRuntime();
                if (
                    !translator.isUsableText(text) ||
                    !translator.isRuntimeTranslationActive(runtime)
                )
                    return original.call(this, text, ...args);
                const source = text.replace(/\\n/g, '\n');
                const translated = translator.resolveRuntimeTranslation(source, runtime);
                // The sprite splits lines internally; observe the complete source once.
                translator.drawing++;
                try {
                    return original.call(this, translated, ...args);
                } finally {
                    translator.drawing--;
                }
            };
        }
        if (defeat) {
            const translator = this;
            const original = window.Window_DefeatText.prototype.refresh;
            const drawText = window.Window_DefeatText.prototype.drawText;
            window.Window_DefeatText.prototype.drawText = function (text, ...args) {
                // Body and speaker were resolved before wrapping. Never harvest
                // wrapped pieces or translated output as fresh source keys.
                if (text === '▼ Click or Press Enter')
                    text = translator.resolveText(text, translator.getRuntime(), 0, false);
                translator.drawing++;
                try {
                    return drawText.call(this, text, ...args);
                } finally {
                    translator.drawing--;
                }
            };
            window.Window_DefeatText.prototype.refresh = function (...args) {
                const text = this._text;
                const speaker = this._speaker;
                const runtime = translator.getRuntime();
                if (!translator.isRuntimeTranslationActive(runtime))
                    return original.apply(this, args);
                // Whole authored lines must be observed before wrapText splits them.
                this._text = translator.resolveRuntimeTranslation(text, runtime);
                this._speaker = translator.resolveRuntimeTranslation(speaker, runtime);
                try {
                    return original.apply(this, args);
                } finally {
                    this._text = text;
                    this._speaker = speaker;
                }
            };
        }
        return true;
    }
}
