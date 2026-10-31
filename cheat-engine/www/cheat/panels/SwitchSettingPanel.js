import { ConfirmDialog } from '../js/DialogHelper.js';
import { TRANSLATOR } from '../js/TranslateHelper.js';
import { TRANSLATE_SETTINGS } from '../js/TranslateHelper.js';
import { getRowsPerPage, setRowsPerPage } from '../js/TableSettings.js';
import { tableSessionMixin } from '../js/TableSessionState.js';

export default {
    name: 'SwitchSettingPanel',
    mixins: [tableSessionMixin('switches')],

    template: `
<v-card flat class="cheat-refresh-panel ma-0 pa-0 fill-height panel-with-sticky-table">
    <v-card-text  class="cheat-panel-header pt-1 pb-1">
        <v-text-field
            label="Search..." variant="solo" single-line
            bg-color="grey-darken-3"
            v-model="search" density="compact"
            hide-details
            @keydown.stop
            @focus="$event.target.select()">
        </v-text-field>
        <div class="d-flex align-center mt-2">
            <v-checkbox
                v-model="excludeNameless" density="compact"
                hide-details
                label="Hide Nameless Items">
            </v-checkbox>
            <v-spacer></v-spacer>
            <cheat-tooltip location="bottom">
                <span>{{ allSwitchOn ? 'Turn off all filtered switches' : 'Turn on all filtered switches' }}</span>
                <template v-slot:activator="{ props: activatorProps }">
                    <v-btn variant="text"
                        color="teal"
                        v-bind="activatorProps" icon size="small" class="cheat-toggle-all" aria-label="Toggle all filtered switches"
                        @click="toggleAllSwitches">
                        <v-icon :icon="allSwitchIcon"></v-icon>
                    </v-btn>
                </template>
            </cheat-tooltip>
        </div>
    </v-card-text>
    <v-data-table return-object
        v-if="tableReady && tableHeaders"
        class="table-with-sticky-footer"
        :headers="uiTableHeaders(tableHeaders)"
        :items="filteredTableItems"
        :search="search"
        :custom-filter="(value, query, item) => tableItemFilter(value, query, item.raw)"
        v-model:items-per-page="rowsPerPage"
        v-model:page="page"
        :sort-by="uiTableSort(tableSession.sortBy, tableSession.sortDesc)" @update:sort-by="updateUiTableSort($event, 'tableSession.sortBy', 'tableSession.sortDesc')"
        >
        <template
            v-slot:item.value="{ item }">
            <v-switch
                v-model="item.value" density="compact"
                hide-details
                @click.self.stop
                @update:model-value="onItemChange(item)">
            </v-switch>
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

            switchNames: [],

            tableHeaders: [
                {
                    text: 'Id',
                    value: 'id',
                },
                {
                    text: 'Name',
                    value: 'name',
                },
                {
                    text: 'Value',
                    value: 'value',
                },
            ],
            tableItems: [],
        };
    },

    created() {
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
                if (
                    item.id === 0 ||
                    (this.excludeNameless && !item.name) ||
                    !this.tableItemFilter(item.name, this.search, item)
                ) {
                    return false;
                }

                return true;
            });
        },

        allSwitchOn() {
            const hasTurnOff = this.filteredTableItems.find((item) => item.value === false);
            return !hasTurnOff;
        },

        allSwitchIcon() {
            return this.allSwitchOn ? 'mdi-toggle-switch-off' : 'mdi-toggle-switch';
        },
    },

    methods: {
        async initializeVariables() {
            this.switchNames = await this.getSwitchNames();

            this.tableItems = this.switchNames.map((switchName, idx) => {
                return {
                    id: idx,
                    name: switchName,
                    value: $gameSwitches.value(idx),
                };
            });
            this.tableReady = true;
        },

        async getSwitchNames() {
            const rawSwitchNames = $dataSystem.switches.slice();

            if (TRANSLATE_SETTINGS.isSwitchTranslateEnabled()) {
                return await TRANSLATOR.translateBulk(rawSwitchNames);
            }

            return rawSwitchNames;
        },

        onItemChange(item) {
            // modify value
            $gameSwitches.setValue(item.id, item.value);

            // refresh
            item.value = $gameSwitches.value(item.id);
        },

        tableItemFilter(value, search, item) {
            if (search === null || search.trim() === '') {
                return true;
            }

            return item.name.toLowerCase().includes(search.toLowerCase());
        },

        toggleAllSwitches() {
            const self = this;
            ConfirmDialog.show({
                width: 450,
                message:
                    (this.allSwitchOn
                        ? 'Turn off all filtered switches?'
                        : 'Turn on all filtered switches?') +
                    '\n(CAUTION: Potential to give fatal errors to save data)',
                actions: [
                    {
                        icon: 'mdi-close',
                        label: 'cancel',
                        color: 'white',
                        action: ConfirmDialog.close,
                    },
                    {
                        icon: this.allSwitchIcon,
                        color: 'green',
                        label: this.allSwitchOn ? 'Turn Off' : 'Turn On',
                        async action() {
                            const value = !self.allSwitchOn;
                            self.filteredTableItems.forEach((item) => {
                                $gameSwitches.setValue(item.id, value);
                            });
                            self.initializeVariables();
                            ConfirmDialog.close();
                        },
                    },
                ],
            });
        },
    },
};
