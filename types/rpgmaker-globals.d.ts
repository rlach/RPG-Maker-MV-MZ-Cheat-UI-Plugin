declare const $gamePlayer: any;
declare const $gameMap: any;
declare const $gameParty: any;
declare const $gameActors: any;
declare const $gameTroop: any;
declare const $gameSystem: any;
declare const $gameSwitches: any;
declare const $gameVariables: any;
declare const $gameTemp: any;
declare const $gameMessage: any;
declare const $dataActors: any;
declare const $dataClasses: any;
declare const $dataSkills: any;
declare const $dataItems: any;
declare const $dataWeapons: any;
declare const $dataArmors: any;
declare const $dataEnemies: any;
declare const $dataTroops: any;
declare const $dataStates: any;
declare const $dataMap: any;
declare const $dataSystem: any;

declare const SceneManager: any;
declare const DataManager: any;
declare const BattleManager: any;
declare const ImageManager: any;
declare const AudioManager: any;
declare const SoundManager: any;
declare const StorageManager: any;
declare const Input: any;
declare const TouchInput: any;

declare const Game_Actor: any;
declare const Game_Party: any;
declare const Game_Interpreter: any;
declare const Game_Message: any;
declare const Game_Player: any;
declare const Game_Map: any;

declare const Scene_Base: any;
declare const Scene_Map: any;
declare const Scene_Battle: any;
declare const Scene_Title: any;
declare const Scene_Save: any;
declare const Scene_Load: any;

declare const Spriteset_Base: any;
declare const Sprite: any;
declare const Window_Base: any;
declare const Window_Selectable: any;
declare const Window_Message: any;
declare const Window_ScrollText: any;
declare const Window_BattleLog: any;

declare const PluginManager: any;
declare const Utils: any;

declare interface Window {
    nw?: any;
    __CHEAT_EXTERNAL_WINDOW__?: boolean;
    $externMessage?: any;
    $plugins?: any[];
    __CHEAT_MAIN_WINDOW__?: Window | null;
    GeneralCheat?: any;
    GameSpeedCheat?: any;
    SpeedCheat?: any;
    SceneCheat?: any;
    MessageCheat?: any;
}
