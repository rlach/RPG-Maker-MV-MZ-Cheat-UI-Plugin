import { Key } from './KeyCodes.js';
import { Alert } from './AlertHelper.js';
import { cloneObject, isNwjsEnvironment, isUtilsReady } from './Tools.js';
import { SpeedCheat, SceneCheat, GeneralCheat, BattleCheat, MessageCheat } from './CheatHelper.js';
import { ShortcutMap } from './ShortcutHelper.js';

const INIT_RETRY_TIMEOUT_MS = 100;

// default shortcut settings
const defaultShortcutSettings = {
    toggleCheatModal: {
        shortcut: 'f11',
    },

    toggleCheatModalToSaveLocationComponent: {
        shortcut: 'ctrl m',
    },

    toggleCheatModalToTextLogComponent: {
        shortcut: 'l',
    },

    quickSave: {
        shortcut: 'ctrl s',
        param: {
            slot: 1, // 1-indexed
        },
    },

    quickLoad: {
        shortcut: 'ctrl q',
        param: {
            slot: 1, // 1-indexed
        },
    },

    openSaveScene: {
        shortcut: 'ctrl [',
    },

    openLoadScene: {
        shortcut: 'ctrl ]',
    },

    gotoTitle: {
        shortcut: 'ctrl t',
    },

    forceVictory: {
        shortcut: 'ctrl v',
    },

    forceDefeat: {
        shortcut: 'ctrl d',
    },

    forceEscape: {
        shortcut: 'ctrl e',
    },

    toggleNoClip: {
        shortcut: 'alt w',
    },

    enemyWound: {
        shortcut: 'alt 1',
    },

    enemyRecovery: {
        shortcut: 'alt 0',
    },

    partyWound: {
        shortcut: 'alt 2',
    },

    partyRecovery: {
        shortcut: 'alt 9',
    },

    setSpeed: {
        shortcut: '', // no keymap
        param: {
            speed: 5,
        },
    },

    skipMessage: {
        shortcut: '',
        param: {
            accelerate: 1,
        },
    },

    toggleRealtimeTranslation: {
        shortcut: 'alt t',
    },

    translateCurrentMessage: {
        shortcut: 'alt r',
    },

    replaceCurrentMessageWithWidthPreview: {
        shortcut: 'alt shift r',
    },

    translateCurrentMap: {
        shortcut: 'alt m',
    },

    translateAllMaps: {
        shortcut: 'alt shift m',
    },

    openObjectTranslationModal: {
        shortcut: 'alt shift t',
    },

    toggleHighlightImages: {
        shortcut: 'alt i',
    },

    openDevTool: {
        shortcut: 'f12',
    },
};

export function isInValueInRange(value, lowerBound, upperBound) {
    try {
        value = Number(value);
    } catch (err) {
        return 'Value must be a number';
    }

    if (isNaN(value) || !Number.isInteger(value)) {
        return 'Value must be a number';
    }

    if (value < lowerBound || upperBound < value) {
        return `Value must be between [${lowerBound}, ${upperBound}]`;
    }

    return false;
}

// immutable
const shortcutConfig = {
    toggleCheatModal: {
        name: 'Toggle cheat window',
        desc: 'Key mapping required',
        necessary: true,
        enterAction(param) {
            GeneralCheat.toggleCheatModal();
        },
    },

    toggleCheatModalToSaveLocationComponent: {
        name: 'Toggle "Save Locations" tab',
        desc: '',
        enterAction(param) {
            GeneralCheat.toggleCheatModal('save-recall-panel');
        },
    },

    toggleCheatModalToTextLogComponent: {
        name: 'Toggle "Text Log" tab',
        desc: '',
        enterAction(param) {
            GeneralCheat.toggleCheatModal('text-log-panel');
        },
    },

    quickSave: {
        name: 'Quick save',
        desc: 'Quick save to certain slot',
        param: {
            slot: {
                name: 'Slot',
                desc: 'Slot for saved',
                isInvalidValue(value) {
                    return isInValueInRange(value, 1, DataManager.maxSavefiles());
                },
                convertValue(value) {
                    return Number(value);
                },
            },
        },
        enterAction(param) {
            SceneCheat.quickSave(param.slot);
        },
    },

    quickLoad: {
        name: 'Quick load',
        desc: 'Quick load from certain slot',
        param: {
            slot: {
                name: 'Slot',
                desc: 'Slot for loaded',
                isInvalidValue(value) {
                    return isInValueInRange(value, 1, DataManager.maxSavefiles());
                },
                convertValue(value) {
                    return Number(value);
                },
            },
        },
        enterAction(param) {
            SceneCheat.quickLoad(param.slot);
        },
    },

    openSaveScene: {
        name: 'Open save scene',
        desc: '',
        enterAction(param) {
            SceneCheat.toggleSaveScene();
        },
    },

    openLoadScene: {
        name: 'Open load scene',
        desc: '',
        enterAction(param) {
            SceneCheat.toggleLoadScene();
        },
    },

    gotoTitle: {
        name: 'Go to title',
        desc: '',
        enterAction(param) {
            SceneCheat.gotoTitle();
        },
    },

    forceVictory: {
        name: 'Force victory from battle',
        desc: '',
        enterAction(param) {
            BattleCheat.victory();
        },
    },

    forceDefeat: {
        name: 'Force defeat from battle',
        desc: '',
        enterAction(param) {
            BattleCheat.defeat();
        },
    },

    forceEscape: {
        name: 'Force escape from battle',
        desc: '',
        enterAction(param) {
            BattleCheat.escape();
        },
    },

    toggleNoClip: {
        name: 'Toggle no clip',
        desc: '',
        enterAction(param) {
            GeneralCheat.toggleNoClip(true);
        },
    },

    enemyWound: {
        name: 'Set enemies HP to 1',
        desc: '',
        enterAction(param) {
            BattleCheat.changeAllEnemyHealth(1);
        },
    },

    enemyRecovery: {
        name: 'Recover all enemies',
        desc: 'Fill HP/MP to max',
        enterAction(param) {
            BattleCheat.recoverAllEnemy();
        },
    },

    partyWound: {
        name: 'Set party HP to 1',
        desc: '',
        enterAction(param) {
            BattleCheat.changeAllPartyHealth(1);
        },
    },

    partyRecovery: {
        name: 'Recover all party',
        desc: 'Fill HP/MP to max',
        enterAction(param) {
            BattleCheat.recoverAllParty();
        },
    },

    setSpeed: {
        name: 'Set speed',
        desc: 'Set speed to certain value',
        param: {
            speed: {
                name: 'Speed',
                desc: 'Speed for set',
                isInvalidValue(value) {
                    return isInValueInRange(value, 1, 10);
                },
                convertValue(value) {
                    return Number(value);
                },
            },
        },
        enterAction(param) {
            SpeedCheat.removeFixSpeedInterval();
            SpeedCheat.setSpeed(param.speed);
        },
    },

    skipMessage: {
        name: 'Skip Message',
        desc: '',
        combiningKeyAlone: true,
        param: {
            accelerate: {
                name: 'Accelerate game speed',
                desc: 'Accelerate game speed while skipping message',
                isInvalidValue(value) {
                    return isInValueInRange(value, 1, 50);
                },
                convertValue(value) {
                    return Number(value);
                },
            },
        },
        timeoutHandle: null,
        clearTimeoutHandle() {
            if (this.timeoutHandle) {
                clearTimeout(this.timeoutHandle);
                this.timeoutHandle = null;
            }
        },
        enterAction(param) {
            this.clearTimeoutHandle();
            this.timeoutHandle = setTimeout(() => {
                MessageCheat.stopSkip();
                this.timeoutHandle = null;
            }, 1000);
            MessageCheat.startSkip(param.accelerate);
        },

        repeatAction(param) {
            if (this.timeoutHandle) {
                clearTimeout(this.timeoutHandle);
            }
            this.timeoutHandle = setTimeout(() => {
                MessageCheat.stopSkip();
                this.timeoutHandle = null;
            }, 100);
        },

        leaveAction(param) {
            this.clearTimeoutHandle();
            MessageCheat.stopSkip();
        },
    },

    toggleRealtimeTranslation: {
        name: 'Toggle real-time translation',
        desc: 'Enable or disable live message translation',
        enterAction() {
            MessageCheat.toggleRealtimeTranslation(true);
        },
    },

    translateCurrentMessage: {
        name: 'Translate current message(s)',
        desc: 'Translate the currently displayed message and choices',
        enterAction() {
            MessageCheat.translateCurrentMessage();
        },
    },

    replaceCurrentMessageWithWidthPreview: {
        name: 'Replace current message with width preview',
        desc: 'Replace the current message text with a fixed width preview line',
        enterAction() {
            MessageCheat.replaceCurrentMessageWithWidthPreview();
        },
    },

    translateCurrentMap: {
        name: 'Translate current map',
        desc: 'Translate all messages in the current map events',
        enterAction() {
            MessageCheat.translateCurrentMap();
        },
    },

    translateAllMaps: {
        name: 'Translate all maps',
        desc: 'Translate all messages in all maps in the game',
        enterAction() {
            MessageCheat.translateAllMaps();
        },
    },

    openObjectTranslationModal: {
        name: 'Open object translation modal',
        desc: 'Select and start background translation for game objects',
        enterAction() {
            MessageCheat.openObjectTranslationModal();
        },
    },

    toggleHighlightImages: {
        name: 'Toggle image highlights',
        desc: 'Draw or hide 1px magenta border for runtime-loaded images',
        enterAction() {
            MessageCheat.toggleHighlightImages(true);
        },
    },

    openDevTool: {
        name: 'Open dev tool',
        desc: 'Open Chromium dev tool',
        enterAction(param) {
            if (process.versions['nw-flavor'] !== 'sdk') {
                Alert.info(
                    'Dev tool is not available in normal nwjs build. Update to sdk build to use this feature.\nFor MV suggested version is 0.49.2',
                    null,
                    5000
                );
                return;
            }
            if (isNwjsEnvironment()) {
                require('nw.gui').Window.get().showDevTools();
            }
        },
    },
};

class ShortcutConfig {
    constructor(id, config) {
        this.id = id;

        const fields = [
            'name',
            'desc',
            'necessary',
            'combiningKeyAlone',
            'param',
            'enterAction',
            'repeatAction',
            'leaveAction',
            'clearTimeoutHandle',
        ];

        for (const field of fields) {
            this[field] = config[field];
        }

        if (!this.necessary) this.necessary = false;
        if (!this.combiningKeyAlone) this.combiningKeyAlone = false;
        if (!this.param) this.param = {};
        if (!this.enterAction) this.enterAction = (param) => {};
        if (!this.repeatAction) this.repeatAction = (param) => {};
        if (!this.leaveAction) this.leaveAction = (param) => {};
        if (!this.clearTimeoutHandle) this.clearTimeoutHandle = () => {};

        if (this.clearTimeoutHandle?.bind) {
            this.clearTimeoutHandle = this.clearTimeoutHandle.bind(this);
        }
        if (this.enterAction?.bind) {
            this.enterAction = this.enterAction.bind(this);
        }
        if (this.repeatAction?.bind) {
            this.repeatAction = this.repeatAction.bind(this);
        }
        if (this.leaveAction?.bind) {
            this.leaveAction = this.leaveAction.bind(this);
        }
    }

    getEnterAction(shortcutSetting) {
        return () => {
            this.enterAction(shortcutSetting.param);
        };
    }

    getRepeatAction(shortcutSetting) {
        return () => {
            this.repeatAction(shortcutSetting.param);
        };
    }

    getLeaveAction(shortcutSetting) {
        return () => {
            this.leaveAction(shortcutSetting.param);
        };
    }
}

/**
 * parse string written keymap to Key object
 *
 * @param src: string written keymap
 * @param dest: object which Key objects be stored
 */
function parseStringToKeyObject(src) {
    const ret = cloneObject(src);

    for (const key of Object.keys(src)) {
        ret[key].shortcut = Key.fromString(src[key].shortcut);
    }

    return ret;
}

function parseKeyObjectToString(src) {
    const ret = cloneObject(src);

    for (const key of Object.keys(src)) {
        ret[key].shortcut = src[key].shortcut.asString();
    }

    return ret;
}

class GlobalShortcut {
    constructor() {
        this.initialized = false;
        this.initializeRetryHandle = null;

        // Don't initialize shortcuts in external window
        if (!window.opener) {
            this.initializeWithRetry();
        }
    }

    initializeWithRetry(retryCount = 0) {
        if (this.initialized) {
            return;
        }

        if (!isUtilsReady()) {
            if (retryCount === 0 || retryCount % 50 === 0) {
                console.warn(
                    '[cheat plugin warn] Utils is not ready yet; retrying GlobalShortcut initialization'
                );
            }

            this.initializeRetryHandle = setTimeout(() => {
                this.initializeWithRetry(retryCount + 1);
            }, INIT_RETRY_TIMEOUT_MS);
            return;
        }

        this.initialize();
    }

    isInitialized() {
        return this.initialized;
    }

    initialize() {
        if (this.initialized) {
            return;
        }

        if (this.initializeRetryHandle) {
            clearTimeout(this.initializeRetryHandle);
            this.initializeRetryHandle = null;
        }

        console.log('__global shortcut initialized');

        this.shortcutSettingsFile = './www/cheat-settings/shortcuts.json';

        // initialize shortcut settings
        this.shortcutSettings = {};
        this.readShortcutSettings();

        // initialize shortcut config
        this.shortcutConfig = {};
        this.initializeShortcutConfig();

        // migrate if settings file is old version
        this.migrateShortcutSettings();

        // initialize shortcut map
        this.shortcutMap = new ShortcutMap();
        this.initializeShortcutMap();

        this.initialized = true;
    }

    initializeShortcutConfig() {
        this.shortcutConfig = {};

        for (const key of Object.keys(shortcutConfig)) {
            this.shortcutConfig[key] = new ShortcutConfig(key, shortcutConfig[key]);
        }
    }

    migrateShortcutSettings() {
        let defaultSettings = null;
        const assignedKeys = new Set(
            Object.values(this.shortcutSettings).map((setting) => setting.shortcut.asString())
        );

        for (const shortcutConfig of Object.values(this.shortcutConfig)) {
            if (!Object.hasOwnProperty.call(this.shortcutSettings, shortcutConfig.id)) {
                // initialize default settings if not initialized
                if (!defaultSettings) {
                    defaultSettings = parseStringToKeyObject(defaultShortcutSettings);
                }

                // handle conflict keys
                const defaultSetting = defaultSettings[shortcutConfig.id];
                if (
                    !defaultSetting.shortcut.isEmpty() &&
                    assignedKeys.has(defaultSetting.shortcut.asString())
                ) {
                    console.warn(
                        `key conflicts while migrating : ${shortcutConfig.name} - ${defaultSetting.shortcut.asString()}`
                    );
                    defaultSetting.shortcut = Key.createEmpty();
                }

                assignedKeys.add(defaultSetting.shortcut.asString());

                this.shortcutSettings[shortcutConfig.id] = defaultSettings[shortcutConfig.id];
            }
        }

        // if settings migrated, save to file
        if (defaultSettings) {
            console.warn('__settings migrated');
            this.writeShortcutSettings();
        }
    }

    initializeShortcutMap() {
        let migrated = false;
        const defaultSettings = parseStringToKeyObject(defaultShortcutSettings);

        for (const shortcutConfig of Object.values(this.shortcutConfig)) {
            let shortcutSetting = this.shortcutSettings[shortcutConfig.id];

            if (!shortcutSetting) {
                shortcutSetting = defaultSettings[shortcutConfig.id];

                if (!shortcutSetting) {
                    shortcutSetting = {
                        shortcut: Key.createEmpty(),
                        param: {},
                    };
                }

                this.shortcutSettings[shortcutConfig.id] = shortcutSetting;
                migrated = true;
            }

            this.shortcutMap.register(
                shortcutSetting.shortcut,
                shortcutConfig,
                shortcutConfig.getEnterAction(shortcutSetting),
                shortcutConfig.getRepeatAction(shortcutSetting),
                shortcutConfig.getLeaveAction(shortcutSetting)
            );
        }

        if (migrated) {
            this.writeShortcutSettings();
        }
    }

    runKeyEnterEvent(e, key) {
        if (!this.shortcutMap) {
            return;
        }

        if (this.shortcutMap.runEnterAction(key)) {
            e.preventDefault();
            e.stopImmediatePropagation();
            e.stopPropagation();
        }
    }

    runKeyRepeatEvent(e, key) {
        if (!this.shortcutMap) {
            return;
        }

        if (this.shortcutMap.runRepeatAction(key)) {
            e.preventDefault();
            e.stopImmediatePropagation();
            e.stopPropagation();
        }
    }

    runKeyLeaveEvent(e, key) {
        if (!this.shortcutMap) {
            return;
        }

        if (this.shortcutMap.runLeaveAction(key)) {
            e.preventDefault();
            e.stopImmediatePropagation();
            e.stopPropagation();
        }
    }

    /**
     * read raw shortcut settings
     *
     */
    readRawShortcutSettings() {
        // if nwjs environment, read shortcut settings from file
        if (isNwjsEnvironment()) {
            const fs = require('fs');

            try {
                // read settings file
                return JSON.parse(fs.readFileSync(this.shortcutSettingsFile, 'utf-8'));
            } catch (err) {
                try {
                    // create default settings file
                    this.writeRawShortcutSettings(defaultShortcutSettings);

                    // read created file
                    return JSON.parse(fs.readFileSync(this.shortcutSettingsFile, 'utf-8'));
                } catch (fileWriteErr) {
                    Alert.warn(
                        "Can't initialize shortcut settings file. Use internal data instead.\n(You can use cheat plugin anyway)",
                        err
                    );
                    return defaultShortcutSettings;
                }
            }
        }

        // if using browser, read default shortcut settings
        console.warn('[cheat plugin warn] Use default settings');
        return defaultShortcutSettings;
    }

    /**
     * read and parse shortcut settings
     */
    readShortcutSettings() {
        const rawSettings = this.readRawShortcutSettings();
        this.shortcutSettings = {};

        try {
            this.shortcutSettings = parseStringToKeyObject(rawSettings);
        } catch (err) {
            Alert.warn(
                "Can't parse shortcut settings. Use default settings instead.\n(You can use cheat plugin anyway)",
                err
            );

            try {
                this.shortcutSettings = parseStringToKeyObject(defaultShortcutSettings);
            } catch (err) {
                Alert.error(
                    "Can't parse shortcut settings. Cheat plugin will not work properly",
                    err
                );
            }
        }
    }

    writeRawShortcutSettings(shortcutSettings) {
        if (isNwjsEnvironment()) {
            const fs = require('fs');
            const path = require('path');

            // remove previous settings file
            try {
                fs.unlinkSync(this.shortcutSettingsFile);
            } catch (e) {
                /* empty */
            }

            // create parent directory if not exists
            const parentDir = path.dirname(this.shortcutSettingsFile);

            if (!fs.existsSync(parentDir)) {
                fs.mkdirSync(parentDir, { recursive: true });
            }

            // create file
            fs.writeFileSync(this.shortcutSettingsFile, JSON.stringify(shortcutSettings, null, 2));
        }
    }

    writeShortcutSettings() {
        this.writeRawShortcutSettings(parseKeyObjectToString(this.shortcutSettings));
    }

    restoreDefaultSettings() {
        if (isNwjsEnvironment()) {
            // remove settings file
            try {
                require('fs').unlinkSync(this.shortcutSettingsFile);
            } catch (e) {
                /* empty */
            }

            this.initialize();
        }
    }

    getSettings(shortcutId) {
        if (!this.shortcutSettings) {
            return null;
        }

        return this.shortcutSettings[shortcutId] || null;
    }

    getConfig(shortcutId) {
        if (!this.shortcutConfig) {
            return null;
        }

        return this.shortcutConfig[shortcutId] || null;
    }

    getParamConfig(shortcutId, paramId) {
        const shortcutConfig = this.getConfig(shortcutId);
        if (!shortcutConfig || !shortcutConfig.param) {
            return null;
        }

        return shortcutConfig.param[paramId] || null;
    }

    getParam(shortcutId, paramId) {
        const shortcutSettings = this.getSettings(shortcutId);
        if (!shortcutSettings || !shortcutSettings.param) {
            return null;
        }

        return shortcutSettings.param[paramId];
    }

    getShortcut(shortcutId) {
        const shortcutSettings = this.getSettings(shortcutId);
        return shortcutSettings ? shortcutSettings.shortcut : null;
    }

    setShortcut(shortcutId, newKey) {
        // not need to change shortcut
        const prevKey = this.getShortcut(shortcutId);
        if (prevKey.equals(newKey)) {
            return;
        }

        const existingValue = this.shortcutMap.getValue(newKey);
        if (existingValue) {
            throw Error(
                `Conflict with existing shortcut : [${newKey.asDisplayString()}] ${existingValue.name}`
            );
        }

        // remove prev key binding if prev key exists
        this.shortcutMap.remove(prevKey);

        // bind key
        const currValue = this.getConfig(shortcutId);
        const currSettings = this.getSettings(shortcutId);
        this.shortcutMap.register(
            newKey,
            currValue,
            currValue.getEnterAction(currSettings),
            currValue.getRepeatAction(currSettings),
            currValue.getLeaveAction(currSettings)
        );

        // change settings
        currSettings.shortcut = newKey;

        // write changed settings
        this.writeShortcutSettings();
    }

    setParam(shortcutId, paramId, newValue) {
        const paramConfig = this.getParamConfig(shortcutId, paramId);

        const invalidMsg = paramConfig.isInvalidValue(newValue);

        if (invalidMsg) {
            throw Error(invalidMsg);
        }

        this.getSettings(shortcutId).param[paramId] = paramConfig.convertValue(newValue);

        this.writeShortcutSettings();
    }
}

export const GLOBAL_SHORTCUT = new GlobalShortcut();
