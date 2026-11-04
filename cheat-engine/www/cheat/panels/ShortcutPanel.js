import KeyInputField from '../components/KeyInputField.js';
import { GLOBAL_SHORTCUT } from '../js/GlobalShortcut.js';
import { Key } from '../js/KeyCodes.js';
import { Alert } from '../js/AlertHelper.js';
import { getRowsPerPage, setRowsPerPage } from '../js/TableSettings.js';

export default {
    name: 'ShortcutPanel',

    components: {
        KeyInputField,
    },

    template: `
<v-card flat class="ma-0 pa-0 fill-height panel-with-sticky-table">
    <v-alert
        v-if="showUnavailable"
        type="warning" density="compact"
        border="left"
        colored-border
        class="ma-0 mb-2"
    >
        Unavailable in external window mode (main shortcuts not reachable)
    </v-alert>
    <template v-if="!showUnavailable">
    <div class="d-flex flex-wrap" style="gap: 12px; margin-bottom: 12px;">
        <div style="flex: 2 1 260px; min-width: 0;">
            <v-text-field
                label="Search..." variant="solo" single-line
                bg-color="grey-darken-3"
                v-model="search" density="compact"
                hide-details
                @keydown.stop
                @update:model-value="onSearchChange"
                @focus="$event.target.select()">
            </v-text-field>
        </div>
        <div style="flex: 1 1 180px; min-width: 0;">
            <key-input-field
                v-model:shortcut="shortcutSearch"
                label="Shortcut"
                solo
                dense
                background-color="grey-darken-3"
                hide-details
                combining-key-alone
                @change="onShortcutSearchChange">
            </key-input-field>
        </div>
    </div>
    <v-card-text
        class="pa-0 d-flex justify-space-between align-center">
        <v-checkbox
            class="d-inline-flex"
            v-model="hideDesc"
            label="Hide Description Field">
        </v-checkbox>
        <cheat-tooltip location="bottom">
            <span>Restore to default settings</span>
            <template v-slot:activator="{ props: activatorProps }">
                <v-btn variant="elevated" aria-label="Restore default shortcuts"
                    color="green"
                    v-bind="activatorProps"
                     size="small" icon
                    @click="restoreToDefault">
                    <v-icon size="small">mdi-restore</v-icon>
                </v-btn>
            </template>
        </cheat-tooltip>
    </v-card-text>
    <v-data-table return-object
        class="mt-2 table-with-sticky-footer"
        density="compact"
        @update:expanded="tableExpanded = $event.slice(-1)"
        :headers="uiTableHeaders(filteredHeaders)"
        v-model:expanded="tableExpanded"
        :items="filteredShortcuts"
        :search="search"
        :custom-filter="(value, query, item) => tableItemFilter(value, query, item.raw)"
        v-model:items-per-page="rowsPerPage">
        <template
            v-slot:item.shortcut="{ item }">
            <key-input-field
                style="width: 170px;"
                v-model:shortcut="item.shortcut"
                :deletable="!item.necessary"
                label="" aria-label="Shortcut"
                outlined
                dense
                :combining-key-alone="item.combiningKeyAlone"
                hide-details
                @change="onShortcutChange($event, item)">
            </key-input-field>
        </template>
        <template
            v-slot:item.param="{ item, index }">
            <v-btn
                v-if="Object.keys(item.paramDesc).length > 0"
                color="blue-grey" size="x-small"
                icon variant="text"
                @click="changeExpanded(item)">
                <v-icon size="small">mdi-cog</v-icon>
            </v-btn>
        </template>
        <template v-slot:expanded-row="{ columns, item }">
            <tr><td :colspan="columns.length" class="ma-0 pa-0">
                <v-card
                    flat
                    class="ma-0 py-2 px-0"
                    v-if="Object.keys(item.paramDesc).length > 0">
                    <v-card-subtitle
                        class="py-0 mb-1">
                        Parameters
                    </v-card-subtitle>
                    <v-card-text
                        class="py-0 my-0 mb-1"
                        v-for="paramKey in Object.keys(item.paramDesc)"
                        :key="paramKey">
                        <v-row
                            class="ma-0 pa-0">
                            <v-col
                                class="pa-0"
                                cols="12"
                                md="3">
                                <v-text-field
                                    v-model="item.param[paramKey].value" variant="outlined" density="compact"
                                    hide-details
                                    @keydown.stop
                                    @update:model-value="onParameterChange($event, item, paramKey)"
                                    :label="item.paramDesc[paramKey].name"
                                    @focus="$event.target.select()">
                                </v-text-field>
                            </v-col>
                            <v-col
                                class="pa-0 d-inline-flex align-center"
                                cols="12"
                                md="9">
                                <span class="ml-3">: {{item.paramDesc[paramKey].desc}}</span>
                            </v-col>
                        </v-row>
                    </v-card-text>
                </v-card>
            </td></tr>
        </template>
    </v-data-table>
    </template>
</v-card>
    `,

    data() {
        return {
            isExternalWindow: !!window.__CHEAT_EXTERNAL_WINDOW__,
            shortcutApi: null,
            showUnavailable: false,
            shortcuts: [],

            tableExpanded: [],

            hideDesc: true,
            search: '',
            shortcutSearch: Key.createEmpty(),

            rowsPerPage: getRowsPerPage(),

            tableHeaders: [
                {
                    text: 'Name',
                    value: 'name',
                },
                {
                    text: 'Desc',
                    value: 'desc',
                },
                {
                    text: 'Shortcut',
                    value: 'shortcut',
                },
                {
                    text: 'Param',
                    value: 'param',
                },
            ],
        };
    },

    created() {
        if (
            this.isExternalWindow &&
            window.opener &&
            !window.opener.closed &&
            window.opener.GLOBAL_SHORTCUT
        ) {
            this.shortcutApi = window.opener.GLOBAL_SHORTCUT;
        } else {
            this.shortcutApi = GLOBAL_SHORTCUT;
        }

        if (!this.shortcutApi || (this.isExternalWindow && this.shortcutApi === GLOBAL_SHORTCUT)) {
            this.showUnavailable = true;
            return;
        }

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
        filteredHeaders() {
            return this.tableHeaders.filter((header) => !this.hideDesc || header.value !== 'desc');
        },

        filteredShortcuts() {
            return this.shortcuts.filter((item) => {
                return this.shortcutSearch.isEmpty() || item.shortcut.contains(this.shortcutSearch);
            });
        },
    },

    methods: {
        restoreToDefault() {
            this.shortcutApi.restoreDefaultSettings();
            this.initializeVariables();
        },

        onSearchChange(search) {
            this.shortcutSearch = Key.createEmpty();
        },

        onShortcutSearchChange(key) {
            this.search = '';
        },

        changeExpanded(item) {
            if (this.tableExpanded.length === 1 && this.tableExpanded[0] === item) {
                this.tableExpanded = [];
            } else {
                this.tableExpanded = [item];
            }
        },

        onShortcutChange(key, item) {
            try {
                this.shortcutApi.setShortcut(item.id, key);
            } catch (err) {
                Alert.error(err.message);
            }

            item.shortcut = this.shortcutApi.getShortcut(item.id);
        },

        onParameterChange(value, item, paramId) {
            try {
                this.shortcutApi.setParam(item.id, paramId, value);
            } catch (err) {
                Alert.error(err.message);
            }

            item.param[paramId].value = this.shortcutApi.getParam(item.id, paramId);
        },

        convertToInternalData(settings, config) {
            const param = {};

            if (settings.param) {
                for (const paramName of Object.keys(settings.param)) {
                    param[paramName] = {
                        id: paramName,
                        value: settings.param[paramName],
                    };
                }
            }

            return {
                id: config.id,
                name: config.name,
                desc: config.desc,
                necessary: config.necessary,
                combiningKeyAlone: config.combiningKeyAlone,
                paramDesc: config.param,

                // use deep copy of settings
                shortcut: Key.fromKey(settings.shortcut),
                param: param,
            };
        },

        initializeVariables() {
            if (!this.shortcutApi || !this.shortcutApi.shortcutConfig) {
                this.showUnavailable = true;
                return;
            }

            this.shortcuts = Object.keys(this.shortcutApi.shortcutConfig).map((key) => {
                return this.convertToInternalData(
                    this.shortcutApi.shortcutSettings[key],
                    this.shortcutApi.shortcutConfig[key]
                );
            });
        },

        tableItemFilter(value, search, item) {
            if (search === null || search.trim() === '') {
                return true;
            }

            search = search.toLowerCase();
            return (
                item.name.toLowerCase().includes(search) ||
                item.desc.toLowerCase().includes(search) ||
                item.shortcut.asDisplayString().toLowerCase().includes(search)
            );
        },
    },
};
