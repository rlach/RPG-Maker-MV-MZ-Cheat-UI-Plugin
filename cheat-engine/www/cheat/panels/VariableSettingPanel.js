import { TRANSLATE_SETTINGS, TRANSLATOR } from '../js/TranslateHelper.js';
import { getRowsPerPage, setRowsPerPage } from '../js/TableSettings.js';
import { ensureTranslationRuntime } from './translate-on-the-fly/TranslationRuntime.js';

export default {
    name: 'VariableSettingPanel',

    template: `
<v-card flat class="ma-0 pa-0 fill-height panel-with-sticky-table">
    <v-card-text class="pt-1 pb-1">
        <div class="d-flex align-center" style="gap: 12px;">
            <v-text-field
                label="Search..."
                solo
                background-color="grey darken-3"
                v-model="search"
                dense
                hide-details
                style="flex: 1 1 auto;"
                @keydown.self.stop
                @focus="$event.target.select()">
            </v-text-field>
            <v-switch
                v-model="onlySafeForTranslate"
                dense
                hide-details
                inset
                class="mt-0 pt-0 shrink"
                label="Only translated">
            </v-switch>
        </div>
        <div class="d-flex align-center mt-2">
            <v-checkbox
                v-model="excludeNameless"
                dense
                hide-details
                label="Hide Nameless Items">
            </v-checkbox>
        </div>
    </v-card-text>
    <v-data-table
        v-if="tableHeaders"
        class="table-with-sticky-footer"
        :headers="tableHeaders"
        :items="filteredTableItems"
        :items-per-page.sync="rowsPerPage">
        <template v-slot:item.name="{ item }">
            <div style="width: 100%;">{{ item.name }}</div>
        </template>
        <template
            v-slot:item.value="{ item }">
            <v-text-field
                background-color="grey darken-3"
                class="d-flex"
                height="10"
                style="width: 100%;"
                hide-details
                solo
                v-model="item.value"
                label="Value"
                dense
                @keydown.self.stop
                @change="onItemChange(item)"
                @focus="$event.target.select()">
            </v-text-field>
        </template>
        <template v-slot:item.actions="{ item }">
            <div class="d-flex align-center justify-center">
                <v-tooltip bottom>
                    <span>Mark as safe for translate</span>
                    <template v-slot:activator="{ on, attrs }">
                        <v-btn
                            icon
                            x-small
                            :color="item.safeForTranslate ? 'amber darken-2' : 'grey'"
                            v-bind="attrs"
                            v-on="on"
                            @click="toggleSafeForTranslate(item)">
                            <v-icon small>{{ item.safeForTranslate ? 'mdi-star' : 'mdi-star-outline' }}</v-icon>
                        </v-btn>
                    </template>
                </v-tooltip>
            </div>
        </template>
    </v-data-table>
    
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

    data() {
        return {
            search: '',
            excludeNameless: false,
            onlySafeForTranslate: false,

            rowsPerPage: getRowsPerPage(),

            variableNames: [],
            translationRuntime: null,

            tableHeaders: [
                {
                    text: 'Id',
                    value: 'id',
                    width: 72,
                },
                {
                    text: 'Name',
                    value: 'name',
                    width: '50%',
                },
                {
                    text: 'Value',
                    value: 'value',
                    width: '50%',
                },
                {
                    text: 'Actions',
                    value: 'actions',
                    sortable: false,
                    width: 92,
                    align: 'center',
                },
            ],
            tableItems: [],
        };
    },

    created() {
        this.translationRuntime = ensureTranslationRuntime();
        this.initializeVariables();
    },

    watch: {
        rowsPerPage(val) {
            const parsed = Number(val);
            if (!Number.isFinite(parsed) || parsed <= 0) {
                return;
            }

            if (parsed !== val) {
                this.rowsPerPage = parsed;
                return;
            }

            setRowsPerPage(parsed);
        },
    },

    computed: {
        filteredTableItems() {
            return this.tableItems.filter((item) => {
                const matchesNameless = !this.excludeNameless || !!item.name;
                const matchesSafeFilter =
                    !this.onlySafeForTranslate || !!item.safeForTranslate;
                const search = (this.search || '').trim().toLowerCase();
                if (!search) {
                    return matchesNameless && matchesSafeFilter;
                }

                return (
                    matchesNameless &&
                    matchesSafeFilter &&
                    this.matchesSearch(item, search)
                );
            });
        },
    },

    methods: {
        async initializeVariables() {
            this.variableNames = await this.getVariableNames();

            this.tableItems = this.variableNames.map((varName, idx) => {
                return {
                    id: idx,
                    name: varName,
                    value: this.getRawVariableValue(idx),
                    safeForTranslate: this.isSafeForTranslate(idx),
                };
            });
        },

        async getVariableNames() {
            const rawVariableNames = $dataSystem.variables.slice();

            if (TRANSLATE_SETTINGS.isVariableTranslateEnabled()) {
                return await TRANSLATOR.translateBulk(rawVariableNames);
            }

            return rawVariableNames;
        },

        onItemChange(item) {
            // modify value
            let value = item.value;
            // Convert to number if it's a numeric string
            if (
                value !== '' &&
                value !== null &&
                !Number.isNaN(Number(value))
            ) {
                value = Number(value);
            }
            $gameVariables.setValue(item.id, value);
            // refresh
            item.value = this.getRawVariableValue(item.id);
        },

        getRawVariableValue(variableId) {
            if (this.translationRuntime) {
                return this.translationRuntime.getRawGameVariableValue(variableId);
            }

            if (!window.$gameVariables || !Array.isArray($gameVariables._data)) {
                return 0;
            }

            return $gameVariables._data[variableId] ?? 0;
        },

        isSafeForTranslate(variableId) {
            return !!this.translationRuntime?.isVariableSafeForTranslation?.(variableId);
        },

        toggleSafeForTranslate(item) {
            if (!item || !this.translationRuntime) {
                return;
            }

            const nextValue = !item.safeForTranslate;
            this.translationRuntime.setVariableSafeForTranslation(item.id, nextValue);
            item.safeForTranslate = nextValue;
        },

        matchesSearch(item, search) {
            const safeSearch = String(search || '').trim().toLowerCase();
            if (!safeSearch) {
                return true;
            }

            return [item.id, item.name, item.value]
                .map((value) => String(value ?? '').toLowerCase())
                .some((value) => value.includes(safeSearch));
        },
    },
};
