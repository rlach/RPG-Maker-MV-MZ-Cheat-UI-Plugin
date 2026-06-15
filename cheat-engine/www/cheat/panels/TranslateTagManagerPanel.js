import { getRowsPerPage, setRowsPerPage as setTableRowsPerPage } from '../js/TableSettings.js';
import { ensureTranslationRuntime } from '../js/translation-runtime/TranslationRuntime.js';
import { TAG_CONFIGS } from '../translate-engines/ai-engine/constants.js';
import UnknownTagsModal from './translate-tag-manager/UnknownTagsModal.js';
import CustomTagDialog from './translate-tag-manager/CustomTagDialog.js';

const tagManagerTableStateMemory = {
    sortBy: 'description',
    sortDesc: false,
    page: 1,
    searchInput: '',
    selectedTypeFilter: '',
};
export default {
    name: 'TranslateTagManagerPanel',

    components: {
        UnknownTagsModal,
        CustomTagDialog,
    },

    template: `
<v-card flat class="ma-0 pa-0 fill-height panel-with-sticky-table">
    <v-card-title class="subtitle-1 font-weight-bold pb-1 d-flex align-center">
        <span>Tag Manager</span>
        <v-spacer></v-spacer>
        <v-btn
            small
            outlined
            color="primary"
            class="mr-2"
            :disabled="!isAiEngine"
            :title="!isAiEngine ? 'Only available with AI translation engine' : ''"
            @click="openFindUnknownTags">
            <v-icon small left>mdi-magnify-scan</v-icon>
            Find unknown tags
        </v-btn>
        <v-btn
            v-if="isAiEngine"
            small
            outlined
            color="primary"
            @click="openAddCustomTagDialog">
            <v-icon small left>mdi-plus</v-icon>
            Add tag
        </v-btn>
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
                <v-select
                    v-model="selectedTypeFilter"
                    :items="typeFilterOptions"
                    label="Type"
                    item-text="text"
                    item-value="value"
                    solo
                    dense
                    clearable
                    hide-details
                    background-color="grey darken-3"
                    style="max-width: 180px;"
                    @keydown.self.stop>
                </v-select>
                <v-text-field
                    v-model="searchInput"
                    label="Search tags"
                    solo
                    dense
                    hide-details
                    background-color="grey darken-3"
                    @keydown.self.stop>
                </v-text-field>
            </div>
        </template>

        <template v-slot:item.tagDisplay="{ item }">
            <span class="caption font-weight-bold" style="font-family: monospace;">{{ item.tagDisplay }}</span>
        </template>

        <template v-slot:item.tagSource="{ item }">
            <span class="caption">{{ item.tagSource }}</span>
        </template>

        <template v-slot:item.description="{ item }">
            <span class="caption">{{ item.description }}</span>
        </template>

        <template v-slot:item.actions="{ item }">
            <div class="d-flex align-center justify-center">
                <v-btn icon x-small color="primary" @click="openEditTagDialog(item)">
                    <v-icon small>mdi-pencil</v-icon>
                </v-btn>
                <template v-if="item.tagSource === 'custom'">
                    <v-btn icon x-small color="error" @click="removeCustomTag(item.customIndex)">
                        <v-icon small>mdi-delete</v-icon>
                    </v-btn>
                </template>
            </div>
        </template>
    </v-data-table>

    <custom-tag-dialog
        :visible="customTagDialogVisible"
        :form="customTagForm"
        :edit-index="customTagEditIndex"
        :read-only-mode="customTagReadOnlyMode"
        :tag-style-options="tagStyleOptions"
        :tag-type-options="tagTypeOptions"
        :tag-bracket-options="tagBracketOptions"
        @update:visible="customTagDialogVisible = $event"
        @cancel="closeCustomTagDialog"
        @save="saveTagDialog">
    </custom-tag-dialog>

    <unknown-tags-modal
        :visible="findUnknownTagsVisible"
        :runtime="_runtime"
        :resolved-pattern="resolvedUnknownPattern"
        @update:visible="findUnknownTagsVisible = $event"
        @create-custom-tag="openAddCustomTagFromUnknown"
        @closed="refreshEntries">
    </unknown-tags-modal>
</v-card>
  `,

    data() {
        return {
            entries: [],

            searchInput: '',
            search: '',
            page: 1,
            rowsPerPage: getRowsPerPage(),
            sortBy: 'description',
            sortDesc: false,
            selectedTypeFilter: '',
            searchDebounceTimer: null,

            tableHeaders: [
                { text: 'Tag', value: 'tagDisplay', width: 160, sortable: true },
                { text: 'Type', value: 'tagSource', width: 90, sortable: true },
                { text: 'Description', value: 'description' },
                { text: 'Actions', value: 'actions', width: 80, sortable: false },
            ],

            typeFilterOptions: [
                { text: 'All', value: '' },
                { text: 'default', value: 'default' },
                { text: 'plugin', value: 'plugin' },
                { text: 'custom', value: 'custom' },
            ],

            // Custom tag dialog
            customTagDialogVisible: false,
            customTagEditIndex: -1,
            customTagReadOnlyMode: false,
            fixedTagEditContext: {
                tagSource: 'default',
                pluginName: '',
                tagConfig: null,
            },
            customTagForm: {
                description: '',
                tagSymbol: '',
                type: 'withNumericParameter',
                requiredConsistency: false,
                style: 'escape',
                bracket: '<',
                maskValue: false,
                reservedWidth: 0,
                extraPromptForLlm: '',
                alwaysTranslate: false,
                alwaysAddToKnowledgeBase: false,
            },
            pendingUnknownTagPattern: null,
            resolvedUnknownPattern: '',

            // Static options (populated from runtime engine or fallback defaults)
            tagStyleOptions: [
                { text: String.raw`Escape style (\Symbol)`, value: 'escape' },
                { text: 'XML style (<Symbol>)', value: 'xml' },
            ],
            tagTypeOptions: [
                { text: 'withNumericParameter', value: 'withNumericParameter' },
                { text: 'withoutParameter', value: 'withoutParameter' },
                { text: 'withCustomParameter', value: 'withCustomParameter' },
            ],
            tagBracketOptions: [
                { text: '< >', value: '<' },
                { text: '[ ]', value: '[' },
                { text: '( )', value: '(' },
                { text: '{ }', value: '{' },
                { text: 'none (xml :value)', value: 'none' },
            ],

            findUnknownTagsVisible: false,
        };
    },

    created() {
        this._runtime = ensureTranslationRuntime();
        this.loadTableState();
        this.refreshEntries();
    },

    activated() {
        if (this._runtime) {
            this.refreshEntries();
        }
    },

    beforeDestroy() {
        if (this.searchDebounceTimer) {
            clearTimeout(this.searchDebounceTimer);
            this.searchDebounceTimer = null;
        }
    },

    watch: {
        rowsPerPage(val) {
            const parsed = Number(val);
            if (!Number.isFinite(parsed) || parsed <= 0) return;
            if (parsed !== val) return;
            setTableRowsPerPage(parsed);
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
        selectedTypeFilter() {
            this.saveTableState();
        },
    },

    computed: {
        isAiEngine() {
            if (!this._runtime) return false;
            const e = this._runtime.translationEngine;
            return e === 'openApi' || e === 'gpt4all';
        },

        filteredEntries() {
            let result = this.entries;
            if (this.selectedTypeFilter) {
                result = result.filter((e) => e.tagSource === this.selectedTypeFilter);
            }
            if (this.search) {
                const q = this.search.toLowerCase();
                result = result.filter(
                    (e) =>
                        e.description.toLowerCase().includes(q) ||
                        e.tagDisplay.toLowerCase().includes(q)
                );
            }
            return result;
        },
    },

    methods: {
        refreshEntries() {
            const entries = [];
            const engine = this._runtime?.engine;

            this.appendDefaultTagEntries(entries, engine);
            this.appendPluginTagEntries(entries, engine);
            this.appendCustomTagEntries(entries);

            this.entries = entries;
            this.syncTagOptionsFromEngine(engine);
        },

        appendDefaultTagEntries(entries, engine) {
            const defaultTagsForUi =
                engine && typeof engine.getDefaultTagConfigsForUi === 'function'
                    ? engine.getDefaultTagConfigsForUi()
                    : TAG_CONFIGS;
            for (const tag of defaultTagsForUi) {
                entries.push({
                    tagDisplay: this.formatTagDisplay(tag),
                    tagSource: 'default',
                    description: tag.description,
                    tag: {
                        ...tag,
                        ...engine.getOverrides(tag, 'default', ''),
                    },
                    pluginName: '',
                    customIndex: -1,
                });
            }
        },

        appendPluginTagEntries(entries, engine) {
            if (engine && Array.isArray(engine.pluginTags)) {
                for (const tag of engine.pluginTags) {
                    const pluginName = tag._pluginName || 'unknown';
                    entries.push({
                        tagDisplay: this.formatTagDisplay(tag),
                        tagSource: 'plugin',
                        description: `${pluginName}: ${tag.description}`,
                        tag: {
                            ...tag,
                            ...engine.getOverrides(tag, 'plugin', pluginName),
                        },
                        pluginName,
                        customIndex: -1,
                    });
                }
            }
        },

        appendCustomTagEntries(entries) {
            const customTags =
                this._runtime && Array.isArray(this._runtime.aiCustomTags)
                    ? this._runtime.aiCustomTags
                    : [];
            customTags.forEach((tag, idx) => {
                entries.push({
                    tagDisplay: this.formatTagDisplay(tag),
                    tagSource: 'custom',
                    description: tag.description,
                    // Custom tags don't have overrides, because they are fully custom
                    tag,
                    pluginName: '',
                    customIndex: idx,
                });
            });
        },

        syncTagOptionsFromEngine(engine) {
            if (engine) {
                if (Array.isArray(engine.customTagStyleOptions)) {
                    this.tagStyleOptions = engine.customTagStyleOptions;
                }
                if (Array.isArray(engine.customTagTypeOptions)) {
                    this.tagTypeOptions = engine.customTagTypeOptions;
                }
                if (Array.isArray(engine.customTagBracketOptions)) {
                    this.tagBracketOptions = engine.customTagBracketOptions;
                }
            }
        },

        formatTagDisplay(tag) {
            if (tag?._isSimpleNTag) {
                return '[b=sn]';
            }

            const sym = tag.tagSymbol || '?';
            if (tag.style === 'xml') {
                if (tag.type === 'withNumericParameter') return `<${sym}:N>`;
                if (tag.type === 'withCustomParameter') return `<${sym}:…>`;
                return `<${sym}>`;
            }
            // legacy TAG_TYPE.XML
            if (tag.type === 'xml') return `<${sym}>`;
            // escape style
            if (tag.type === 'withNumericParameter') return `\\${sym}[N]`;
            if (tag.type === 'withCustomParameter') {
                const open = tag.bracket && tag.bracket !== 'none' ? tag.bracket : '<';
                const close = { '<': '>', '[': ']', '(': ')', '{': '}' }[open] || '>';
                return `\\${sym}${open}…${close}`;
            }
            return `\\${sym}`;
        },

        callRuntime(methodName, ...args) {
            if (!this._runtime) {
                this._runtime = ensureTranslationRuntime();
            }
            if (!this._runtime || typeof this._runtime[methodName] !== 'function') {
                throw new Error(`Translation runtime method is missing: ${methodName}`);
            }
            const result = this._runtime[methodName](...args);
            if (result && typeof result.then === 'function') {
                return result.finally(() => this.refreshEntries());
            }
            this.refreshEntries();
            return result;
        },

        scheduleSearchDebounce(value) {
            if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
            this.searchDebounceTimer = setTimeout(() => {
                this.searchDebounceTimer = null;
                this.search = value;
            }, 220);
        },

        openFindUnknownTags() {
            this.findUnknownTagsVisible = true;
            this.resolvedUnknownPattern = '';
        },

        loadTableState() {
            const state = tagManagerTableStateMemory;
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
            if (typeof state.selectedTypeFilter === 'string') {
                this.selectedTypeFilter = state.selectedTypeFilter;
            }
        },

        saveTableState() {
            tagManagerTableStateMemory.sortBy = this.sortBy;
            tagManagerTableStateMemory.sortDesc = !!this.sortDesc;
            tagManagerTableStateMemory.page = this.page;
            tagManagerTableStateMemory.searchInput = this.searchInput;
            tagManagerTableStateMemory.selectedTypeFilter = this.selectedTypeFilter;
        },

        // ---- Custom Tag CRUD ----

        openEditTagDialog(item) {
            if (!item?.tag) {
                return;
            }

            if (item.tagSource === 'custom') {
                this.openEditCustomTagDialog(item.tag, item.customIndex);
                return;
            }

            this.openEditFixedTagDialog(item);
        },

        openAddCustomTagDialog() {
            this.customTagEditIndex = -1;
            this.customTagReadOnlyMode = false;
            this.fixedTagEditContext = {
                tagSource: 'default',
                pluginName: '',
                tagConfig: null,
            };
            this.customTagForm = {
                description: '',
                tagSymbol: '',
                type: 'withNumericParameter',
                requiredConsistency: false,
                style: 'escape',
                bracket: '<',
                maskValue: false,
                reservedWidth: 0,
                extraPromptForLlm: '',
                alwaysTranslate: false,
                alwaysAddToKnowledgeBase: false,
            };
            this.customTagDialogVisible = true;
        },

        openEditCustomTagDialog(tag, index) {
            this.customTagEditIndex = index;
            this.customTagReadOnlyMode = false;
            this.fixedTagEditContext = {
                tagSource: 'default',
                pluginName: '',
                tagConfig: null,
            };
            this.customTagForm = {
                description: String(tag.description || ''),
                tagSymbol: String(tag.tagSymbol || ''),
                type: String(tag.type || 'withNumericParameter'),
                requiredConsistency: !!tag.requiredConsistency,
                style: String(tag.style || 'escape'),
                bracket: String(tag.bracket || '<'),
                maskValue: !!tag.maskValue,
                reservedWidth: this.normalizeReservedWidthInput(tag.reservedWidth),
                extraPromptForLlm: String(tag.extraPromptForLlm || ''),
                alwaysTranslate: !!tag.alwaysTranslate,
                alwaysAddToKnowledgeBase: !!tag.alwaysAddToKnowledgeBase,
            };
            this.customTagDialogVisible = true;
        },

        openEditFixedTagDialog(item) {
            const tag = item.tag || {};
            this.customTagEditIndex = -1;
            this.customTagReadOnlyMode = true;
            this.fixedTagEditContext = {
                tagSource: item.tagSource,
                pluginName: item.pluginName || '',
                tagConfig: tag,
            };
            this.customTagForm = {
                description: String(tag.description || ''),
                tagSymbol: String(tag.tagSymbol || ''),
                type: String(tag.type || 'withNumericParameter'),
                requiredConsistency: !!tag.requiredConsistency,
                style: String(tag.style || 'escape'),
                bracket: String(tag.bracket || (tag.style === 'xml' ? 'none' : '<')),
                maskValue: !!tag.maskValue,
                alwaysTranslate: !!tag.alwaysTranslate,
                alwaysAddToKnowledgeBase: !!tag.alwaysAddToKnowledgeBase,
                reservedWidth: this.normalizeReservedWidthInput(tag.reservedWidth),
                extraPromptForLlm: String(tag.extraPromptForLlm || ''),
            };
            this.customTagDialogVisible = true;
        },

        normalizeReservedWidthInput(value) {
            const parsed = Number(value);
            return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
        },

        saveTagDialog() {
            if (this.customTagReadOnlyMode) {
                this.saveFixedTagOverrides();
                return;
            }
            this.saveCustomTag();
        },

        saveFixedTagOverrides() {
            const { tagSource, pluginName, tagConfig } = this.fixedTagEditContext;
            this.callRuntime(
                'updateAiTagOverrides',
                tagSource,
                tagConfig,
                {
                    reservedWidth: this.normalizeReservedWidthInput(
                        this.customTagForm.reservedWidth
                    ),
                    extraPromptForLlm: String(this.customTagForm.extraPromptForLlm || '').trim(),
                    requiredConsistency: !!this.customTagForm.requiredConsistency,
                },
                pluginName || ''
            );
            this.callRuntime('bindEngineConfigTo', this._runtime);
            this.closeCustomTagDialog();
        },

        closeCustomTagDialog() {
            this.customTagDialogVisible = false;
            this.customTagReadOnlyMode = false;
            this.fixedTagEditContext = {
                tagSource: 'default',
                pluginName: '',
                tagConfig: null,
            };
        },

        saveCustomTag() {
            const maskValue =
                this.customTagForm.type === 'withCustomParameter'
                    ? !!this.customTagForm.maskValue
                    : false;
            const payload = {
                description: String(this.customTagForm.description || '').trim(),
                tagSymbol: String(this.customTagForm.tagSymbol || '').trim(),
                type: String(this.customTagForm.type || 'withNumericParameter'),
                requiredConsistency: !!this.customTagForm.requiredConsistency,
                style: String(this.customTagForm.style || 'escape'),
                reservedWidth: this.normalizeReservedWidthInput(this.customTagForm.reservedWidth),
                extraPromptForLlm: String(this.customTagForm.extraPromptForLlm || '').trim(),
                alwaysTranslate: !maskValue && !!this.customTagForm.alwaysTranslate,
                alwaysAddToKnowledgeBase:
                    !maskValue &&
                    this.customTagForm.type === 'withCustomParameter' &&
                    !!this.customTagForm.alwaysAddToKnowledgeBase,
            };
            if (this.customTagForm.type === 'withCustomParameter') {
                payload.bracket = String(
                    this.customTagForm.bracket || (payload.style === 'xml' ? 'none' : '<')
                );
                payload.maskValue = maskValue;
            }

            if (this.customTagEditIndex >= 0) {
                this.callRuntime('updateAiCustomTag', this.customTagEditIndex, payload);
            } else {
                this.callRuntime('addAiCustomTag', payload);
            }
            this.callRuntime('bindEngineConfigTo', this._runtime);

            if (this.pendingUnknownTagPattern !== null) {
                this.resolvedUnknownPattern = this.pendingUnknownTagPattern;
                this.pendingUnknownTagPattern = null;
            }

            this.closeCustomTagDialog();
        },

        removeCustomTag(index) {
            this.callRuntime('removeAiCustomTag', index);
            this.callRuntime('bindEngineConfigTo', this._runtime);
        },

        openAddCustomTagFromUnknown(payload) {
            this.pendingUnknownTagPattern = payload.pattern;
            this.customTagEditIndex = -1;
            this.customTagReadOnlyMode = false;
            this.fixedTagEditContext = {
                tagSource: 'default',
                pluginName: '',
                tagConfig: null,
            };
            this.customTagForm = { ...payload.form };
            this.customTagDialogVisible = true;
        },
    },
};
