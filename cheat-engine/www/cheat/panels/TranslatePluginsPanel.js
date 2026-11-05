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
    <v-card-title class="text-subtitle-1 font-weight-bold pb-1">
        Detected Plugins
    </v-card-title>

    <v-data-table return-object
        class="mt-1 table-with-sticky-footer"
        :headers="uiTableHeaders(tableHeaders)"
        :items="filteredEntries"
        v-model:page="page"
        :sort-by="uiTableSort(sortBy, sortDesc)" @update:sort-by="updateUiTableSort($event, 'sortBy', 'sortDesc')"

        v-model:items-per-page="rowsPerPage">
        <template v-slot:top>
            <div class="d-flex align-center" style="gap: 8px;">
                <v-text-field
                    v-model="searchInput"
                    label="Search plugins" variant="solo" single-line density="compact"
                    hide-details
                    bg-color="grey-darken-3"
                    @keydown.stop>
                </v-text-field>
                <v-btn
                    v-if="hasCustomTranslatorScripts" size="small" variant="text"
                    color="warning"
                    @click="resetCustomTranslatorConsent">
                    Reset script consent
                </v-btn>
            </div>
        </template>

        <template v-slot:item.label="{ item }">
            <span class="text-caption text-white">{{ item.label }}</span>
        </template>

        <template v-slot:item.activationSucceeded="{ item }">
            <div class="d-flex align-center justify-center">
                <v-icon size="small" :color="item.activationSucceeded ? 'green' : 'red'">
                    {{ item.activationSucceeded ? 'mdi-check' : 'mdi-close' }}
                </v-icon>
            </div>
        </template>

        <template v-slot:item.actions="{ item }">
            <v-btn v-if="item.hasSettings" icon="mdi-cog" variant="text" size="small"
                :aria-label="'Settings for ' + item.label" @click="openPluginSettings(item)"></v-btn>
        </template>
        <template v-slot:item.activationRetryCount="{ item }">
            <span class="text-caption">{{ item.activationRetryCount }}</span>
        </template>
    </v-data-table>
    <v-dialog v-model="settingsOpen" max-width="600">
        <v-card>
            <v-card-title>{{ settingsTitle }} settings</v-card-title>
            <v-card-text>
                <p class="text-caption mb-4">These settings are saved with the translation cache and travel with the translation.</p>
                <template v-for="field in settingsFields" :key="field.key">
                    <v-switch v-if="field.type === 'boolean'" v-model="settingsDraft[field.key]"
                        :label="field.label" density="compact"></v-switch>
                    <v-text-field v-else v-model="settingsDraft[field.key]" :label="field.label"
                        :type="field.type === 'number' ? 'number' : 'text'" :min="field.min" :max="field.max"
                        :step="field.step || 1" variant="outlined" density="compact" class="mb-3" hide-details></v-text-field>
                </template>
            </v-card-text>
            <v-card-actions>
                <v-btn variant="text" @click="resetPluginSettings">Reset defaults</v-btn>
                <v-spacer></v-spacer>
                <v-btn variant="text" @click="settingsOpen = false">Cancel</v-btn>
                <v-btn variant="text" color="primary" @click="savePluginSettings">Save</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</v-card>
    `,

    data() {
        return {
            settingsOpen: false,
            settingsPluginName: '',
            settingsTitle: '',
            settingsFields: [],
            settingsDraft: {},
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
                { text: 'Actions', value: 'actions', sortable: false, width: 80 },
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

    beforeUnmount() {
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
        openPluginSettings(item) {
            const translator = PLUGIN_TRANSLATOR_REGISTRY.getDetectedTranslatorInstances().find(
                (entry) => entry.getPluginName() === item.pluginName
            );
            if (!translator) return;
            this.settingsPluginName = item.pluginName;
            this.settingsTitle = item.label;
            this.settingsFields = translator.getSettingsSchema();
            this.settingsDraft = translator.getPluginSettings();
            this.settingsOpen = true;
        },

        resetPluginSettings() {
            this.settingsDraft = Object.fromEntries(
                this.settingsFields.map((field) => [field.key, field.default])
            );
        },

        savePluginSettings() {
            const translator = PLUGIN_TRANSLATOR_REGISTRY.getDetectedTranslatorInstances().find(
                (entry) => entry.getPluginName() === this.settingsPluginName
            );
            if (!translator) return;
            translator.savePluginSettings(this.settingsDraft);
            this.settingsOpen = false;
        },

        async refreshEntries() {
            await PLUGIN_TRANSLATOR_REGISTRY.ensureDetectionCompleted({ runtime: this._runtime });

            this.tableItems = PLUGIN_TRANSLATOR_REGISTRY.getDetectedPluginActivationSummaries().map(
                (summary) => ({
                    pluginName: summary.pluginName,
                    hasSettings: summary.hasSettings,
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
