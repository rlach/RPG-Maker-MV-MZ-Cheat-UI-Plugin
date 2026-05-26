import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * TN_LightSaveData_Map compatibility translator.
 * Plugin: TN_LightSaveData_Map.js (Ver.1.02)
 * Target: MV.
 *
 * Notes:
 * - TN_LightSaveData_Map detaches $gameMap._events in Game_System.onBeforeSave and restores them
 *   in Scene_Save.onSavefileOk.
 * - The cheat quick-save flow calls DataManager.saveGame directly outside Scene_Save,
 *   so the plugin restore path is skipped and map events stay detached.
 * - This translator patches DataManager.saveGame for this plugin only and restores detached
 *   events after non-Scene_Save saves.
 */
const SAVE_PATCH_GUARD = '__CHEAT_TN_LIGHT_SAVE_DATA_MAP_SAVE_PATCHED__';

export class TNLightSaveDataMapTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'TN_LightSaveData_Map';
    }

    getPluginLabel() {
        return 'TN_LightSaveData_Map';
    }

    enablePluginTranslation() {
        if (!window.DataManager || typeof DataManager.saveGame !== 'function') {
            return false;
        }

        if (DataManager[SAVE_PATCH_GUARD]) {
            return true;
        }

        const restoreDetachedMapEvents = this.restoreDetachedMapEventsAfterSave.bind(this);
        const originalSaveGame = DataManager.saveGame;

        DataManager.saveGame = function () {
            const currentScene = window.SceneManager ? SceneManager._scene : null;
            const isSaveScene = !!(
                currentScene &&
                typeof Scene_Save !== 'undefined' &&
                currentScene.constructor === Scene_Save
            );

            try {
                return originalSaveGame.apply(this, arguments);
            } finally {
                if (!isSaveScene) {
                    restoreDetachedMapEvents();
                }
            }
        };

        Object.defineProperty(DataManager, SAVE_PATCH_GUARD, {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });

        return true;
    }

    restoreDetachedMapEventsAfterSave() {
        if (!window.$gameMap || !Array.isArray($gameMap._events)) {
            return;
        }

        const detachedEvents = globalThis.TN_gameMap;
        if (!Array.isArray(detachedEvents)) {
            return;
        }

        if ($gameMap._events.length !== 0) {
            return;
        }

        $gameMap._events = detachedEvents;
    }
}
