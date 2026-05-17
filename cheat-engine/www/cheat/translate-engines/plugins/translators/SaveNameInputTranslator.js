import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * SaveNameInput compatibility translator.
 * Plugin: SaveNameInput (custom plugin; no explicit version metadata in the plugin header).
 * Target: MV.
 *
 * Notes:
 * - This plugin overrides DataManager.makeSavefileInfo and assumes SceneManager._scene._listWindow
 *   always exists, then reads index() from it.
 * - Ctrl+S quick-save executes outside Scene_Save, so _listWindow is undefined and the plugin crashes.
 * - This translator installs a compatibility patch that injects a temporary _listWindow index fallback,
 *   preserving original plugin behavior while preventing the crash.
 */
export class SaveNameInputTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'SaveNameInput';
    }

    getPluginLabel() {
        return 'SaveNameInput';
    }

    getCacheType() {
        return 'plugin_save_name_input';
    }

    enablePluginTranslation() {
        if (!window.DataManager || typeof DataManager.makeSavefileInfo !== 'function') {
            return false;
        }

        this.installSavefileIdCapturePatch();
        this.installMakeSavefileInfoCompatibilityPatch();
        return true;
    }

    installSavefileIdCapturePatch() {
        if (
            !window.DataManager ||
            typeof DataManager.saveGameWithoutRescue !== 'function' ||
            DataManager.__CHEAT_SAVE_NAME_INPUT_SAVEFILE_CAPTURE__
        ) {
            return;
        }

        const originalSaveGameWithoutRescue = DataManager.saveGameWithoutRescue;

        DataManager.saveGameWithoutRescue = function (savefileId) {
            const numericSavefileId = Number(savefileId);
            if (Number.isFinite(numericSavefileId) && numericSavefileId > 0) {
                this.__cheatSaveNameInputPendingSavefileId = Math.floor(numericSavefileId);
            }

            try {
                return originalSaveGameWithoutRescue.apply(this, arguments);
            } finally {
                delete this.__cheatSaveNameInputPendingSavefileId;
            }
        };

        DataManager.__CHEAT_SAVE_NAME_INPUT_SAVEFILE_CAPTURE__ = true;
    }

    installMakeSavefileInfoCompatibilityPatch() {
        if (
            !window.DataManager ||
            typeof DataManager.makeSavefileInfo !== 'function' ||
            DataManager.__CHEAT_SAVE_NAME_INPUT_MAKE_SAVEFILE_INFO_PATCHED__
        ) {
            return;
        }

        const resolveFallbackSavefileId = this.resolveFallbackSavefileId.bind(this);
        const originalMakeSavefileInfo = DataManager.makeSavefileInfo;

        DataManager.makeSavefileInfo = function () {
            try {
                return originalMakeSavefileInfo.apply(this, arguments);
            } catch (error) {
                if (!SaveNameInputTranslator.isSaveNameInputListWindowError(error)) {
                    throw error;
                }

                const scene = window.SceneManager ? SceneManager._scene : null;
                if (!scene) {
                    throw error;
                }

                const originalListWindow = scene._listWindow;
                const fallbackSavefileId = resolveFallbackSavefileId(this);
                scene._listWindow = {
                    index() {
                        return Math.max(0, fallbackSavefileId - 1);
                    },
                };

                try {
                    return originalMakeSavefileInfo.apply(this, arguments);
                } finally {
                    if (originalListWindow === undefined) {
                        delete scene._listWindow;
                    } else {
                        scene._listWindow = originalListWindow;
                    }
                }
            }
        };

        DataManager.__CHEAT_SAVE_NAME_INPUT_MAKE_SAVEFILE_INFO_PATCHED__ = true;
    }

    resolveFallbackSavefileId(dataManager) {
        const sourceCandidates = [
            dataManager?.__cheatSaveNameInputPendingSavefileId,
            dataManager?._lastAccessedId,
            typeof dataManager?.lastAccessedSavefileId === 'function'
                ? dataManager.lastAccessedSavefileId()
                : null,
        ];

        for (const candidate of sourceCandidates) {
            const numeric = Number(candidate);
            if (Number.isFinite(numeric) && numeric > 0) {
                return Math.floor(numeric);
            }
        }

        return 1;
    }

    static isSaveNameInputListWindowError(error) {
        const message = String(error?.message || '');
        return /index/.test(message);
    }

    async precomputeCounts() {
        return;
    }

    async buildScanEntries() {
        return [];
    }

    collectUntranslated() {
        return [];
    }

    getCachedCountsSync() {
        return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
    }
}