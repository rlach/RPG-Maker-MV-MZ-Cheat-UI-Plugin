import { GeneralCheat, GameSpeedCheat, SpeedCheat, SceneCheat } from '../js/CheatHelper.js'
import { CHEAT_WINDOW_MANAGER } from '../js/CheatWindowManager.js'

export default {
    name: 'GeneralPanel',

    template: `
<v-card 
    class="ma-0 pa-0"
    flat>
    <v-card-subtitle class="pb-0 font-weight-bold">Edit</v-card-subtitle>
    
    <v-card-text 
        class="py-0">
        <v-checkbox
            v-model="noClip"
            label="No Clip"
            @change="onNoClipChange">
        </v-checkbox>

        <v-checkbox
            v-model="openInSeparateWindow"
            label="Open in separate window"
            @change="onOpenInSeparateWindowChange">
        </v-checkbox>
    </v-card-text>
    
    <v-card-text class="py-0">
        <v-text-field
            v-model="gold"
            label="Gold"
            outlined
            dense
            hide-details
            @keydown.self.stop
            @change="onGoldChange"
            @focus="$event.target.select()">
        </v-text-field>
    </v-card-text>
    
    <v-card-text class="pt-4 pb-0">
        <v-slider
            v-model="speed"
            :min="minSpeed"
            :max="maxSpeed"
            :step="stepSpeed"
            thumb-label
            thumb-color="red"
            hide-details
            @change="onSpeedChange">
            <template v-slot:prepend>
                <span class="grey--text text--lighten-1 align-self-center mr-2 body-2" style="white-space: nowrap;">Move Speed</span>
                <v-icon color="grey lighten-3" @click="addSpeed(-stepSpeed)">mdi-chevron-left</v-icon>
            </template>
            <template v-slot:append>
                <v-icon color="grey lighten-3" @click="addSpeed(stepSpeed)">mdi-chevron-right</v-icon>
                <span class="grey--text text--lighten-1 align-self-center ml-2">{{speed.toFixed(1)}}</span>
            </template>
        </v-slider>
        <v-checkbox
            v-model="fixSpeed"
            class="pt-0"
            hide-details
            dense
            label="Fixed"
            @change="onSpeedChange">
        </v-checkbox>
        
        <v-slider
            v-model="gameSpeed"
            :min="minGameSpeed"
            :max="maxGameSpeed"
            :step="stepGameSpeed"
            class="mt-3"
            thumb-label
            thumb-color="red"
            hide-details
            @change="onGameSpeedChange">
            <template v-slot:prepend>
                <span class="grey--text text--lighten-1 align-self-center mr-2 d-inline-block body-2" style="white-space: nowrap;">Game Speed</span>
                <v-icon color="grey lighten-3" @click="addGameSpeed(-stepGameSpeed)">mdi-chevron-left</v-icon>
            </template>
            <template v-slot:append>
                <v-icon color="grey lighten-3" @click="addGameSpeed(stepGameSpeed)">mdi-chevron-right</v-icon>
                <span class="grey--text text--lighten-1 align-self-center ml-2 mr-2">x{{gameSpeed.toFixed(1)}}</span>
                <v-icon size="16" color="grey lighten-3 ml-2" @click="setGameSpeed()">mdi-restore</v-icon>
            </template>
        </v-slider>
        
        <v-checkbox
            v-model="applyAllForGameSpeed"
            class="d-inline-flex pt-0"
            hide-details
            dense
            label="All"
            @change="onApplyAllForGameSpeedChange">
        </v-checkbox>
        <v-checkbox
            v-model="applyBattleForGameSpeed"
            class="d-inline-flex ml-2 pt-0 mb-0"
            hide-details
            dense
            label="Battle"
            @change="onApplyBattleForGameSpeedChange">
        </v-checkbox>
    </v-card-text>
    
    <v-card-subtitle class="mt-3 font-weight-bold">Quick Actions</v-card-subtitle>
    
    <v-card-text class="py-0">
        <v-btn
            small
            @click="gotoTitle">
            To Title
        </v-btn>
    </v-card-text>
    
    <v-card-text>
        <v-btn 
            small
            class="mr-1"
            @click="toggleSaveScene">
            Open Save
        </v-btn>
        <v-btn
            small
            @click="toggleLoadScene">
            Open Load
        </v-btn>
    </v-card-text>
    
    <v-tooltip
        bottom>
        <span>Reload from game data</span>
        <template v-slot:activator="{ on, attrs }">
            <v-btn
                style="top: 0px; right: 0px;"
                color="pink"
                dark
                small
                absolute
                top
                right
                fab
                v-bind="attrs"
                v-on="on"
                @click="initializeVariables">
                <v-icon>mdi-refresh</v-icon>
            </v-btn>
        </template>
    </v-tooltip>
</v-card>
    `,

    data () {
        return {
            godMode: false,
            noClip: false,
            gold: 0,
            speed: 0,
            fixSpeed: false,

            rootWindow: null,
            rootWindowManager: null,
            rootMainComponent: null,

            cheatApi: {
                GeneralCheat,
                GameSpeedCheat,
                SpeedCheat,
                SceneCheat
            },

            openInSeparateWindow: CHEAT_WINDOW_MANAGER.isSeparateWindowEnabled(),

            minSpeed: 1,
            maxSpeed: 10,
            stepSpeed: 0.5,

            gameSpeed: 1,
            minGameSpeed: 0.1,
            maxGameSpeed: 10,
            stepGameSpeed: 0.1,
            applyAllForGameSpeed: false,
            applyBattleForGameSpeed: false
        }
    },

    created () {
        const root = (window.__CHEAT_EXTERNAL_WINDOW__ && window.opener && !window.opener.closed) ? window.opener : window
        this.rootWindow = root
        this.rootWindowManager = root.__CHEAT_WINDOW_MANAGER__ || CHEAT_WINDOW_MANAGER
        this.rootMainComponent = root.__CHEAT_MAIN_COMPONENT__ || null
        this.cheatApi = {
            GeneralCheat: root.GeneralCheat || GeneralCheat,
            GameSpeedCheat: root.GameSpeedCheat || GameSpeedCheat,
            SpeedCheat: root.SpeedCheat || SpeedCheat,
            SceneCheat: root.SceneCheat || SceneCheat
        }

        this.initializeVariables()
    },

    methods: {
        getRootWindow () {
            const root = this.rootWindow
            if (root && root.closed !== true) {
                return root
            }
            return window
        },

        initializeVariables () {
            const root = this.getRootWindow()
            const gamePlayer = root.$gamePlayer
            const gameParty = root.$gameParty
            const speedCheat = this.cheatApi.SpeedCheat
            const gameSpeedCheat = this.cheatApi.GameSpeedCheat || GameSpeedCheat

            this.noClip = gamePlayer ? gamePlayer._through : false
            this.speed = gamePlayer && typeof gamePlayer.moveSpeed === 'function' ? gamePlayer.moveSpeed() : 0
            this.fixSpeed = speedCheat && speedCheat.isFixed ? speedCheat.isFixed() : false
            this.gold = gameParty ? gameParty._gold : 0

            const manager = this.rootWindowManager || CHEAT_WINDOW_MANAGER
            this.openInSeparateWindow = manager.isSeparateWindowEnabled()

            this.gameSpeed = gameSpeedCheat && gameSpeedCheat.getRate ? gameSpeedCheat.getRate() : 1
            const gameSpeedSceneOption = gameSpeedCheat && gameSpeedCheat.getSceneOption ? gameSpeedCheat.getSceneOption() : null
            const options = gameSpeedCheat && gameSpeedCheat.sceneOptions ? gameSpeedCheat.sceneOptions() : { all: null, battle: null }
            this.applyAllForGameSpeed = gameSpeedSceneOption === options.all
            this.applyBattleForGameSpeed = gameSpeedSceneOption === options.battle
        },

        onNoClipChange () {
            if (this.cheatApi.GeneralCheat && this.cheatApi.GeneralCheat.toggleNoClip) {
                this.cheatApi.GeneralCheat.toggleNoClip()
            }
            this.initializeVariables()
        },

        onOpenInSeparateWindowChange () {
            const manager = this.rootWindowManager || CHEAT_WINDOW_MANAGER
            manager.setSeparateWindowEnabled(this.openInSeparateWindow)

            if (this.openInSeparateWindow) {
                if (this.rootMainComponent) {
                    this.rootMainComponent.show = false
                } else {
                    this.$root.show = false
                }
                setTimeout(() => {
                    manager.openExternalWindow()
                }, 0)
            } else {
                manager.closeExternalWindow()
                setTimeout(() => {
                    if (this.rootMainComponent) {
                        this.rootMainComponent.show = true
                    } else {
                        this.$root.show = true
                    }
                }, 0)
            }
        },

        onSpeedChange () {
            const speedCheat = this.cheatApi.SpeedCheat
            if (speedCheat && speedCheat.setSpeed) {
                speedCheat.setSpeed(this.speed, this.fixSpeed)
            }
            if (speedCheat && speedCheat.__writeSettings) {
                speedCheat.__writeSettings(this.speed, this.fixSpeed)
            }
            this.initializeVariables()
        },

        addSpeed (amount) {
            this.speed = Math.min(Math.max(this.speed + amount, this.minSpeed), this.maxSpeed)
            this.onSpeedChange()
        },

        onGoldChange () {
            if (isNaN(this.gold) || !Number.isInteger(Number(this.gold)) || this.gold < 0) {
                return
            }

            const root = this.getRootWindow()
            const gameParty = root.$gameParty
            if (!gameParty) {
                return
            }

            const diff = this.gold - gameParty._gold

            if (diff < 0) {
                gameParty.loseGold(-diff)
            } else if (diff > 0) {
                gameParty.gainGold(diff)
            }

            this.gold = gameParty._gold
            this.initializeVariables()
        },

        gotoTitle () {
            if (this.cheatApi.SceneCheat && this.cheatApi.SceneCheat.gotoTitle) {
                this.cheatApi.SceneCheat.gotoTitle()
            }
        },

        toggleSaveScene () {
            if (this.cheatApi.SceneCheat && this.cheatApi.SceneCheat.toggleSaveScene) {
                this.cheatApi.SceneCheat.toggleSaveScene()
            }
        },

        toggleLoadScene () {
            if (this.cheatApi.SceneCheat && this.cheatApi.SceneCheat.toggleLoadScene) {
                this.cheatApi.SceneCheat.toggleLoadScene()
            }
        },

        onGameSpeedChange () {
            const gameSpeedCheat = this.cheatApi.GameSpeedCheat || GameSpeedCheat
            const options = gameSpeedCheat && gameSpeedCheat.sceneOptions ? gameSpeedCheat.sceneOptions() : { all: null, battle: null }

            let sceneOption = null
            if (this.applyAllForGameSpeed) {
                sceneOption = options.all
            } else if (this.applyBattleForGameSpeed) {
                sceneOption = options.battle
            }

            if (gameSpeedCheat && gameSpeedCheat.setGameSpeed) {
                gameSpeedCheat.setGameSpeed(this.gameSpeed, sceneOption)
            }
            if (gameSpeedCheat && gameSpeedCheat.__writeSettings) {
                gameSpeedCheat.__writeSettings(this.gameSpeed, sceneOption)
            }
            this.initializeVariables()
        },

        addGameSpeed (amount) {
            this.gameSpeed = Math.min(Math.max(this.gameSpeed + amount, this.minGameSpeed), this.maxGameSpeed)
            this.onGameSpeedChange()
        },

        setGameSpeed () {
            this.gameSpeed = 1
            this.onGameSpeedChange()
        },

        onApplyAllForGameSpeedChange () {
            if (this.applyAllForGameSpeed) {
                this.applyBattleForGameSpeed = false
            } else {
                this.applyBattleForGameSpeed = true
            }

            this.onGameSpeedChange()
        },

        onApplyBattleForGameSpeedChange () {
            if (this.applyBattleForGameSpeed) {
                this.applyAllForGameSpeed = false
            } else {
                this.applyAllForGameSpeed = true
            }

            this.onGameSpeedChange()
        }
    }
}
