/**
 * StandPictureEC v1.043 (MV, Yana): standing-picture, camera and macro controls.
 * Registers escape tags only; regular message phases own text extraction and seen tracking.
 * Includes runtime-only TC/RZC codes as well as the documented escape codes.
 * The literal _N_ backslash alias is not an escape tag.
 */
import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { TAG_BRACKET, TAG_STYLE, TAG_TYPE } from '../../ai-engine/constants.js';

const PARAMETER_TAGS = [
    ['SP', 'Show picture: picture index, x, y; anchored at center bottom.'],
    ['HP', 'Hide standing picture by index.'],
    ['MP', 'Move picture to absolute x,y over duration frames.'],
    ['RMP', 'Move picture by relative x,y over duration frames.'],
    ['TP', 'Flip picture over duration frames.'],
    ['OP', 'Set picture opacity over duration frames.'],
    ['AP', 'Play animation on picture: index, animation ID, mirror.'],
    ['CP', 'Replace picture with another index using a flip transition.'],
    ['CFP', 'Replace picture with another index using a fade transition.'],
    ['COP', 'Set picture color tone: index, red, green, blue, gray, duration.'],
    ['BCP', 'Set picture blend color: index, red, green, blue, alpha, duration.'],
    ['ZP', 'Scale picture: index, horizontal percent, vertical percent, duration.'],
    ['RZP', 'Change picture scale relatively over duration.'],
    ['RP', 'Rotate picture to angle over duration.'],
    ['RRP', 'Rotate picture relatively over duration.'],
    ['BP', 'Bind pictures to a parent picture index.'],
    ['LS', 'Start lip synchronization for picture index.'],
    ['LE', 'Stop lip synchronization for picture index.'],
    ['SFR', 'Bring picture index to front.'],
    ['SBK', 'Send picture index to back.'],
    ['MC', 'Move camera to x,y over duration.'],
    ['RMC', 'Move camera relatively by x,y over duration.'],
    ['ZC', 'Scale camera horizontally and vertically in percent over duration.'],
    ['ZPC', 'Set camera anchor x,y and scale horizontally/vertically over duration.'],
    ['SAC', 'Set camera anchor x,y without changing appearance.'],
    ['WT', 'Wait for the specified number of frames.'],
    ['TC', 'Flip the camera over duration frames.'],
    ['RZC', 'Scale the camera relatively: horizontal percent, vertical percent, duration.'],
    ['RC', 'Rotate the camera: angle in degrees, duration.'],
    ['RRC', 'Rotate the camera relatively: angle in degrees, duration.'],
    ['RPC', 'Rotate the camera around an anchor: x, y, angle in degrees, duration.'],
    ['SM', 'Expand a standing-picture macro from StandPictureSettingM by index.'],
    ['VI', 'Read a game variable plus an offset: variable ID, signed offset.'],
    ['NNUM', 'Negate the supplied signed number.'],
    ['CALC', 'Evaluate a JavaScript formula; preserve the expression exactly.'],
];

const VALUE_TAGS = [
    ['PV', 'Substitute the configured proxy variable ID.'],
    ['BXW', 'Substitute the screen width.'],
    ['BXH', 'Substitute the screen height.'],
    ['MWW', 'Substitute the message window width.'],
    ['MWH', 'Substitute the message window height.'],
    ['MWX', 'Substitute the message window X coordinate.'],
    ['MWY', 'Substitute the message window Y coordinate.'],
];

export class StandPictureECTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'StandPictureEC';
    }

    getCacheType() {
        return 'plugin_stand_picture_ec';
    }

    enablePluginTranslation() {
        this.registerPluginCustomTags([
            ...PARAMETER_TAGS.map(([tagSymbol, description]) => ({
                tagSymbol,
                description: `StandPictureEC: ${description}`,
                style: TAG_STYLE.ESCAPE,
                type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
                bracket: TAG_BRACKET.SQUARE,
                maskValue: true,
                requiredConsistency: true,
                reservedWidth: 0,
                extraPromptForLlm:
                    'Preserve this presentation control in its original position and keep all parameters unchanged.',
            })),
            ...VALUE_TAGS.map(([tagSymbol, description]) => ({
                tagSymbol,
                description: `StandPictureEC: ${description}`,
                style: TAG_STYLE.ESCAPE,
                type: TAG_TYPE.WITHOUT_PARAMETER,
                requiredConsistency: true,
                extraPromptForLlm: 'Preserve this value substitution exactly.',
            })),
        ]);
        return true;
    }

    collectUntranslated() {
        return [];
    }
}
