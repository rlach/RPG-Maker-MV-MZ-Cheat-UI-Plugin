import { getRowsPerPage, setRowsPerPage } from '../js/TableSettings.js';
import {
    getKnowledgeEntries,
    setKnowledgeEntry,
    deleteKnowledgeEntry,
    onKnowledgeBaseChanged,
    ensureKnowledgeForLangPair,
    getKnowledgeLangPair,
} from '../js/KnowledgeBaseRuntime.js';
import { ensureTranslationRuntime } from '../js/translation-runtime/TranslationRuntime.js';

const knowledgePanelTableStateMemory = {
    sortBy: 'key',
    sortDesc: false,
    page: 1,
    searchInput: '',
};

export default {
    name: 'TranslateKnowledgePanel',

    template: `
<v-card flat class="ma-0 pa-0 fill-height panel-with-sticky-table">
    <v-card-title class="subtitle-1 font-weight-bold pb-1">
        Knowledge Base
    </v-card-title>

    <v-card-text class="pt-0 pb-1">
        <div class="d-flex align-center justify-space-between">
            <div class="caption grey--text text--lighten-1">
                {{ activeLanguagePairLabel }}
            </div>
        </div>
        <v-switch
            v-model="askLlmToAddToKnowledge"
            label="Ask LLM to add to Knowledge Base"
            dense
            hide-details
            class="mt-1"
            @click.self.stop
            @change="onToggleAskLlm">
        </v-switch>
    </v-card-text>

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
                    label="Search key / translation / info"
                    solo
                    dense
                    hide-details
                    background-color="grey darken-3"
                    @keydown.self.stop>
                </v-text-field>
                <v-btn
                    small
                    color="primary"
                    @click="startAddEntry">
                    <v-icon small left>mdi-plus</v-icon>
                    Add
                </v-btn>
            </div>
        </template>

        <template v-slot:item.key="{ item }">
            <v-text-field
                v-if="editingKey === item.key"
                :value="editDraft.key"
                dense
                hide-details
                class="mt-0 pt-0 caption"
                @input="editDraft.key = $event"
                @keydown.stop>
            </v-text-field>
            <div v-else
                class="caption white--text"
                style="white-space: pre-wrap; word-break: break-word;"
                v-text="item.key">
            </div>
        </template>

        <template v-slot:item.translation="{ item }">
            <v-text-field
                v-if="editingKey === item.key"
                :value="editDraft.translation"
                dense
                hide-details
                class="mt-0 pt-0 caption"
                @input="editDraft.translation = $event"
                @keydown.stop>
            </v-text-field>
            <div v-else
                class="caption white--text"
                style="white-space: pre-wrap; word-break: break-word;"
                v-text="item.translation">
            </div>
        </template>

        <template v-slot:item.info="{ item }">
            <v-text-field
                v-if="editingKey === item.key"
                :value="editDraft.info"
                dense
                hide-details
                class="mt-0 pt-0 caption"
                @input="editDraft.info = $event"
                @keydown.stop>
            </v-text-field>
            <div v-else
                class="caption white--text"
                style="white-space: pre-wrap; word-break: break-word;"
                v-text="item.info">
            </div>
        </template>

        <template v-slot:item.plugin="{ item }">
            <span class="caption grey--text" v-text="item.plugin"></span>
        </template>

        <template v-slot:item.actions="{ item }">
            <div class="d-flex align-center justify-center" style="gap: 2px;">
                <template v-if="editingKey === item.key">
                    <v-btn icon x-small color="success" @click="saveEdit">
                        <v-icon small>mdi-check</v-icon>
                    </v-btn>
                    <v-btn icon x-small color="grey" @click="cancelEdit">
                        <v-icon small>mdi-close</v-icon>
                    </v-btn>
                </template>
                <template v-else>
                    <v-tooltip bottom>
                        <span>Edit entry</span>
                        <template v-slot:activator="{ on, attrs }">
                            <v-btn
                                icon
                                x-small
                                color="primary"
                                v-bind="attrs"
                                v-on="on"
                                @click="startEdit(item)">
                                <v-icon small>mdi-pencil</v-icon>
                            </v-btn>
                        </template>
                    </v-tooltip>
                    <v-tooltip bottom>
                        <span>Delete entry</span>
                        <template v-slot:activator="{ on, attrs }">
                            <v-btn
                                icon
                                x-small
                                color="error"
                                v-bind="attrs"
                                v-on="on"
                                @click="removeEntry(item)">
                                <v-icon small>mdi-delete</v-icon>
                            </v-btn>
                        </template>
                    </v-tooltip>
                </template>
            </div>
        </template>

        <template v-slot:body.prepend v-if="isAdding">
            <tr>
                <td>
                    <v-text-field
                        v-model="addDraft.key"
                        placeholder="Key (required)"
                        dense
                        hide-details
                        class="mt-0 pt-0 caption"
                        @keydown.stop>
                    </v-text-field>
                </td>
                <td>
                    <v-text-field
                        v-model="addDraft.translation"
                        placeholder="Translation"
                        dense
                        hide-details
                        class="mt-0 pt-0 caption"
                        @keydown.stop>
                    </v-text-field>
                </td>
                <td>
                    <v-text-field
                        v-model="addDraft.info"
                        placeholder="Info"
                        dense
                        hide-details
                        class="mt-0 pt-0 caption"
                        @keydown.stop>
                    </v-text-field>
                </td>
                <td>
                    <span class="caption grey--text">—</span>
                </td>
                <td>
                    <div class="d-flex align-center justify-center" style="gap: 2px;">
                        <v-btn icon x-small color="success" @click="confirmAdd" :disabled="!addDraft.key.trim()">
                            <v-icon small>mdi-check</v-icon>
                        </v-btn>
                        <v-btn icon x-small color="grey" @click="cancelAdd">
                            <v-icon small>mdi-close</v-icon>
                        </v-btn>
                    </div>
                </td>
            </tr>
        </template>
    </v-data-table>
</v-card>
    `,

    data() {
        return {
            searchInput: '',
            search: '',
            page: 1,
            rowsPerPage: getRowsPerPage(),
            sortBy: 'key',
            sortDesc: false,
            entries: [],
            refreshTimer: null,
            searchDebounceTimer: null,
            askLlmToAddToKnowledge: true,
            isAdding: false,
            addDraft: { key: '', translation: '', info: '' },
            editingKey: null,
            editDraft: { key: '', translation: '', info: '' },
            tableHeaders: [
                { text: 'Key', value: 'key', width: '25%' },
                { text: 'Translation', value: 'translation', width: '25%' },
                { text: 'Info', value: 'info', width: '25%' },
                { text: 'Plugin', value: 'plugin', width: '10%', sortable: false },
                { text: 'Actions', value: 'actions', width: 100, sortable: false },
            ],
        };
    },

    created() {
        this.syncToggleFromRuntime();

        this.unsubscribeRuntime = onKnowledgeBaseChanged(() => {
            this.scheduleRefresh();
        });

        this.loadTableState();
        this.refreshEntries();
    },

    activated() {
        this.syncToggleFromRuntime();
        this.refreshEntries();
    },

    beforeDestroy() {
        if (this.unsubscribeRuntime) {
            this.unsubscribeRuntime();
            this.unsubscribeRuntime = null;
        }

        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }

        if (this.searchDebounceTimer) {
            clearTimeout(this.searchDebounceTimer);
            this.searchDebounceTimer = null;
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
            this.saveTableState();
        },

        page() {
            this.saveTableState();
        },

        sortBy() {
            this.saveTableState();
        },

        sortDesc() {
            this.saveTableState();
        },

        searchInput(value) {
            this.scheduleSearchDebounce(value);
        },

        search() {
            this.saveTableState();
        },
    },

    computed: {
        activeLanguagePairLabel() {
            const pair = getKnowledgeLangPair();
            const src = pair.sourceLang || '?';
            const tgt = pair.targetLang || '?';
            const count = this.entries.length;
            return `${src} → ${tgt} · ${count} entries`;
        },

        filteredEntries() {
            const needle = (this.search || '').trim().toLowerCase();
            if (!needle) {
                return this.entries;
            }

            return this.entries.filter((entry) => {
                return (
                    (entry.key || '').toLowerCase().includes(needle) ||
                    (entry.translation || '').toLowerCase().includes(needle) ||
                    (entry.info || '').toLowerCase().includes(needle) ||
                    (entry.plugin || '').toLowerCase().includes(needle)
                );
            });
        },
    },

    methods: {
        syncToggleFromRuntime() {
            const runtime = ensureTranslationRuntime();
            if (runtime && typeof runtime.askLlmToAddToKnowledge === 'boolean') {
                this.askLlmToAddToKnowledge = runtime.askLlmToAddToKnowledge;
            }
        },

        onToggleAskLlm(value) {
            const runtime = ensureTranslationRuntime();
            if (runtime) {
                runtime.askLlmToAddToKnowledge = !!value;
                if (typeof runtime.saveSettings === 'function') {
                    runtime.saveSettings();
                }
            }
        },

        scheduleSearchDebounce(value) {
            if (this.searchDebounceTimer) {
                clearTimeout(this.searchDebounceTimer);
            }
            this.searchDebounceTimer = setTimeout(() => {
                this.searchDebounceTimer = null;
                this.search = typeof value === 'string' ? value : '';
            }, 220);
        },

        scheduleRefresh() {
            if (this.refreshTimer) {
                clearTimeout(this.refreshTimer);
            }
            this.refreshTimer = setTimeout(() => {
                this.refreshTimer = null;
                this.refreshEntries();
            }, 80);
        },

        refreshEntries() {
            // Ensure lang pair is current
            const runtime = ensureTranslationRuntime();
            if (runtime && runtime.sourceLang && runtime.targetLang) {
                ensureKnowledgeForLangPair(runtime.sourceLang, runtime.targetLang);
            }

            this.entries = getKnowledgeEntries();
        },

        loadTableState() {
            const state = knowledgePanelTableStateMemory;
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
                this.search = state.searchInput;
            }
        },

        saveTableState() {
            knowledgePanelTableStateMemory.sortBy = this.sortBy;
            knowledgePanelTableStateMemory.sortDesc = !!this.sortDesc;
            knowledgePanelTableStateMemory.page = this.page;
            knowledgePanelTableStateMemory.searchInput = this.searchInput;
        },

        // --- Add ---
        startAddEntry() {
            this.cancelEdit();
            this.isAdding = true;
            this.addDraft = { key: '', translation: '', info: '' };
        },

        confirmAdd() {
            const key = (this.addDraft.key || '').trim();
            if (!key) {
                return;
            }
            setKnowledgeEntry({
                key,
                translation: (this.addDraft.translation || '').trim(),
                info: (this.addDraft.info || '').trim(),
            });
            this.isAdding = false;
            this.addDraft = { key: '', translation: '', info: '' };
            this.refreshEntries();
        },

        cancelAdd() {
            this.isAdding = false;
            this.addDraft = { key: '', translation: '', info: '' };
        },

        // --- Edit ---
        startEdit(item) {
            this.cancelAdd();
            this.editingKey = item.key;
            this.editDraft = {
                key: item.key,
                translation: item.translation || '',
                info: item.info || '',
            };
        },

        saveEdit() {
            const key = (this.editDraft.key || '').trim();
            if (!key) {
                return;
            }

            // If key changed, delete old entry
            if (this.editingKey && this.editingKey !== key) {
                deleteKnowledgeEntry(this.editingKey);
            }

            setKnowledgeEntry({
                key,
                translation: (this.editDraft.translation || '').trim(),
                info: (this.editDraft.info || '').trim(),
            });
            this.editingKey = null;
            this.editDraft = { key: '', translation: '', info: '' };
            this.refreshEntries();
        },

        cancelEdit() {
            this.editingKey = null;
            this.editDraft = { key: '', translation: '', info: '' };
        },

        // --- Delete ---
        removeEntry(item) {
            deleteKnowledgeEntry(item.key);
            this.refreshEntries();
        },
    },
};
