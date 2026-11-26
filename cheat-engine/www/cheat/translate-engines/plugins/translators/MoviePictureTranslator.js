import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { useCanvasMoviePictureFactory } from './MoviePictureCompatibility.js';

/** MoviePicture 1.7.1 (MV), 2.3.1 (MZ): compatibility only; no text to translate.
 * Its legacy VideoBaseTexture path can produce black frames on NW.js 0.49.2.
 * Use its own Bitmap_DrawVideo class, preserving playback/loop/pause/cleanup.
 * This repair intentionally remains active when text translation is disabled.
 * MZ 2.x owns a different native video path and needs no factory replacement.
 */
export class MoviePictureTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'MoviePicture';
    }
    getPluginLabel() {
        return 'MoviePicture video compatibility';
    }
    getCacheType() {
        return 'plugin_movie_picture';
    }
    collectUntranslated() {
        return [];
    }
    enablePluginTranslation() {
        const manager = window.ImageManager;
        if (
            window.Utils?.RPGMAKER_NAME === 'MZ' &&
            typeof manager?.loadVideo === 'function' &&
            typeof manager?.getVideoFilePath === 'function' &&
            typeof manager?.getVideoFileExt === 'function'
        )
            return true;
        if (
            typeof manager?.getVideoClass !== 'function' ||
            typeof manager?.loadVideo !== 'function'
        )
            return false;
        useCanvasMoviePictureFactory(manager);
        return true;
    }
}
