// customize mv functions
import {MessageCheat} from '../js/CheatHelper.js'
import { KeyValueStorage } from '../js/KeyValueStorage.js'

export function customizeRPGMakerFunctions (mainComponent) {
    if (window.__CHEAT_EXTERNAL_WINDOW__) {
        return
    }

    // Load custom actor names from saved overrides
    loadActorNameOverrides()

    if (Utils.RPGMAKER_NAME === 'MV') {
        // WARN: directly changing engine code can be dangerous
        // remove preventDefault
        TouchInput._onWheel = function () {
            this._events.wheelX += event.deltaX
            this._events.wheelY += event.deltaY
        }

        // ignore click event when cheat modal shown and click inside cheat modal
        const TouchInput_onMouseDown = TouchInput._onMouseDown
        TouchInput._onMouseDown = function(event) {
            if (mainComponent.show) {
                const bcr = document.querySelector('#cheat-modal').getBoundingClientRect();
                if (bcr.left <= event.clientX && event.clientX <= bcr.left + bcr.width
                    && bcr.top <= event.clientY && event.clientY <= bcr.top + bcr.height) {
                    return
                }
            }

            TouchInput_onMouseDown.call(this, event)
        }
    } else {
        // MZ Settings
        // WARN: directly changing engine code can be dangerous
        // remove preventDefault
        TouchInput._onWheel = function () {
            this._newState.wheelX += event.deltaX
            this._newState.wheelY += event.deltaY
        }

        // ignore click event when cheat modal shown and click inside cheat modal
        const TouchInput_onMouseDown = TouchInput._onMouseDown
        TouchInput._onMouseDown = function(event) {
            if (mainComponent.show) {
                const bcr = document.querySelector('#cheat-modal').getBoundingClientRect();
                if (bcr.left <= event.clientX && event.clientX <= bcr.left + bcr.width
                    && bcr.top <= event.clientY && event.clientY <= bcr.top + bcr.height) {
                    return
                }
            }

            TouchInput_onMouseDown.call(this, event)
        }
    }

    MessageCheat.initialize()
}

function loadActorNameOverrides() {
    try {
        const storage = new KeyValueStorage('./www/cheat-settings/actor-names.json');
        const json = storage.getItem('data');
        if (!json) {
            return; // No overrides saved yet
        }
        
        const entries = JSON.parse(json);
        const overrides = new Map(Array.isArray(entries) ? entries : []);
        
        if (overrides.size === 0) {
            return;
        }
        
        // Apply overrides to $dataActors
        for (const [key, name] of overrides.entries()) {
            const match = key.match(/^actor_(\d+)$/);
            if (match) {
                const actorId = parseInt(match[1], 10);
                if (typeof $dataActors !== 'undefined' && $dataActors[actorId]) {
                    $dataActors[actorId].name = name;
                    console.log(`[TranslateNamesPanel] Loaded actor name override: ${actorId} = "${name}"`);
                }
            }
        }
        
        // Apply overrides to $gameActors if it exists
        if (typeof $gameActors !== 'undefined') {
            for (const [key, name] of overrides.entries()) {
                const match = key.match(/^actor_(\d+)$/);
                if (match) {
                    const actorId = parseInt(match[1], 10);
                    const gameActor = $gameActors.actor(actorId);
                    if (gameActor) {
                        gameActor._name = name;
                    }
                }
            }
        }
    } catch (err) {
        console.warn('[TranslateNamesPanel] Failed to load actor name overrides', err);
    }
}
