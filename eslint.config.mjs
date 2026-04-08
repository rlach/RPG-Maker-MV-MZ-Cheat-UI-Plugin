import js from '@eslint/js';
import globals from 'globals';
import vuePlugin from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';

const rpgMakerGlobals = {
    $dataActors: 'readonly',
    $dataArmors: 'readonly',
    $dataClasses: 'readonly',
    $dataEnemies: 'readonly',
    $dataItems: 'readonly',
    $dataMap: 'readonly',
    $dataSkills: 'readonly',
    $dataStates: 'readonly',
    $dataSystem: 'readonly',
    $dataTroops: 'readonly',
    $dataWeapons: 'readonly',
    $gameActors: 'readonly',
    $gameMap: 'readonly',
    $gameMessage: 'readonly',
    $gameParty: 'readonly',
    $gamePlayer: 'readonly',
    $gameSwitches: 'readonly',
    $gameSystem: 'readonly',
    $gameTemp: 'readonly',
    $gameTroop: 'readonly',
    $gameVariables: 'readonly',
    AudioManager: 'readonly',
    BattleManager: 'readonly',
    DataManager: 'readonly',
    Game_Actor: 'readonly',
    Game_Interpreter: 'readonly',
    Game_Map: 'readonly',
    Game_Message: 'readonly',
    Game_Party: 'readonly',
    Game_Player: 'readonly',
    ImageManager: 'readonly',
    Input: 'readonly',
    PluginManager: 'readonly',
    Scene_Battle: 'readonly',
    Scene_Base: 'readonly',
    Scene_Load: 'readonly',
    SceneManager: 'readonly',
    Scene_Map: 'readonly',
    Scene_Save: 'readonly',
    Scene_Title: 'readonly',
    SoundManager: 'readonly',
    Sprite: 'readonly',
    Spriteset_Base: 'readonly',
    StorageManager: 'readonly',
    TouchInput: 'readonly',
    Utils: 'readonly',
    Window_Base: 'readonly',
    Window_BattleLog: 'readonly',
    Window_Message: 'readonly',
    Window_ScrollText: 'readonly',
    Window_Selectable: 'readonly'
};

const sharedLanguageOptions = {
    ecmaVersion: 'latest',
    sourceType: 'module',
    globals: {
        ...globals.browser,
        ...globals.es2024,
        ...rpgMakerGlobals
    }
};

const sharedRules = {
    ...js.configs.recommended.rules,
    'no-empty-function': 'off',
    'no-undef': 'off',
    'no-unused-vars': [
        'error',
        {
            args: 'none',
            caughtErrors: 'none',
            ignoreRestSiblings: true
        }
    ]
};

export default [
    {
        ignores: [
            'node_modules/**',
            'deploy/output/**',
            'deploy/tmp/**',
            'cheat-engine/www/cheat/libs/**'
        ]
    },
    {
        files: ['cheat-engine/www/**/*.js'],
        languageOptions: sharedLanguageOptions,
        linterOptions: {
            reportUnusedDisableDirectives: 'warn'
        },
        rules: sharedRules
    },
    {
        files: ['cheat-engine/www/**/*.vue'],
        languageOptions: {
            ...sharedLanguageOptions,
            parser: vueParser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module'
            }
        },
        plugins: {
            vue: vuePlugin
        },
        rules: {
            ...sharedRules,
            'vue/no-parsing-error': 'error',
            'vue/no-unused-components': 'warn',
            'vue/no-unused-vars': 'error',
            'vue/multi-word-component-names': 'off'
        }
    }
];
