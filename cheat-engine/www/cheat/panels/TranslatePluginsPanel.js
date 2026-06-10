import { getRowsPerPage, setRowsPerPage } from '../js/TableSettings.js';
import { ensureTranslationRuntime } from '../js/translation-runtime/TranslationRuntime.js';
import { PLUGIN_TRANSLATOR_REGISTRY } from '../translate-engines/plugins/PluginTranslatorRegistry.js';
import {
    clearConsentForCurrentGame,
    scanCustomScriptFiles,
} from '../js/CustomTranslatorConsent.js';

const pluginsPanelTableStateMemory = {
    sortBy: 'label',
    sortDesc: false,
    page: 1,
    searchInput: '',
};

export default {
    name: 'TranslatePluginsPanel',

    template: `
<v-card flat class="ma-0 pa-0 fill-height panel-with-sticky-table">
    <v-card-title class="subtitle-1 font-weight-bold pb-1">
        Detected Plugins
    </v-card-title>

    <v-data-table
        class="mt-1 table-with-sticky-footer"
        :headers="tableHeaders"
        :items="filteredEntries"
        :page.sync="page"
        :sort-by.sync="sortBy"
        :sort-desc.sync="sortDesc"
        :items-per-page.sync="rowsPerPage">
        <template v-slot:top>
            <div class="d-flex align-center" style="gap: 8px;">
                <v-text-field
                    v-model="searchInput"
                    label="Search plugins"
                    solo
                    dense
                    hide-details
                    background-color="grey darken-3"
                    @keydown.self.stop>
                </v-text-field>
                <v-btn
                    v-if="hasCustomTranslatorScripts"
                    small
                    text
                    color="warning"
                    @click="resetCustomTranslatorConsent">
                    Reset script consent
                </v-btn>
            </div>
        </template>

        <template v-slot:item.label="{ item }">
            <span class="caption white--text">{{ item.label }}</span>
        </template>

        <template v-slot:item.activationSucceeded="{ item }">
            <div class="d-flex align-center justify-center">
                <v-icon small :color="item.activationSucceeded ? 'green' : 'red'">
                    {{ item.activationSucceeded ? 'mdi-check' : 'mdi-close' }}
                </v-icon>
            </div>
        </template>

        <template v-slot:item.activationRetryCount="{ item }">
            <span class="caption">{{ item.activationRetryCount }}</span>
        </template>
    </v-data-table>
</v-card>
    `,

    data() {
        return {
            rowsPerPage: getRowsPerPage(),
            sortBy: 'label',
            sortDesc: false,
            page: 1,
            searchInput: '',
            tableHeaders: [
                {
                    text: 'Plugin',
                    value: 'label',
                },
                {
                    text: 'Activated',
                    value: 'activationSucceeded',
                    align: 'center',
                    width: 120,
                },
                {
                    text: 'Activation retries',
                    value: 'activationRetryCount',
                    width: 170,
                },
            ],
            tableItems: [],
            _refreshTimerId: 0,
            hasCustomTranslatorScripts: scanCustomScriptFiles().length > 0,
        };
    },

    created() {
        this._runtime = ensureTranslationRuntime();
        this.restoreTableState();
        this.refreshEntries();

        this._refreshTimerId = setInterval(() => {
            this.refreshEntries();
        }, 1000);
    },

    beforeDestroy() {
        if (this._refreshTimerId) {
            clearInterval(this._refreshTimerId);
            this._refreshTimerId = 0;
        }
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

        sortBy() {
            this.saveTableState();
        },

        sortDesc() {
            this.saveTableState();
        },

        page() {
            this.saveTableState();
        },

        searchInput() {
            this.page = 1;
            this.saveTableState();
        },
    },

    computed: {
        filteredEntries() {
            const term = String(this.searchInput || '')
                .trim()
                .toLowerCase();
            if (!term) {
                return this.tableItems;
            }

            return this.tableItems.filter((item) => {
                const label = String(item.label || '').toLowerCase();
                const pluginName = String(item.pluginName || '').toLowerCase();
                return label.includes(term) || pluginName.includes(term);
            });
        },
    },

    methods: {
        async refreshEntries() {
            await PLUGIN_TRANSLATOR_REGISTRY.ensureDetectionCompleted({ runtime: this._runtime });

            this.tableItems = PLUGIN_TRANSLATOR_REGISTRY.getDetectedPluginActivationSummaries().map(
                (summary) => ({
                    pluginName: summary.pluginName,
                    label: summary.label || summary.pluginName,
                    activationSucceeded: !!summary.activationSucceeded,
                    activationRetryCount: Math.max(0, Number(summary.activationRetryCount) || 0),
                })
            );
        },

        resetCustomTranslatorConsent() {
            clearConsentForCurrentGame();
            if (window.Alert && typeof window.Alert.info === 'function') {
                window.Alert.info(
                    'Custom translator consent has been reset. Restart the game to re-evaluate.'
                );
            }
        },

        restoreTableState() {
            const state = pluginsPanelTableStateMemory;
            if (typeof state.sortBy === 'string' && state.sortBy.trim()) {
                this.sortBy = state.sortBy;
            }
            if (typeof state.sortDesc === 'boolean') {
                this.sortDesc = state.sortDesc;
            }
            if (Number.isFinite(Number(state.page)) && Number(state.page) > 0) {
                this.page = Number(state.page);
            }
            if (typeof state.searchInput === 'string') {
                this.searchInput = state.searchInput;
            }
        },

        saveTableState() {
            pluginsPanelTableStateMemory.sortBy = this.sortBy;
            pluginsPanelTableStateMemory.sortDesc = !!this.sortDesc;
            pluginsPanelTableStateMemory.page = this.page;
            pluginsPanelTableStateMemory.searchInput = this.searchInput;
        },
    },
};
