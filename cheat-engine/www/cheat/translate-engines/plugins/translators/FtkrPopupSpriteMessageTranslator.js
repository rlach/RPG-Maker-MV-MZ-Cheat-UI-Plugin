import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { TAG_TYPE } from '../../ai-engine/constants.js';

/**
 * FTKR_PopupSpriteMessage v1.2.5 (MV).
 * PSM_SHOW_POPUP / PSM_SHOW_POPUP_B (and Japanese aliases) store text in a
 * single argument. Extend shared map/common-event traversal with message entries.
 * Translate before setPopupMessage expands escape codes and splits into glyphs.
 */
export class FtkrPopupSpriteMessageTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'FTKR_PopupSpriteMessage';
    }
    getPluginLabel() {
        return 'FTKR popup sprite messages';
    }

    getEventCommandTraversalExtension() {
        return {
            collectEntriesAt: ({ command, index, pushEntry }) => {
                if (command.code !== 356) return null;
                const [name, ...args] = command.parameters[0].split(' ');
                const match =
                    /^PSM_(SHOW_POPUP_B|SHOW_POPUP|ポップアップ表示B|ポップアップ表示)$/i.exec(
                        name
                    );
                if (!match) return null;
                const value = args[/B$/i.test(match[1]) ? 4 : 5];
                if (this.isUsableText(value))
                    pushEntry({ type: 'message', value, cmdIndex: index, command });
                return { handled: true, nextIndex: index + 1 };
            },
        };
    }

    enablePluginTranslation() {
        const party = window.Game_Party?.prototype;
        if (typeof party?.setPopupMessage !== 'function') return false;
        this.registerPluginCustomTags([
            {
                tagSymbol: '_',
                type: TAG_TYPE.WITHOUT_PARAMETER,
                description: 'A space inside a popup message command argument.',
                requiredConsistency: true,
            },
        ]);
        const original = party.setPopupMessage;
        const translator = this;
        party.setPopupMessage = function (...args) {
            args[5] = translator.resolveRuntimeMessageTranslation(args[5], translator.getRuntime());
            return original.apply(this, args);
        };
        return true;
    }
}
