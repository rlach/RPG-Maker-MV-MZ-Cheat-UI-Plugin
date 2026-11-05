import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/** NYA_InfoMenuWindow2 (MV, RJ01583227 variant). Private menu statistics windows. */
export class NYAInfoMenuWindowTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'NYA_InfoMenuWindow2';
    }
    getCacheType() {
        return 'plugin_nya_info_menu_window';
    }
    shouldScanEventData() {
        return false;
    }
    isDisplayFragment() {
        return false;
    }

    collectParameterTexts(parameters) {
        for (const key of ['Title_MapName', 'Title_PlayTime']) {
            const text = parameters[key];
            if (this.isUsableText(text)) this.entries.set(text, { text });
        }
    }

    enablePluginTranslation() {
        const prototype = window.Scene_Menu?.prototype;
        if (typeof prototype?.createInformationWindow !== 'function') return false;
        const translator = this;
        const hookWindows = (scene) => {
            for (const field of ['_informationWindowMapName', '_informationWindowPlayTime']) {
                const target = scene?.[field];
                if (target) translator.hookDrawing(target, 'drawText');
            }
        };
        const create = prototype.createInformationWindow;
        prototype.createInformationWindow = function (...args) {
            const result = create.apply(this, args);
            hookWindows(this);
            return result;
        };
        hookWindows(window.SceneManager?._scene);
        this.precomputeCounts().catch((error) =>
            console.error('[NYAInfoMenuWindowTranslator] Catalog scan failed', error)
        );
        return true;
    }
}
