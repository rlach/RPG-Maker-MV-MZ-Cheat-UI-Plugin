import { Alert } from './AlertHelper.js';
import { KeyValueStorage } from './KeyValueStorage.js';
import { TranslateOnTheFlyState } from './TranslateOnTheFlyState.js';
import { MESSAGE_LOG } from './MessageLogStore.js';
import { OBJECT_TRANSLATION_SERVICE } from '../panels/translate-on-the-fly/ObjectTranslationService.js';
import { ensureTranslationRuntime } from '../panels/translate-on-the-fly/TranslationRuntime.js';
import {
    ensureSettingsMigration,
    getUnifiedSetting,
    setUnifiedSetting,
} from './UnifiedSettings.js';

export class GeneralCheat {
    static toggleCheatModal(componentName = null) {}

    static openCheatModal(componentName = null) {}

    static saveCheatSettings() {
        // Kept as no-op because persistence is optional in current flow.
    }

    static toggleNoClip(notify = false) {
        $gamePlayer._through = !$gamePlayer._through;

        if (notify) {
            Alert.success(`No clip toggled: ${$gamePlayer._through}`);
        }
    }

    static getGodModeOnActorIds() {
        if (!this.godModeMap) {
            return [];
        }

        const ret = [];

        for (const actor of this.godModeMap.keys()) {
            const data = this.godModeMap.get(actor);

            if (data.godMode) {
                ret.push(actor._actorId);
            }
        }

        return ret;
    }

    static getGodModeData(actor) {
        if (!this.godModeMap) {
            this.godModeMap = new Map();
        }

        if (this.godModeMap.has(actor)) {
            return this.godModeMap.get(actor);
        }

        const defaultData = {
            godMode: false,
            gainHp: null,
            setHp: null,
            gainMp: null,
            setMp: null,
            gainTp: null,
            setTp: null,
            paySkillCost: null,
            godModeInterval: null,
        };

        this.godModeMap.set(actor, defaultData);

        return defaultData;
    }

    static godModeOn(actor) {
        if (actor instanceof Game_Actor && !this.isGodMode(actor)) {
            const godModeData = this.getGodModeData(actor);
            godModeData.godMode = true;

            actor.gainHP_bkup = actor.gainHp;
            actor.gainHp = function (value) {
                value = actor.mhp;
                actor.gainHP_bkup(value);
            };

            actor.setHp_bkup = actor.setHp;
            actor.setHp = function (hp) {
                hp = actor.mhp;
                actor.setHp_bkup(hp);
            };

            actor.gainMp_bkup = actor.gainMp;
            actor.gainMp = function (value) {
                value = actor.mmp;
                actor.gainMp_bkup(value);
            };

            actor.setMp_bkup = actor.setMp;
            actor.setMp = function (mp) {
                mp = actor.mmp;
                actor.setMp_bkup(mp);
            };

            actor.gainTp_bkup = actor.gainTp;
            actor.gainTp = function (value) {
                value = actor.maxTp();
                actor.gainTp_bkup(value);
            };

            actor.setTp_bkup = actor.setTp;
            actor.setTp = function (tp) {
                tp = actor.maxTp();
                actor.setTp_bkup(tp);
            };

            actor.paySkillCost_bkup = actor.paySkillCost;
            actor.paySkillCost = function (skill) {
                // do nothing
            };

            godModeData.godModeInterval = setInterval(function () {
                actor.gainHp(actor.mhp);
                actor.gainMp(actor.mmp);
                actor.gainTp(actor.maxTp());
            }, 1000);

            this.saveCheatSettings();
        }
    }

    static godModeOff(actor) {
        if (actor instanceof Game_Actor && this.isGodMode(actor)) {
            const godModeData = this.getGodModeData(actor);
            godModeData.godMode = false;

            clearInterval(godModeData.godModeInterval);
            godModeData.godModeInterval = null;

            // actor.godMode field remains in save file, but backup methods aren't
            //
            if (actor.gainHP_bkup) {
                actor.gainHp = actor.gainHP_bkup;
                actor.setHp = actor.setHp_bkup;
                actor.gainMp = actor.gainMp_bkup;
                actor.setMp = actor.setMp_bkup;
                actor.gainTp = actor.gainTp_bkup;
                actor.setTp = actor.setTp_bkup;
                actor.paySkillCost = actor.paySkillCost_bkup;
            }

            this.saveCheatSettings();
        }
    }

    static toggleGodMode(actor) {
        if (this.isGodMode(actor)) {
            this.godModeOff(actor);
        } else {
            this.godModeOn(actor);
        }
    }

    static isGodMode(actor) {
        return this.getGodModeData(actor).godMode;
    }
}

let speedCheatFixedInterval = undefined;

export class GameSpeedCheat {
    static sceneOptions() {
        if (!this._sceneOptions) {
            this._sceneOptions = {
                all() {
                    return true;
                },

                battle() {
                    return SceneManager._scene instanceof Scene_Battle;
                },
            };
        }

        return this._sceneOptions;
    }

    static getRate() {
        if (this.rate) {
            return this.rate;
        }

        return 1;
    }

    static getSceneOption() {
        if (this.sceneOption) {
            return this.sceneOption;
        }

        return this.sceneOptions().all;
    }

    static removeApplied() {
        if (this.isApplied) {
            SceneManager.updateScene = this.origin_SceneManager_updateScene;
            Scene_Map.prototype.update = this.origin_Scene_Map_update;
            Spriteset_Base.prototype.update = this.origin_Spriteset_Base_update;
            this.isApplied = false;
        }
    }

    static setGameSpeed(rate, sceneOption) {
        // backup original functions
        if (!this.origin_SceneManager_updateScene) {
            this.origin_SceneManager_updateScene = SceneManager.updateScene;
        }

        if (!this.origin_Scene_Map_update) {
            this.origin_Scene_Map_update = Scene_Map.prototype.update;
        }

        if (!this.origin_Spriteset_Base_update) {
            this.origin_Spriteset_Base_update = Spriteset_Base.prototype.update;
        }

        if (!sceneOption) {
            sceneOption = GameSpeedCheat.sceneOptions().all;
        }

        this.rate = rate;
        this.sceneOption = sceneOption;

        // remove previously modified functions
        this.removeApplied();

        // if rate is 1, do not modify functions
        if (Math.abs(rate - 1.0) < Number.EPSILON) {
            return;
        }

        // updateScene triggers event such as key inpuy, mouse input ...
        // It occurs double click.
        const SceneManager_updateScene = this.origin_SceneManager_updateScene;
        let currentUpdateSceneRate = 0;
        SceneManager.updateScene = function () {
            if (!sceneOption()) {
                SceneManager_updateScene.call(this);
                return;
            }

            currentUpdateSceneRate += rate;
            const currStep = Math.floor(currentUpdateSceneRate);
            currentUpdateSceneRate -= currStep;

            if (currStep > 0) {
                // update original frame
                SceneManager_updateScene.call(this);

                // update duplicated frames
                for (let i = 0; i < currStep - 1; ++i) {
                    SceneManager.updateInputData();
                    SceneManager.changeScene();
                    SceneManager_updateScene.call(this);
                }
            }
        };

        this.isApplied = true;
    }

    static __writeSettings(rate, sceneOption) {
        const options = GameSpeedCheat.sceneOptions();
        const sceneOptionKey = Object.keys(GameSpeedCheat.sceneOptions()).find(
            (key) => options[key] === sceneOption
        );
        setUnifiedSetting('gameSpeed', {
            rate: rate,
            sceneOption: sceneOptionKey,
        });
    }

    static __readSettings() {
        const data = getUnifiedSetting('gameSpeed', null);

        if (!data || typeof data !== 'object') {
            return;
        }

        GameSpeedCheat.setGameSpeed(data.rate, GameSpeedCheat.sceneOptions()[data.sceneOption]);
    }
}

export class SpeedCheat {
    // static fixed = null // WARN: declaring static variable occurs error in nw.js (why?)

    static isFixed() {
        return !!speedCheatFixedInterval;
    }

    static setFixSpeedInterval(speed) {
        if (SpeedCheat.isFixed()) {
            SpeedCheat.removeFixSpeedInterval();
        }

        speedCheatFixedInterval = setInterval(() => {
            SpeedCheat.__setSpeed(speed);
        }, 1000);
    }

    static removeFixSpeedInterval() {
        if (SpeedCheat.isFixed()) {
            clearInterval(speedCheatFixedInterval);
            speedCheatFixedInterval = undefined;
        }
    }

    static __setSpeed(speed) {
        $gamePlayer.setMoveSpeed(speed);
    }

    static setSpeed(speed, fixed = false) {
        SpeedCheat.__setSpeed(speed);

        if (fixed) {
            SpeedCheat.setFixSpeedInterval(speed);
        } else {
            SpeedCheat.removeFixSpeedInterval();
        }
    }

    static __writeSettings(speed, fixed) {
        const storage = new KeyValueStorage('./www/cheat-settings/speed.json');

        storage.setItem('data', JSON.stringify({ speed: speed, fixed: fixed }));
    }

    static __readSettings() {
        const storage = new KeyValueStorage('./www/cheat-settings/speed.json');

        const json = storage.getItem('data');

        if (!json) {
            return;
        }

        const data = JSON.parse(json);

        if (data.fixed) {
            SpeedCheat.setSpeed(data.speed, data.fixed);
        }
    }
}

export class SceneCheat {
    static gotoTitle() {
        SceneManager.goto(Scene_Title);
    }

    static toggleSaveScene() {
        if (SceneManager._scene.constructor === Scene_Save) {
            SceneManager.pop();
        } else if (SceneManager._scene.constructor === Scene_Load) {
            SceneManager.goto(Scene_Save);
        } else {
            SceneManager.push(Scene_Save);
        }
    }

    static toggleLoadScene() {
        if (SceneManager._scene.constructor === Scene_Load) {
            SceneManager.pop();
        } else if (SceneManager._scene.constructor === Scene_Save) {
            SceneManager.goto(Scene_Load);
        } else {
            SceneManager.push(Scene_Load);
        }
    }

    static quickSave(slot = 1) {
        $gameSystem.onBeforeSave();
        DataManager.saveGame(slot);

        Alert.success(`Game saved to slot ${slot}`);
    }

    static quickLoad(slot = 1) {
        DataManager.loadGame(slot);
        SceneManager.goto(Scene_Map);

        Alert.success(`Game loaded from slot ${slot}`);
    }
}

export class BattleCheat {
    static recover(member) {
        member.setHp(member.mhp);
        member.setMp(member.mmp);
        member.setTp(member.maxTp());
    }

    static recoverAllEnemy() {
        for (const member of $gameTroop.members()) {
            this.recover(member);
        }

        Alert.success('Recovery all enemies');
    }

    static recoverAllParty() {
        for (const member of $gameParty.members()) {
            this.recover(member);
        }

        Alert.success('Recovery all party members');
    }

    static fillTpAllEnemy() {
        for (const member of $gameTroop.members()) {
            member.setTp(member.maxTp());
        }

        Alert.success('Fill TP all enemies');
    }

    static fillTpAllParty() {
        for (const member of $gameParty.members()) {
            member.setTp(member.maxTp());
        }

        Alert.success('Fill TP all party members');
    }

    static changeAllEnemyHealth(newHp) {
        for (const member of $gameTroop.members()) {
            member.setHp(newHp);
        }

        Alert.success(`HP ${newHp} for all enemies`);
    }

    static changeAllPartyHealth(newHp) {
        for (const member of $gameParty.members()) {
            member.setHp(newHp);
        }

        Alert.success(`HP ${newHp} for all party members`);
    }

    static canExecuteBattleEndProcess() {
        return (
            SceneManager._scene &&
            SceneManager._scene.constructor === Scene_Battle &&
            BattleManager._phase !== 'battleEnd'
        );
    }

    static encounterBattle() {
        $gamePlayer._encounterCount = 0;
    }

    static victory() {
        if (this.canExecuteBattleEndProcess()) {
            $gameTroop.members().forEach((enemy) => {
                enemy.addNewState(enemy.deathStateId());
            });
            BattleManager.processVictory();
            Alert.success('Forced victory from battle!');
            return true;
        }
        return false;
    }

    static defeat() {
        if (this.canExecuteBattleEndProcess()) {
            $gameParty.members().forEach((actor) => {
                actor.addNewState(actor.deathStateId());
            });
            BattleManager.processDefeat();
            Alert.success('Forced defeat from battle...');
            return true;
        }
        return false;
    }

    static escape() {
        if (this.canExecuteBattleEndProcess()) {
            $gameParty.performEscape();
            SoundManager.playEscape();
            BattleManager._escaped = true;
            BattleManager.processEscape();
            Alert.success('Forced escape from battle');
            return true;
        }
        return false;
    }

    static abort() {
        if (this.canExecuteBattleEndProcess()) {
            $gameParty.performEscape();
            SoundManager.playEscape();
            BattleManager._escaped = true;
            BattleManager.processAbort();
            Alert.success('Forced abort battle');
            return true;
        }
        return false;
    }

    static toggleDisableRandomEncounter() {
        // change $gamePlayer.canEncounter function
        // if canEncounter is false, $gamePlayer.updateEncounterCount() do not decreases $gamePlayer._encounterCount
        if (this.isDisableRandomEncounter()) {
            if (this.canEncounter_bkup) {
                $gamePlayer.canEncounter = this.canEncounter_bkup;
            }
        } else {
            this.canEncounter_bkup = $gamePlayer.canEncounter;

            $gamePlayer.canEncounter = function () {
                return false;
            };
        }

        this.disableRandomEncounter = !this.isDisableRandomEncounter();
    }

    static isDisableRandomEncounter() {
        return !!this.disableRandomEncounter && this.disableRandomEncounter;
    }
}

export class AlwaysDashCheat {
    static getAlwaysDash() {
        const configManager = window['ConfigManager'];

        if (configManager && configManager.alwaysDash !== undefined) {
            return configManager.alwaysDash;
        }

        return false;
    }

    static setAlwaysDash(value) {
        const configManager = window['ConfigManager'];

        if (!configManager) {
            return;
        }

        configManager.alwaysDash = !!value;
        if (typeof configManager.save === 'function') {
            configManager.save();
        }
    }

    static toggleAlwaysDash() {
        const current = this.getAlwaysDash();
        this.setAlwaysDash(!current);
        return !current;
    }

    static __writeSettings(alwaysDash) {
        setUnifiedSetting('alwaysDash', !!alwaysDash);
    }

    static __readSettings() {
        const alwaysDash = getUnifiedSetting('alwaysDash', undefined);

        if (alwaysDash === undefined) {
            return;
        }

        this.setAlwaysDash(alwaysDash);
    }
}

export class TextSpeedCheat {
    static defaultTextSpeed() {
        return 1;
    }

    static normalizeTextSpeed(speed) {
        const numericSpeed = Number(speed);

        if (!Number.isFinite(numericSpeed)) {
            return TextSpeedCheat.defaultTextSpeed();
        }

        return Math.max(0, Math.min(20, Math.round(numericSpeed)));
    }

    static getTextSpeed() {
        if (typeof $gameSystem !== 'undefined' && $gameSystem._textSpeed !== undefined) {
            return TextSpeedCheat.normalizeTextSpeed($gameSystem._textSpeed);
        }

        return TextSpeedCheat.defaultTextSpeed();
    }

    static setTextSpeed(speed) {
        const clampedSpeed = TextSpeedCheat.normalizeTextSpeed(speed);

        if (typeof $gameSystem !== 'undefined') {
            $gameSystem._textSpeed = clampedSpeed;
        }

        return clampedSpeed;
    }

    static isInstant() {
        return TextSpeedCheat.getTextSpeed() === 0;
    }

    static getCharacterWaitFrames() {
        return Math.max(0, TextSpeedCheat.getTextSpeed() - 1);
    }

    static shouldDelayCharacter(windowMessage, character) {
        if (!windowMessage || TextSpeedCheat.isInstant()) {
            return false;
        }

        if (MessageCheat.skip || windowMessage._showFast || windowMessage._lineShowFast) {
            return false;
        }

        return character !== '\n' && character !== '\f' && character !== '\x1b';
    }

    static applyCharacterWait(windowMessage, character) {
        if (!TextSpeedCheat.shouldDelayCharacter(windowMessage, character)) {
            return;
        }

        const waitFrames = TextSpeedCheat.getCharacterWaitFrames();
        if (waitFrames > 0) {
            windowMessage._waitCount = Math.max(windowMessage._waitCount || 0, waitFrames);
        }
    }

    static __writeSettings(textSpeed) {
        TextSpeedCheat.setTextSpeed(textSpeed);
    }

    static __readSettings() {
        // Text speed lives in current game data ($gameSystem), not cheat settings.
    }
}

export class MessageCheat {
    static initialize() {
        this.skip = false;

        Window_Message.prototype.processCharacter = function (textState) {
            const currentCharacter =
                textState && textState.text ? textState.text[textState.index] : undefined;

            Window_Base.prototype.processCharacter.call(this, textState);
            TextSpeedCheat.applyCharacterWait(this, currentCharacter);
        };

        if (typeof Window_Message.prototype.shouldBreakHere === 'function') {
            const _Window_Message_shouldBreakHere = Window_Message.prototype.shouldBreakHere;
            Window_Message.prototype.shouldBreakHere = function (textState) {
                if (TextSpeedCheat.isInstant() && this.canBreakHere(textState)) {
                    const waiting =
                        typeof this.isWaiting === 'function'
                            ? this.isWaiting()
                            : !!this.pause || (this._waitCount || 0) > 0;
                    return waiting;
                }

                return _Window_Message_shouldBreakHere.call(this, textState);
            };
        } else {
            Window_Message.prototype.updateMessage = function () {
                if (this._textState) {
                    while (!this.isEndOfText(this._textState)) {
                        if (this.needsNewPage(this._textState)) {
                            this.newPage(this._textState);
                        }

                        this.updateShowFast();
                        this.processCharacter(this._textState);

                        if (!TextSpeedCheat.isInstant() && !this._showFast && !this._lineShowFast) {
                            break;
                        }

                        if (this.pause || this._waitCount > 0) {
                            break;
                        }
                    }

                    if (this.isEndOfText(this._textState)) {
                        this.onEndOfText();
                    }

                    return true;
                }

                return false;
            };
        }

        // Skip message display animation
        // It seems to be executed whenever each character is output in the message window
        const _Window_Message_updateShowFast = Window_Message.prototype.updateShowFast;
        Window_Message.prototype.updateShowFast = function () {
            _Window_Message_updateShowFast.call(this);
            // 여기에 skip 키 입력 체크
            if (MessageCheat.skip) {
                this._showFast = true;
                this._pauseSkip = true;
            }
        };

        // Skip waiting for input after displaying text
        // It seems to always run every few ms
        const _Window_Message_updateInput = Window_Message.prototype.updateInput;
        Window_Message.prototype.updateInput = function () {
            const ret = _Window_Message_updateInput.call(this);

            if (this.pause && MessageCheat.skip) {
                this.pause = false;

                if (!this._textState) {
                    this.terminateMessage();
                }
                return true;
            }

            return ret;
        };

        // Accelerates the scrolling message speed
        const Window_ScrollText_scrollSpeed = Window_ScrollText.prototype.scrollSpeed;
        Window_ScrollText.prototype.scrollSpeed = function () {
            let ret = Window_ScrollText_scrollSpeed.call(this);

            if (MessageCheat.skip) {
                // 여기에서 skip 키 입력 체크
                ret *= 100;
            }

            return ret;
        };

        // Log every message that reaches the window
        const _Window_Message_startMessage = Window_Message.prototype.startMessage;
        Window_Message.prototype.startMessage = function () {
            _Window_Message_startMessage.call(this);
            MessageCheat.logCurrentMessage();
        };

        // MV can apply choices later without re-entering startMessage.
        // Log again when choices are set so they are visible in Text Log.
        if (!Game_Message.prototype._messageLogOriginalSetChoices) {
            Game_Message.prototype._messageLogOriginalSetChoices =
                Game_Message.prototype.setChoices;
        }

        Game_Message.prototype.setChoices = function (choices, defaultType, cancelType) {
            Game_Message.prototype._messageLogOriginalSetChoices.call(
                this,
                choices,
                defaultType,
                cancelType
            );
            MessageCheat.logCurrentMessage();
        };

        // --------------------------- 배틀 로그 관련
        // Accelerates the battle log output speed
        const _Window_BattleLog_messageSpeed = Window_BattleLog.prototype.messageSpeed;
        Window_BattleLog.prototype.messageSpeed = function () {
            let ret = _Window_BattleLog_messageSpeed.call(this);

            if (MessageCheat.skip) {
                // 여기에서 skip 키 입력 체크
                ret = 1;
            }

            return ret;
        };
    }

    static toggleRealtimeTranslation(notify = true) {
        const enabled = TranslateOnTheFlyState.toggleEnabled();
        const runtime = ensureTranslationRuntime();

        if (runtime && typeof runtime.applyExternalToggle === 'function') {
            runtime.applyExternalToggle(enabled, false);
        }

        if (notify) {
            Alert.success(`Real-time translation: ${enabled ? 'enabled' : 'disabled'}`);
        }

        return enabled;
    }

    static translateCurrentMessage() {
        try {
            const runtime = ensureTranslationRuntime();
            console.log('[MessageCheat] translateCurrentMessage called', runtime);
            if (!runtime || typeof runtime.translateAndApplyCurrentMessage !== 'function') {
                console.warn('[MessageCheat] Translation runtime not available');
                Alert.error('Translation runtime not initialized');
                return;
            }

            const gameMessage = runtime.currentGameMessage || $gameMessage;

            if (!gameMessage || typeof gameMessage.allText !== 'function') {
                console.warn('[MessageCheat] No gameMessage available');
                Alert.warn('No message to translate');
                return;
            }

            const text = gameMessage.allText();
            const choices = gameMessage.choices ? gameMessage.choices() : [];
            const hasChoices = Array.isArray(choices) && choices.length > 0;

            if ((!text || text.trim().length === 0) && !hasChoices) {
                console.warn('[MessageCheat] Message text is empty and no choices');
                Alert.warn('No message to translate');
                return;
            }

            console.log(
                '[MessageCheat] Translating current message:',
                text.substring(0, 50) + '...',
                hasChoices ? `with ${choices.length} choices` : ''
            );
            runtime.translateAndApplyCurrentMessage();
        } catch (err) {
            console.error('[MessageCheat] Failed to translate current message', err);
            const message = err instanceof Error ? err.message : String(err);
            Alert.error('Failed to translate message: ' + message);
        }
    }

    static replaceCurrentMessageWithWidthPreview() {
        try {
            const runtime = ensureTranslationRuntime();
            const msgWindow = runtime?.currentMessageWindow;

            // A message window must be active
            if (!msgWindow) {
                Alert.warn('No active message window');
                return;
            }

            let previewLine = '1234567890'.repeat(10);
            previewLine = `${previewLine}\n\\{${previewLine}\n\\{${previewLine}`;

            if (typeof runtime.replaceMessageText === 'function') {
                // replaceMessageText also resets the window's _textState
                runtime.replaceMessageText(previewLine);
            } else {
                // Fallback: update $gameMessage directly and reset window state manually
                const gameMessage = runtime?.currentGameMessage || $gameMessage;
                if (gameMessage && Array.isArray(gameMessage._texts)) {
                    gameMessage._texts.length = 0;
                    gameMessage._texts.push(previewLine);
                }
                const makeTextState = (text) => {
                    if (typeof msgWindow.createTextState === 'function') {
                        const ts = msgWindow.createTextState(text, 0, 0, 0);
                        ts.x =
                            typeof msgWindow.newLineX === 'function' ? msgWindow.newLineX(ts) : 0;
                        ts.startX = ts.x;
                        return ts;
                    }
                    const converted =
                        typeof msgWindow.convertEscapeCharacters === 'function'
                            ? msgWindow.convertEscapeCharacters(text)
                            : text;
                    return { index: 0, text: converted };
                };
                if (msgWindow._textState) {
                    msgWindow._textState = makeTextState(previewLine);
                    if (typeof msgWindow.newPage === 'function') {
                        msgWindow.newPage(msgWindow._textState);
                    }
                } else if (msgWindow.pause) {
                    msgWindow._textState = makeTextState(previewLine);
                    if (typeof msgWindow.newPage === 'function') {
                        msgWindow.newPage(msgWindow._textState);
                    }
                    msgWindow._showFast = true;
                    msgWindow.pause = false;
                    msgWindow._waitCount = 0;
                } else {
                    Alert.warn('No active message to replace');
                    return;
                }
            }

            Alert.success('Width preview applied');
        } catch (err) {
            console.error('[MessageCheat] Failed to replace current message text', err);
            const message = err instanceof Error ? err.message : String(err);
            Alert.error('Failed to replace current message: ' + message);
        }
    }

    static translateCurrentMap() {
        try {
            const runtime = ensureTranslationRuntime();
            if (!runtime || typeof runtime.translateMapEvents !== 'function') {
                console.warn('[MessageCheat] Translation runtime not available');
                Alert.error('Translation runtime not initialized');
                return;
            }

            // Check if map is loaded
            if (!$dataMap) {
                console.warn('[MessageCheat] No map loaded');
                Alert.warn('No map to translate');
                return;
            }

            console.log(
                '[MessageCheat] Translating current map:',
                $dataMap.displayName || '(unknown)'
            );
            runtime.translateMapEvents();
        } catch (err) {
            console.error('[MessageCheat] Failed to translate map', err);
            const message = err instanceof Error ? err.message : String(err);
            Alert.error('Failed to translate map: ' + message);
        }
    }

    static translateAllMaps() {
        try {
            const runtime = ensureTranslationRuntime();
            if (!runtime || typeof runtime.translateAllMaps !== 'function') {
                console.warn('[MessageCheat] Translation runtime not available');
                Alert.error('Translation runtime not initialized');
                return;
            }

            console.log('[MessageCheat] Translating all maps');
            runtime.translateAllMaps();
        } catch (err) {
            console.error('[MessageCheat] Failed to translate all maps', err);
            const message = err instanceof Error ? err.message : String(err);
            Alert.error('Failed to translate all maps: ' + message);
        }
    }

    static openObjectTranslationModal() {
        try {
            Promise.resolve(OBJECT_TRANSLATION_SERVICE.openModal()).catch((err) => {
                console.error('[MessageCheat] Failed to open object translation modal', err);
                Alert.error(
                    'Failed to open object translation modal: ' + (err?.message || String(err))
                );
            });
        } catch (err) {
            console.error('[MessageCheat] Failed to open object translation modal', err);
            const message = err instanceof Error ? err.message : String(err);
            Alert.error('Failed to open object translation modal: ' + message);
        }
    }

    static logCurrentMessage() {
        try {
            if (!$gameMessage || typeof $gameMessage.allText !== 'function') {
                return;
            }

            const text = $gameMessage.allText() || '';
            const choices = $gameMessage.choices ? $gameMessage.choices() : [];
            const speakerName = ($gameMessage._speakerName || '').trim();
            let combined = text;

            if (Array.isArray(choices) && choices.length > 0) {
                const lines = choices.map((choice, index) => `[${index + 1}] ${choice}`);
                combined = combined ? `${combined}\n${lines.join('\n')}` : lines.join('\n');
            }

            if (!combined || combined.trim().length === 0) {
                return;
            }

            console.log('[MessageCheat] Logging message:', combined);

            MESSAGE_LOG.addEntry(combined, {
                translated: !!TranslateOnTheFlyState.isEnabled() && !MessageCheat.skip,
                skipped: !!MessageCheat.skip,
                speakerName: speakerName || null,
            });
        } catch (err) {
            console.warn('[MessageCheat] Failed to log message', err);
        }
    }

    static startSkip(gameSpeed) {
        if (gameSpeed === 1) {
            this.gameSpeedBackup = null;
        } else {
            this.gameSpeedBackup = {
                rate: GameSpeedCheat.getRate(),
                sceneOption: GameSpeedCheat.getSceneOption(),
            };

            GameSpeedCheat.setGameSpeed(gameSpeed, GameSpeedCheat.sceneOptions().all);
        }

        this.skip = true;
    }

    static stopSkip() {
        if (this.gameSpeedBackup) {
            // restore game speed
            GameSpeedCheat.setGameSpeed(
                this.gameSpeedBackup.rate,
                this.gameSpeedBackup.sceneOption
            );
            this.gameSpeedBackup = null;
        }

        this.skip = false;
    }
}

// Expose cheat helpers on the window so external cheat windows can reuse the same instances
try {
    window['GeneralCheat'] = GeneralCheat;
    window['GameSpeedCheat'] = GameSpeedCheat;
    window['SpeedCheat'] = SpeedCheat;
    window['SceneCheat'] = SceneCheat;
    window['MessageCheat'] = MessageCheat;
    window['AlwaysDashCheat'] = AlwaysDashCheat;
    window['TextSpeedCheat'] = TextSpeedCheat;
} catch (err) {
    // Non-fatal: best-effort exposure only
}

async function multiRetryAction(action, intervalTimeout, maxTryCount) {
    let tryCount = 0;

    const interval = setInterval(() => {
        try {
            ++tryCount;
            action();
        } catch (e) {
            console.log(e);
            if (tryCount < maxTryCount) {
                // try again
                return;
            }
        }

        clearInterval(interval);
    }, intervalTimeout);
}

function initialize() {
    ensureSettingsMigration();

    const intervalTimeout = 500;
    const maxTryCount = 100;

    const initializeActions = [
        SpeedCheat.__readSettings,
        GameSpeedCheat.__readSettings,
        AlwaysDashCheat.__readSettings,
        TextSpeedCheat.__readSettings,
    ];

    initializeActions.forEach((action) => multiRetryAction(action, intervalTimeout, maxTryCount));
}

// Don't initialize in external cheat window - no game engine there
if (!window.opener) {
    initialize();
}
