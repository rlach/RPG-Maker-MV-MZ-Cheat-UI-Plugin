import { gameObjectReference } from '../js/Tools.js';
export default {
    name: 'HealthSettingTab',

    template: `
<div>
    <v-data-table return-object
        v-if="tableHeaders" density="compact"
        hide-default-footer
        :headers="uiTableHeaders(tableHeaders)"
        :items="editingItems">
        <template
            v-slot:item.name="{ item }">
            <span class="text-caption">{{item.name}}</span>
        </template>
        <template
            v-slot:item.hp="{ item }"><div class="cheat-health-cell">
            <v-text-field type="number" step="1"

                class="d-inline-flex x-small-field caption"
                style="width: 50px;"
                hide-details variant="outlined"
                v-model="item.hp.hp" density="compact"
                @keydown.stop
                @update:model-value="onDataChange"
                @focus="$event.target.select()">
            </v-text-field>
            <span class="text-caption">/ {{item.hp.mhp}}</span></div>
        </template>
        <template
            v-slot:item.mp="{ item }"><div class="cheat-health-cell">
            <v-text-field type="number" step="1"

                class="d-inline-flex x-small-field caption"
                style="width: 50px;"
                hide-details variant="outlined"
                v-model="item.mp.mp" density="compact"
                @keydown.stop
                @update:model-value="onDataChange"
                @focus="$event.target.select()">
            </v-text-field>
            <span class="text-caption">/ {{item.mp.mmp}}</span></div>
        </template>
    </v-data-table>
</div>
    `,

    data() {
        return {
            tableHeaders: [
                {
                    text: 'Name',
                    value: 'name',
                },
                {
                    text: 'Hp',
                    value: 'hp',
                },
                {
                    text: 'Mp',
                    value: 'mp',
                },
            ],

            editingItems: [],
        };
    },

    props: {
        items: {
            type: Array,
            default: [],
        },
    },

    watch: {
        items: {
            immediate: true,
            handler() {
                this.editingItems = this.items.map((member) => {
                    return {
                        _member: gameObjectReference(member),
                        name: member.name(),
                        hp: {
                            hp: member.hp,
                            mhp: member.mhp,
                        },
                        mp: {
                            mp: member.mp,
                            mmp: member.mmp,
                        },
                    };
                });
            },
        },
    },

    methods: {
        onDataChange() {
            this.$emit('change', this.editingItems);
        },
    },
};
