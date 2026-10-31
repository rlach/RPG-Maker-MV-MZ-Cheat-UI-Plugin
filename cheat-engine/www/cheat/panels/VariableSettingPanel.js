import { TRANSLATE_SETTINGS, TRANSLATOR } from '../js/TranslateHelper.js';
import { getRowsPerPage, setRowsPerPage } from '../js/TableSettings.js';
import { ensureTranslationRuntime } from '../js/translation-runtime/TranslationRuntime.js';
import { tableSessionMixin } from '../js/TableSessionState.js';
import { getPinnedVariableIds, setVariablePinned } from '../js/VariablePins.js';

export default {
    name: 'VariableSettingPanel',
    mixins: [tableSessionMixin('variables')],

    template: `
<v-card flat class="cheat-refresh-panel ma-0 pa-0 fill-height panel-with-sticky-table">
    <v-card-text  class="cheat-panel-header pt-1 pb-1">
        <div class="d-flex align-center cheat-variable-filters">
            <v-text-field
                label="Search..." variant="solo" single-line
                bg-color="grey-darken-3"
                v-model="search" density="compact"
                hide-details
                style="flex: 1 1 auto;"
                @keydown.stop
                @focus="$event.target.select()">
            </v-text-field>
            <v-switch
                v-model="onlySafeForTranslate" density="compact"
                hide-details
                class="mt-0 pt-0 shrink"
                label="Only translated">
            </v-switch>
        </div>
        <div class="d-flex align-center mt-2">
            <v-checkbox
                v-model="excludeNameless" density="compact"
                hide-details
                label="Hide Nameless Items">
            </v-checkbox>
            <v-spacer></v-spacer>
            <v-checkbox
                v-model="onlyPinned" density="compact"
                hide-details
                label="Only Pinned">
            </v-checkbox>
        </div>
    </v-card-text>
    <v-data-table return-object
        v-if="tableReady && tableHeaders"
        class="table-with-sticky-footer"
        :headers="uiTableHeaders(tableHeaders)"
        :items="filteredTableItems"
        v-model:items-per-page="rowsPerPage"
        v-model:page="page"
        :sort-by="uiTableSort(tableSession.sortBy, tableSession.sortDesc)" @update:sort-by="updateUiTableSort($event, 'tableSession.sortBy', 'tableSession.sortDesc')"
        >
        <template v-slot:item.name="{ item }">
            <div style="width: 100%; min-width: 160px;">{{ item.name }}</div>
        </template>
        <template
            v-slot:item.value="{ item }">
            <v-text-field

                class="d-flex"

                style="width: 100%; min-width: 160px;"
                hide-details variant="outlined"
                v-model="item.value" density="compact"
                @keydown.stop="onValueKeyDown(item, $event)"
                @update:model-value="onItemChange(item)"
                @focus="$event.target.select()">
            </v-text-field>
        </template>
        <template v-slot:item.actions="{ item }">
            <div class="d-flex align-center justify-center">
                <cheat-tooltip location="bottom">
                    <span>{{ item.pinned ? 'Unpin variable' : 'Pin variable' }}</span>
                    <template v-slot:activator="{ props: activatorProps }">
                        <v-btn variant="text" icon size="x-small"
                            :color="item.pinned ? 'cyan' : 'grey'"
                            v-bind="activatorProps"  @click="togglePin(item)">
                            <v-icon size="small">{{ item.pinned ? 'mdi-pin' : 'mdi-pin-outline' }}</v-icon>
                        </v-btn>
                    </template>
                </cheat-tooltip>
                <cheat-tooltip location="bottom">
                    <span>Mark as safe for translate</span>
                    <template v-slot:activator="{ props: activatorProps }">
                        <v-btn variant="text"
                            icon size="x-small"
                            :color="item.safeForTranslate ? 'amber darken-2' : 'grey'"
                            v-bind="activatorProps"

                            @click="toggleSafeForTranslate(item)">
                            <v-icon size="small">{{ item.safeForTranslate ? 'mdi-star' : 'mdi-star-outline' }}</v-icon>
                        </v-btn>
                    </template>
                </cheat-tooltip>
            </div>
        </template>
    </v-data-table>

    <cheat-tooltip location="bottom">
        <span>Reload from game data</span>
        <template v-slot:activator="{ props: activatorProps }">
            <v-btn class="cheat-refresh" variant="elevated"

                color="pink" aria-label="Reload from game data" size="small" icon
                v-bind="activatorProps"

                @click="initializeVariables">
                <v-icon>mdi-refresh</v-icon>
            </v-btn>
        </template>
    </cheat-tooltip>
</v-card>
    `,

    data() {
        return {
            rowsPerPage: getRowsPerPage(),

            variableNames: [],

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
                    width: 112,
                    align: 'center',
                },
            ],
            tableItems: [],
        };
    },

    created() {
        this._translationRuntime = ensureTranslationRuntime();
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
                if (this.onlyPinned && !item.pinned) return false;
                const matchesNameless = !this.excludeNameless || !!item.name;
                const matchesSafeFilter = !this.onlySafeForTranslate || !!item.safeForTranslate;
                const search = (this.search || '').trim().toLowerCase();
                if (!search) {
                    return matchesNameless && matchesSafeFilter;
                }

                return matchesNameless && matchesSafeFilter && this.matchesSearch(item, search);
            });
        },
    },

    methods: {
        async initializeVariables() {
            this.variableNames = await this.getVariableNames();
            const pinnedIds = new Set(getPinnedVariableIds());

            this.tableItems = this.variableNames.map((varName, idx) => {
                return {
                    id: idx,
                    name: this.getDisplayVariableName(varName),
                    value: this.getRawVariableValue(idx),
                    safeForTranslate: this.isSafeForTranslate(idx),
                    pinned: pinnedIds.has(idx),
                };
            });
            this.tableReady = true;
        },

        togglePin(item) {
            const pinnedIds = setVariablePinned(item.id, !item.pinned);
            item.pinned = pinnedIds.includes(item.id);
        },

        async getVariableNames() {
            const rawVariableNames = $dataSystem.variables.slice();

            if (TRANSLATE_SETTINGS.isVariableTranslateEnabled()) {
                return await TRANSLATOR.translateBulk(rawVariableNames);
            }

            return rawVariableNames;
        },

        getDisplayVariableName(variableName) {
            return typeof variableName === 'string' ? variableName.trim() : variableName;
        },

        onValueKeyDown(item, event) {
            if (typeof item.value !== 'number' || !Number.isFinite(item.value)) return;
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
            event.preventDefault();
            item.value += event.key === 'ArrowUp' ? 1 : -1;
            this.onItemChange(item);
        },

        onItemChange(item) {
            // modify value
            let value = item.value;
            // Convert to number if it's a numeric string
            if (value !== '' && value !== null && !Number.isNaN(Number(value))) {
                value = Number(value);
            }
            $gameVariables.setValue(item.id, value);
            // refresh
            item.value = this.getRawVariableValue(item.id);
        },

        getRawVariableValue(variableId) {
            if (this._translationRuntime) {
                return this._translationRuntime.getRawGameVariableValue(variableId);
            }

            if (!window.$gameVariables || !Array.isArray($gameVariables._data)) {
                return 0;
            }

            return $gameVariables._data[variableId] ?? 0;
        },

        isSafeForTranslate(variableId) {
            return !!this._translationRuntime?.isVariableSafeForTranslation?.(variableId);
        },

        toggleSafeForTranslate(item) {
            if (!item || !this._translationRuntime) {
                return;
            }

            const nextValue = !item.safeForTranslate;
            this._translationRuntime.setVariableSafeForTranslation(item.id, nextValue);
            item.safeForTranslate = nextValue;
        },

        matchesSearch(item, search) {
            const safeSearch = String(search || '')
                .trim()
                .toLowerCase();
            if (!safeSearch) {
                return true;
            }

            return [item.id, item.name, item.value]
                .map((value) => String(value ?? '').toLowerCase())
                .some((value) => value.includes(safeSearch));
        },
    },
};
