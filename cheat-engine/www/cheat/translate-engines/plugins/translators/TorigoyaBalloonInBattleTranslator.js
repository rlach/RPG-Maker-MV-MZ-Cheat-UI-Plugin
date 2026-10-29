import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { walkNestedJsonLike } from './TranslatorHelpers.js';
import { TAG_TYPE } from '../../ai-engine/constants.js';

const normalizeMessage = (text) => text.replace(/\\n/g, '\n');

/**
 * TorigoyaMZ_BalloonInBattle2 v1.7.2 (MZ).
 * Scan talk-set messages and manual text commands. Translate a presentation
 * copy before TalkBuilder substitutes targets, sources and skill/item names.
 * Talk-set IDs, conditions, sound paths and original configuration stay intact.
 */
export class TorigoyaBalloonInBattleTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'TorigoyaMZ_BalloonInBattle2';
    }
    getPluginLabel() {
        return 'Torigoya Balloon in Battle 2';
    }
    getCacheType() {
        return 'plugin_torigoya_balloon_in_battle';
    }
    collectSourceCatalog() {
        return { entries: [] };
    }

    collectParameterTexts(parameters) {
        walkNestedJsonLike(parameters, (value, { path }) => {
            if (path[path.length - 1] !== 'message' || !this.isUsableText(value)) return;
            const text = normalizeMessage(value);
            this.entries.set(text, { text });
        });
    }

    collectCommandTexts(list = []) {
        for (const command of list) {
            const [plugin, name, , args] = command.parameters || [];
            if (
                command.code !== 357 ||
                plugin !== this.getPluginName() ||
                !['talkActorByText', 'talkEnemyByText'].includes(name) ||
                !this.isUsableText(args?.text)
            )
                continue;
            const text = normalizeMessage(args.text);
            this.entries.set(text, { text });
        }
    }

    async collectAdditionalTexts() {
        const troops = window.$dataTroops || (await (await fetch('data/Troops.json')).json());
        for (const troop of troops)
            for (const page of troop?.pages || []) this.collectCommandTexts(page.list);
    }

    translateMessage(text) {
        if (!this.isUsableText(text)) return text;
        return this.resolveRuntimeTranslation(
            normalizeMessage(text),
            this.getRuntime(),
            this.getCacheType(),
            {
                requireRuntimeTranslationActive: true,
                missValue: text,
            }
        );
    }

    enablePluginTranslation() {
        const builder = window.Torigoya?.BalloonInBattle?.TalkBuilder;
        const proto = window.Game_Battler?.prototype;
        if (
            typeof builder?.build !== 'function' ||
            typeof proto?.torigoyaBalloonInBattle_setMessageParameter !== 'function'
        )
            return false;
        this.registerPluginCustomTags(
            ['target', 'from', 'skill', 'item'].map((tagSymbol) => ({
                tagSymbol,
                type: TAG_TYPE.WITHOUT_PARAMETER,
                requiredConsistency: true,
                description: `Battle balloon dynamic ${tagSymbol} name`,
            }))
        );
        const translator = this;
        const build = builder.build;
        builder.build = function (item, options) {
            return build.call(
                this,
                { ...item, message: translator.translateMessage(item.message) },
                options
            );
        };
        const setMessage = proto.torigoyaBalloonInBattle_setMessageParameter;
        proto.torigoyaBalloonInBattle_setMessageParameter = function (type, message, options = {}) {
            // TalkBuilder already translated configured messages. Only manual
            // messages need resolution here, before window layout and drawing.
            if (!options.talkItem) message = translator.translateMessage(message);
            return setMessage.call(this, type, message, options);
        };
        return true;
    }
}
