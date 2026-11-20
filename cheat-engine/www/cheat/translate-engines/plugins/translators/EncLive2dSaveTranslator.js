import { BasePluginTranslator } from '../BasePluginTranslator.js';

export class EncLive2dSaveTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'enc_lv2d';
    }
    enablePluginTranslation() {
        const manager = window.DataManager;
        if (typeof manager?.makeSaveContents !== 'function') return false;
        const original = manager.makeSaveContents;
        manager.makeSaveContents = function (...args) {
            const contents = original.apply(this, args);
            const live2d = contents.gameLive2d;
            if (live2d) {
                contents.gameLive2d = Object.assign(
                    Object.create(Object.getPrototypeOf(live2d)),
                    live2d,
                    { managerInstance: null, gl: null, preloadFinished: false }
                );
            }
            return contents;
        };
        return true;
    }
}
