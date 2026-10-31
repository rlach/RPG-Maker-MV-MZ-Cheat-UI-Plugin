import { getRowsPerPage, setRowsPerPage } from '../js/TableSettings.js';
import { gameObjectReference } from '../js/Tools.js';
import { tableSessionMixin } from '../js/TableSessionState.js';

export default {
    name: 'ItemTableTab',
    mixins: [tableSessionMixin()],

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
                label="Hide Nameless Items"
                @update:model-value="onTableFilterChange">
            </v-checkbox>
            <v-spacer></v-spacer>
            <v-checkbox
                v-model="onlyOwnedItems" density="compact"
                hide-details
                label="Only Owned Items"
                @update:model-value="onTableFilterChange">
            </v-checkbox>
        </div>
    </v-card-text>
    <v-data-table return-object
        v-if="tableReady && tableHeaders"
        class="cheat-inventory-table table-with-sticky-footer"
        :headers="uiTableHeaders(tableHeaders)"
        :items="filteredTableItems"
        :search="search"
        :custom-filter="(value, query, item) => tableItemFilter(value, query, item.raw)"
        v-model:items-per-page="rowsPerPage"
        v-model:page="page"
        :sort-by="uiTableSort(tableSession.sortBy, tableSession.sortDesc)" @update:sort-by="updateUiTableSort($event, 'tableSession.sortBy', 'tableSession.sortDesc')"
        >
        <template
            v-slot:item.amount="{ item }">
            <v-text-field type="number" step="1"

                class="d-inline-flex"

                style="width: 100%; min-width: 70px;"
                hide-details variant="outlined"
                v-model="item.amount" density="compact"
                @keydown.stop
                @update:model-value="onItemChange(item)"
                @focus="$event.target.select()">
            </v-text-field>
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
            tableHeaders: [],
            tableItems: [],
        };
    },

    props: {
        tableStateKey: { type: String, required: true },
        items: [],
        headers: {
            type: Array,
        },
        asTableData: {
            type: Function,
        },
        searchableAttrs: {
            type: Array,
            default: [],
        },
    },

    created() {},

    watch: {
        items: {
            immediate: true,
            handler() {
                this.initializeVariables();
            },
        },

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
                if (this.excludeNameless && !item.name) {
                    return false;
                }

                if (this.onlyOwnedItems && item.amount === 0) {
                    return false;
                }

                return true;
            });
        },
    },

    methods: {
        initializeVariables() {
            this.tableHeaders = this.headers.map((header) => ({
                ...header,
                ...(header.value === 'id'
                    ? { width: 40 }
                    : header.value === 'name'
                      ? { width: '22%' }
                      : {}),
            }));
            this.tableHeaders.push({
                text: 'Amount',
                value: 'amount',
                width: 100,
            });

            this.tableItems = this.items
                .filter((item) => !!item)
                .map((item) => {
                    item = gameObjectReference(item);
                    const tableItem = this.asTableData(item);
                    tableItem._item = item;
                    tableItem.amount = $gameParty.numItems(item);

                    return tableItem;
                });
            this.tableReady = true;
        },

        onItemChange(item) {
            // modify amount
            const diff = item.amount - $gameParty.numItems(item._item);
            $gameParty.gainItem(item._item, diff);

            // refresh
            item.amount = $gameParty.numItems(item._item);
        },

        onTableFilterChange() {},

        tableItemFilter(value, search, item) {
            if (search === null || search.trim() === '') {
                return true;
            }

            search = search.toLowerCase();
            for (const attr of this.searchableAttrs) {
                if (item[attr].toLowerCase().includes(search)) {
                    return true;
                }
            }

            return false;
        },
    },
};
