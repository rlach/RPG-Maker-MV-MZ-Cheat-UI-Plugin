import { GeneralCheat } from '../js/CheatHelper.js';
import { gameObjectReference } from '../js/Tools.js';

export default {
    name: 'StatsSettingPanel',

    template: `
<v-card flat class="cheat-refresh-panel ma-0 pa-0">
    <v-tabs
        v-model="selectedTab"
        bg-color="grey-darken-3"
        show-arrows>
        <v-tab
            v-for="actor in actors"
            :value="actor.id"
            :key="actor.id">
            {{actor.name}}
        </v-tab>
    </v-tabs>
    <v-window
        v-model="selectedTab">
        <v-window-item
            v-for="actor in actors"
            :value="actor.id"
            :key="actor.id">
            <v-card
                flat
                class="ma-0 cheat-stats-card">
                <v-card-actions
                    class="pa-0">
                    <v-checkbox
                        v-model="actor.godMode"
                        label="God Mode"
                        @update:model-value="onGodModeChange(actor)">
                    </v-checkbox>
                    <v-spacer></v-spacer>
                    <cheat-tooltip location="bottom">
                        <span>Reload from game data</span>
                        <template v-slot:activator="{ props: activatorProps }">
                            <v-btn class="cheat-refresh" variant="elevated" aria-label="Reload from game data"
                                color="pink" size="small" icon
                                v-bind="activatorProps"

                                @click="initializeVariables">
                                <v-icon>mdi-refresh</v-icon>
                            </v-btn>
                        </template>
                    </cheat-tooltip>
                </v-card-actions>
                <v-card-subtitle class="pa-0">Level / EXP</v-card-subtitle>
                <v-row class="mt-0">
                    <v-col>
                        <v-text-field type="number" step="1"
                            label="Lv"
                            v-model="actor.level" variant="outlined" density="compact"
                            hide-details
                            @keydown.stop
                            @update:model-value="onLevelChange(actor)"
                            @focus="$event.target.select()"></v-text-field>
                    </v-col>
                    <v-col>
                        <v-text-field type="number" step="1"
                            label="EXP"
                            v-model="actor.exp" variant="outlined" density="compact"
                            hide-details
                            @keydown.stop
                            @update:model-value="onExpChange(actor)"
                            @focus="$event.target.select()"></v-text-field>
                    </v-col>
                </v-row>

                <v-card-subtitle class="pa-0 mt-4">Stats</v-card-subtitle>
                <v-row class="mt-0">
                    <v-col
                        v-for="(_, paramIdx) in actor.param.length"
                        :key="paramIdx"
                        cols="6">
                        <v-text-field type="number" step="1"
                            :label="paramNames[paramIdx]"
                            v-model="actor.param[paramIdx]" variant="outlined" density="compact"
                            hide-details
                            @keydown.stop
                            @update:model-value="onParamChange(actor, paramIdx)"
                            @focus="$event.target.select()"></v-text-field>
                    </v-col>
                </v-row>
            </v-card>
        </v-window-item>
    </v-window>
</v-card>
    `,

    data() {
        return {
            selectedTab: null,
            paramNames: [], // name of stats (Max HP, ATK, ...)
            actors: [],
        };
    },

    created() {
        this.initializeVariables();
    },

    methods: {
        extractActorData(actor) {
            // get actor param
            const paramSize = actor._paramPlus.length;
            const param = new Array(paramSize);

            for (let paramId = 0; paramId < paramSize; ++paramId) {
                param[paramId] = actor.param(paramId);
            }

            return {
                _actor: gameObjectReference(actor),
                id: actor._actorId,
                name: actor._name,
                godMode: GeneralCheat.isGodMode(actor),
                level: actor.level,
                exp: actor.currentExp(), // actor._exp contains exp data for each class (_exp[classId] = exp)
                param: param,
            };
        },

        initializeVariables() {
            this.paramNames = $dataSystem.terms.params;
            this.actors = $gameParty.members().map((actor) => this.extractActorData(actor));
        },

        onLevelChange(item) {
            item._actor.changeLevel(Number(item.level), false);
            this.initializeVariables();
        },

        onExpChange(item) {
            item._actor.changeExp(Number(item.exp), false);
            this.initializeVariables();
        },

        onParamChange(item, paramIndex) {
            const diff = item.param[paramIndex] - item._actor.param(paramIndex);
            item._actor.addParam(paramIndex, diff);
            this.initializeVariables();
        },

        onGodModeChange(item) {
            GeneralCheat.toggleGodMode(item._actor);
            this.initializeVariables();
        },
    },
};
