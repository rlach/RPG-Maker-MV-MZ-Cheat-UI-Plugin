import { KeyValueStorage } from '../js/KeyValueStorage.js';
import { getRowsPerPage, setRowsPerPage } from '../js/TableSettings.js';
import { createTranslationBatchManager } from '../translate-engines/batch-manager/TranslationBatchManagerFactory.js';
import {
    ensureTranslateCacheRuntime,
    onTranslateCacheRuntimeChanged,
    parseCacheKeyForLangPair,
} from '../js/TranslateCacheRuntime.js';
import { computeLangPairCompletionByKeyLength } from '../js/TranslationCompletionMetrics.js';
import { ConfirmDialog } from '../js/DialogHelper.js';
import { ensureTranslationRuntime } from './translate-on-the-fly/TranslationRuntime.js';

const cacheManagerTableStateMemory = {
    sortBy: 'seenSort',
    sortDesc: true,
    page: 1,
    searchInput: '',
    selectedTypeFilter: '',
    searchIn: 'both',
};

export default {
    name: 'TranslateCacheManagerPanel',

    template: `
<v-card flat class="ma-0 pa-0 fill-height panel-with-sticky-table">
    <v-card-title class="subtitle-1 font-weight-bold pb-1">
        Translation Cache Manager
    </v-card-title>

    <v-card-text class="pt-0 pb-1">
        <div class="d-flex align-center justify-space-between">
            <div class="caption grey--text text--lighten-1">
          {{ activeLanguagePairLabel }}
            </div>
            <v-btn
                small
                text
                color="primary"
                :loading="isTranslatingEmptyStrings"
                :disabled="isTranslatingEmptyStrings"
                @click="translateEmptyStrings">
                Translate empty strings
            </v-btn>
        </div>
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
          <div>
            <div class="d-flex align-center" style="gap: 8px;">
              <v-text-field
                v-model="searchInput"
                :label="searchFieldLabel"
                solo
                dense
                hide-details
                background-color="grey darken-3"
                @keydown.self.stop>
              </v-text-field>
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
                style="max-width: 220px;"
                @keydown.self.stop>
              </v-select>
              <v-tooltip bottom>
                <template v-slot:activator="{ on, attrs }">
                  <v-btn icon small v-bind="attrs" v-on="on" @click="searchExpanded = !searchExpanded">
                    <v-icon small>{{ searchExpanded ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
                  </v-btn>
                </template>
                <span>{{ searchExpanded ? 'Hide options' : 'More options' }}</span>
              </v-tooltip>
            </div>
            <div v-if="searchExpanded" class="d-flex align-center mt-1" style="gap: 8px;">
              <v-text-field
                v-model="replaceInput"
                label="Replace"
                solo
                dense
                hide-details
                background-color="grey darken-3"
                @keydown.self.stop>
              </v-text-field>
              <v-btn
                small
                color="primary"
                :disabled="replaceButtonDisabled"
                @click="performReplace">
                Replace
              </v-btn>
              <span class="caption grey--text text--lighten-1" style="white-space: nowrap;">Search in:</span>
              <v-select
                v-model="searchIn"
                :items="searchInOptions"
                item-text="text"
                item-value="value"
                solo
                dense
                hide-details
                background-color="grey darken-3"
                style="max-width: 180px;"
                @keydown.self.stop>
              </v-select>
              <v-btn
                icon
                small
                color="error"
                :disabled="matchingFilterEntryCount <= 0"
                @click="confirmClearTranslationsMatchingFilter">
                <v-icon small>mdi-delete</v-icon>
              </v-btn>
            </div>
          </div>
        </template>

        <template v-slot:item.seenSort="{ item }">
            <span class="caption">{{item.seenDisplay}}</span>
        </template>

        <template v-slot:item.type="{ item }">
            <span class="caption">{{item.type}}</span>
        </template>

        <template v-slot:item.original="{ item }">
            <div
                class="caption white--text"
                style="white-space: pre-wrap; word-break: break-word;"
                v-html="highlightText(item.original, searchHighlightTerm, 'original')">
            </div>
        </template>

        <template v-slot:item.translation="{ item }">
            <v-textarea
                v-if="editingKey === item.key"
                :value="getDraftValue(item)"
                :rows="getRowLineCount(item, getDraftValue(item))"
                auto-grow
                no-resize
                dense
                hide-details
                class="mt-0 pt-0"
                @input="onTranslationInput(item, $event)"
                @keydown.stop>
            </v-textarea>
            <div
                v-else
                class="caption white--text"
                style="white-space: pre-wrap; word-break: break-word;"
                v-html="highlightText(item.translation, searchHighlightTerm, 'translation')">
            </div>
        </template>

        <template v-slot:item.actionsSort="{ item }">
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
                        <span>Edit translation</span>
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
                        <span>Copy original text</span>
                        <template v-slot:activator="{ on, attrs }">
                            <v-btn
                                icon
                                x-small
                                color="primary"
                                v-bind="attrs"
                                v-on="on"
                                @click="copyOriginal(item)">
                                <v-icon small>mdi-content-copy</v-icon>
                            </v-btn>
                        </template>
                    </v-tooltip>
                    <v-tooltip bottom>
                        <span>Remove translation</span>
                        <template v-slot:activator="{ on, attrs }">
                            <v-btn
                                icon
                                x-small
                                color="error"
                                v-bind="attrs"
                                v-on="on"
                                @click="clearTranslation(item)">
                                <v-icon small>mdi-close</v-icon>
                            </v-btn>
                        </template>
                    </v-tooltip>
                </template>
            </div>
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
            sortBy: 'seenSort',
            sortDesc: true,
            selectedTypeFilter: '',
            searchExpanded: false,
            replaceInput: '',
            searchIn: 'both',
            editingKey: null,
            sourceLang: 'ja',
            targetLang: 'en',
            entries: [],
            draftByKey: {},
            refreshTimer: null,
            searchDebounceTimer: null,
            isTranslatingEmptyStrings: false,
            tableHeaders: [
                {
                    text: 'Seen',
                    value: 'seenSort',
                    width: 88,
                },
                {
                    text: 'Type',
                    value: 'type',
                    width: 100,
                },
                {
                    text: 'Original',
                    value: 'original',
                    width: '40%',
                },
                {
                    text: 'Translation',
                    value: 'translation',
                    width: '40%',
                },
                {
                    text: 'Actions',
                    value: 'actionsSort',
                    width: 100,
                },
            ],
        };
    },

    created() {
        this.settingsStorage = new KeyValueStorage(
            './www/cheat-settings/translate-on-the-fly.json'
        );
        this.cacheStorage = new KeyValueStorage('./www/cheat-settings/translate-cache.json');

        const runtime = ensureTranslateCacheRuntime();
        this.translationCache = runtime.cache;
        this.lastSeenByCacheKey = runtime.lastSeenByCacheKey;

        this.unsubscribeRuntime = onTranslateCacheRuntimeChanged(() => {
            this.scheduleRefresh();
        });

        this.loadTableState();
        this.refreshEntries();
    },

    activated() {
        this.refreshEntries();
    },

    deactivated() {
        this.flushPendingCacheEdits('panel-deactivated');
    },

    beforeDestroy() {
        this.flushPendingCacheEdits('panel-before-destroy');

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
            this.flushPendingCacheEdits('rows-per-page');
        },

        page() {
            this.saveTableState();
            this.flushPendingCacheEdits('page');
        },

        sortBy() {
            this.saveTableState();
            this.flushPendingCacheEdits('sort');
        },

        sortDesc() {
            this.saveTableState();
            this.flushPendingCacheEdits('sort');
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

        searchIn() {
            this.saveTableState();
        },
    },

    computed: {
        activeLanguagePairLabel() {
            const completion = computeLangPairCompletionByKeyLength({
                translationCache: this.translationCache,
                sourceLang: this.sourceLang,
                targetLang: this.targetLang,
            }).completionPercent.toFixed(1);

            return `Active language pair: ${this.sourceLang} -> ${this.targetLang} (${completion}% complete)`;
        },

        matchingFilterEntryCount() {
            return this.getEntriesMatchingFilter(this.searchInput, this.selectedTypeFilter).length;
        },

        filteredEntries() {
            return this.getEntriesMatchingFilter(this.search, this.selectedTypeFilter);
        },

        typeFilterOptions() {
            const typeSet = new Set();
            for (const entry of this.entries || []) {
                const type = this.normalizeCacheValue(entry && entry.type).trim();
                if (type) {
                    typeSet.add(type);
                }
            }

            const sortedTypes = Array.from(typeSet).sort((a, b) => a.localeCompare(b));
            return [{ text: '', value: '' }].concat(
                sortedTypes.map((type) => ({ text: type, value: type }))
            );
        },

        searchFieldLabel() {
            if (this.searchIn === 'original') {
                return 'Search original';
            }
            if (this.searchIn === 'translation') {
                return 'Search translation';
            }
            return 'Search original / translation';
        },

        searchInOptions() {
            return [
                { text: 'Both', value: 'both' },
                { text: 'Original', value: 'original' },
                { text: 'Translation', value: 'translation' },
            ];
        },

        replaceButtonDisabled() {
            return !this.searchInput.trim() || this.searchIn === 'translation';
        },

        searchHighlightTerm() {
            return this.search;
        },
    },

    methods: {
        scheduleSearchDebounce(value) {
            if (this.searchDebounceTimer) {
                clearTimeout(this.searchDebounceTimer);
            }

            this.searchDebounceTimer = setTimeout(() => {
                this.searchDebounceTimer = null;
                this.search = this.normalizeCacheValue(value);
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

        getActiveLanguagePair() {
            const runtime = ensureTranslationRuntime();
            if (runtime && runtime.sourceLang && runtime.targetLang) {
                return {
                    sourceLang: runtime.sourceLang,
                    targetLang: runtime.targetLang,
                };
            }

            try {
                const raw = this.settingsStorage.getAll();
                if (!raw || typeof raw !== 'object') {
                    return {
                        sourceLang: 'ja',
                        targetLang: 'en',
                    };
                }

                const data =
                    typeof raw.data === 'string'
                        ? JSON.parse(raw.data)
                        : raw && typeof raw.data === 'object'
                          ? raw.data
                          : raw;
                return {
                    sourceLang: data.sourceLang || 'ja',
                    targetLang: data.targetLang || 'en',
                };
            } catch (error) {
                return {
                    sourceLang: 'ja',
                    targetLang: 'en',
                };
            }
        },

        normalizeCacheValue(value) {
            if (typeof value === 'string') {
                return value;
            }

            if (value === null || value === undefined) {
                return '';
            }

            return String(value);
        },

        normalizeTypeFilterValue(value) {
            const normalized = this.normalizeCacheValue(value).trim();
            if (!normalized) {
                return '';
            }

            // Defend against stale/broken persisted state where label text was stored.
            if (normalized.toLowerCase() === 'type') {
                return '';
            }

            return normalized;
        },

        ensureSelectedTypeFilterIsValid() {
            const selected = this.normalizeTypeFilterValue(this.selectedTypeFilter);
            if (!selected) {
                if (this.selectedTypeFilter !== '') {
                    this.selectedTypeFilter = '';
                }
                return;
            }

            const available = new Set(
                (this.entries || [])
                    .map((entry) => this.normalizeCacheValue(entry && entry.type).trim())
                    .filter((type) => !!type)
            );

            if (!available.has(selected)) {
                this.selectedTypeFilter = '';
            } else if (this.selectedTypeFilter !== selected) {
                this.selectedTypeFilter = selected;
            }
        },

        formatSeenTimestamp(timestamp) {
            if (!Number.isFinite(timestamp) || timestamp <= 0) {
                return '';
            }

            const date = new Date(timestamp);
            const hh = String(date.getHours()).padStart(2, '0');
            const mm = String(date.getMinutes()).padStart(2, '0');
            const ss = String(date.getSeconds()).padStart(2, '0');
            return `${hh}:${mm}:${ss}`;
        },

        countVisualLines(text) {
            const value = this.normalizeCacheValue(text);
            if (!value) {
                return 1;
            }

            const hardLines = value.split(/\r?\n/);
            let total = 0;
            for (const line of hardLines) {
                const normalizedLineLength = line.length || 1;
                total += Math.max(1, Math.ceil(normalizedLineLength / 64));
            }

            return Math.max(1, total);
        },

        getRowLineCount(item, draftValue = null) {
            const originalLines = this.countVisualLines(item.original);
            const translationLines = this.countVisualLines(
                draftValue === null ? item.translation : draftValue
            );
            return Math.max(2, originalLines, translationLines);
        },

        getDraftValue(item) {
            if (!item || !item.key) {
                return '';
            }

            if (Object.prototype.hasOwnProperty.call(this.draftByKey, item.key)) {
                return this.normalizeCacheValue(this.draftByKey[item.key]);
            }

            return this.normalizeCacheValue(item.translation);
        },

        loadTableState() {
            const state = cacheManagerTableStateMemory;
            if (typeof state.sortBy === 'string' && state.sortBy.trim() !== '') {
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
                this.selectedTypeFilter = this.normalizeTypeFilterValue(state.selectedTypeFilter);
            }
            if (
                typeof state.searchIn === 'string' &&
                ['both', 'original', 'translation'].includes(state.searchIn)
            ) {
                this.searchIn = state.searchIn;
            }
        },

        saveTableState() {
            cacheManagerTableStateMemory.sortBy = this.sortBy;
            cacheManagerTableStateMemory.sortDesc = !!this.sortDesc;
            cacheManagerTableStateMemory.page = this.page;
            cacheManagerTableStateMemory.searchInput = this.searchInput;
            cacheManagerTableStateMemory.selectedTypeFilter = this.selectedTypeFilter;
            cacheManagerTableStateMemory.searchIn = this.searchIn;
        },

        flushPendingCacheEdits(reason = 'unknown') {
            this.editingKey = null;

            const draftEntries = Object.entries(this.draftByKey || {});
            if (!draftEntries.length) {
                return;
            }

            const changedKeys = [];
            for (const [cacheKey, draftValue] of draftEntries) {
                const normalizedDraft = this.normalizeCacheValue(draftValue);
                const currentValue = this.normalizeCacheValue(this.translationCache.get(cacheKey));

                if (normalizedDraft === currentValue) {
                    delete this.draftByKey[cacheKey];
                    continue;
                }

                this.translationCache.set(cacheKey, normalizedDraft);
                changedKeys.push(cacheKey);
                delete this.draftByKey[cacheKey];
            }

            if (!changedKeys.length) {
                return;
            }

            const runtime = ensureTranslationRuntime();
            runtime.persistCache(changedKeys);
            runtime.notifyCacheRuntime(reason);

            this.refreshEntries();
        },

        refreshEntries() {
            const pair = this.getActiveLanguagePair();
            this.sourceLang = pair.sourceLang;
            this.targetLang = pair.targetLang;

            const items = [];
            for (const [cacheKey, value] of this.translationCache.entries()) {
                const parsed = parseCacheKeyForLangPair(cacheKey, this.sourceLang, this.targetLang);
                if (!parsed) {
                    continue;
                }

                const seenTs = this.lastSeenByCacheKey.get(cacheKey) || null;

                const translation = this.normalizeCacheValue(value);

                items.push({
                    key: cacheKey,
                    seenSort: Number.isFinite(seenTs) ? seenTs : 0,
                    seenDisplay: this.formatSeenTimestamp(seenTs),
                    type: parsed.type,
                    original: parsed.original,
                    translation,
                    actionsSort: parsed.original,
                });
            }

            this.entries = items;
            this.ensureSelectedTypeFilterIsValid();
        },

        matchesTypeFilter(item, selectedType = '') {
            const normalizedSelectedType = this.normalizeCacheValue(selectedType)
                .trim()
                .toLowerCase();
            if (!normalizedSelectedType) {
                return true;
            }

            const itemType = this.normalizeCacheValue(item && item.type)
                .trim()
                .toLowerCase();
            return itemType === normalizedSelectedType;
        },

        onTranslationInput(item, value) {
            const normalized = this.normalizeCacheValue(value);
            this.$set(this.draftByKey, item.key, normalized);
        },

        clearTranslation(item) {
            if (!item || !item.key) {
                return;
            }

            this.onTranslationInput(item, '');
        },

        getEntriesMatchingFilter(searchValue, selectedType = '') {
            const search = this.normalizeCacheValue(searchValue);
            const term = search === null ? '' : String(search).trim().toLowerCase();
            const searchIn = this.searchIn;
            return (this.entries || []).filter((entry) => {
                if (!this.matchesTypeFilter(entry, selectedType)) {
                    return false;
                }

                if (!term) {
                    return true;
                }

                const matchesOriginal = this.normalizeCacheValue(entry && entry.original)
                    .toLowerCase()
                    .includes(term);
                const matchesTranslation = this.normalizeCacheValue(entry && entry.translation)
                    .toLowerCase()
                    .includes(term);

                if (searchIn === 'original') {
                    return matchesOriginal;
                }
                if (searchIn === 'translation') {
                    return matchesTranslation;
                }
                return matchesOriginal || matchesTranslation;
            });
        },

        confirmClearTranslationsMatchingFilter() {
            const matchingEntries = this.getEntriesMatchingFilter(
                this.searchInput,
                this.selectedTypeFilter
            );
            if (!matchingEntries.length) {
                return;
            }

            ConfirmDialog.show({
                width: 420,
                message:
                    'Are you sure? This cannot be undone and will clear translations for all entries matching the current search filter.',
                actions: [
                    {
                        icon: 'mdi-close',
                        label: 'No',
                        color: 'white',
                        action: ConfirmDialog.close,
                    },
                    {
                        icon: 'mdi-check',
                        label: 'Yes',
                        color: 'green',
                        action: () => {
                            this.clearTranslationsMatchingFilter();
                            ConfirmDialog.close();
                        },
                    },
                ],
            });
        },

        clearTranslationsMatchingFilter() {
            this.flushPendingCacheEdits('cache-manager-pre-clear-filtered');

            const matchingEntries = this.getEntriesMatchingFilter(
                this.searchInput,
                this.selectedTypeFilter
            );
            let changed = 0;
            const changedKeys = [];
            for (const entry of matchingEntries) {
                if (!entry || !entry.key) {
                    continue;
                }

                const currentValue = this.normalizeCacheValue(this.translationCache.get(entry.key));
                if (currentValue === '') {
                    continue;
                }

                this.translationCache.set(entry.key, '');
                changed += 1;
                changedKeys.push(entry.key);
            }

            if (!changed) {
                this.refreshEntries();
                return;
            }

            const runtime = ensureTranslationRuntime();
            runtime.persistCache(changedKeys);
            runtime.notifyCacheRuntime('cache-manager-clear-filtered');

            this.refreshEntries();
        },

        async translateEmptyStrings() {
            if (this.isTranslatingEmptyStrings) {
                return;
            }

            let processStarted = false;

            this.flushPendingCacheEdits('cache-manager-pre-translate-empty');

            const runtime = ensureTranslationRuntime();

            const items = [];
            let idCounter = 0;
            for (const [cacheKey, value] of this.translationCache.entries()) {
                const parsed = parseCacheKeyForLangPair(cacheKey, this.sourceLang, this.targetLang);
                if (!parsed) {
                    continue;
                }

                if (this.normalizeCacheValue(value) !== '') {
                    continue;
                }

                const original = this.normalizeCacheValue(parsed.original);
                if (original.trim() === '') {
                    continue;
                }

                items.push({
                    type: parsed.type,
                    id: `empty_${idCounter++}`,
                    value: original,
                    cacheKey,
                });
            }

            if (!items.length) {
                if (window.Alert && typeof window.Alert.info === 'function') {
                    window.Alert.info('No empty translations for current language pair.');
                }
                return;
            }

            if (!runtime.beginNonOtfTranslationProcess('translate empty strings')) {
                return;
            }
            processStarted = true;

            const maxItems =
                Number(runtime.batchItemsLimit) > 0 ? Number(runtime.batchItemsLimit) : 20;
            const maxChars = Number(runtime.charLimit) > 0 ? Number(runtime.charLimit) : 1000;

            this.isTranslatingEmptyStrings = true;

            try {
                if (!runtime.batchManager) {
                    runtime.batchManager = createTranslationBatchManager(runtime);
                }

                await runtime.batchManager.runBatchedTranslation([
                    {
                        kind: 'emptyStrings',
                        items,
                        backgroundJob: false,
                        itemLimit: maxItems,
                        charLimit: maxChars,
                        showSummary: true,
                    },
                ]);
            } catch (error) {
                console.error('[TranslateCacheManagerPanel] Translate empty strings failed', error);
                if (window.Alert && typeof window.Alert.error === 'function') {
                    window.Alert.error(
                        'Translate empty strings failed: ' +
                            (error && error.message ? error.message : error)
                    );
                }
            } finally {
                this.isTranslatingEmptyStrings = false;
                this.refreshEntries();
                if (processStarted) {
                    runtime.endNonOtfTranslationProcess();
                }
            }
        },

        startEdit(item) {
            if (this.editingKey && this.editingKey !== item.key) {
                this.flushPendingCacheEdits('start-edit-switch');
            }
            this.editingKey = item.key;
            this.$set(this.draftByKey, item.key, this.normalizeCacheValue(this.getDraftValue(item)));
        },

        saveEdit() {
            this.flushPendingCacheEdits('save-edit');
        },

        cancelEdit() {
            if (this.editingKey) {
                this.$delete(this.draftByKey, this.editingKey);
            }
            this.editingKey = null;
        },

        performReplace() {
            const searchTerm = this.normalizeCacheValue(this.searchInput).trim();
            if (!searchTerm) {
                return;
            }

            const replaceWith = this.normalizeCacheValue(this.replaceInput);
            const matching = this.getEntriesMatchingFilter(this.searchInput, this.selectedTypeFilter);
            const regex = new RegExp(this.escapeRegex(searchTerm), 'gi');

            const changedKeys = [];
            for (const entry of matching) {
                if (!entry || !entry.key) {
                    continue;
                }

                const currentTranslation = this.normalizeCacheValue(entry.translation);
                const newTranslation = currentTranslation.replace(regex, replaceWith);
                if (newTranslation !== currentTranslation) {
                    this.translationCache.set(entry.key, newTranslation);
                    changedKeys.push(entry.key);
                }
            }

            if (!changedKeys.length) {
                return;
            }

            const runtime = ensureTranslationRuntime();
            runtime.persistCache(changedKeys);
            runtime.notifyCacheRuntime('cache-manager-replace');
            this.refreshEntries();
        },

        escapeHtml(text) {
            return String(text)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        },

        escapeRegex(str) {
            return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        },

        highlightText(text, term, fieldType) {
            const normalized = this.normalizeCacheValue(text);
            const escapedText = this.escapeHtml(normalized);

            if (!term || !term.trim()) {
                return escapedText;
            }

            const searchIn = this.searchIn;
            if (fieldType === 'original' && searchIn === 'translation') {
                return escapedText;
            }
            if (fieldType === 'translation' && searchIn === 'original') {
                return escapedText;
            }

            const escapedTerm = this.escapeRegex(this.escapeHtml(term.trim()));
            const regex = new RegExp(`(${escapedTerm})`, 'gi');
            return escapedText.replace(
                regex,
                '<span style="background-color:#ffc107;color:#111;border-radius:2px;padding:0 2px;">$1</span>'
            );
        },

        async copyOriginal(item) {
            const text = item && item.original ? String(item.original) : '';
            if (!text) {
                return;
            }

            try {
                if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(text);
                } else {
                    const textarea = document.createElement('textarea');
                    textarea.value = text;
                    textarea.style.position = 'fixed';
                    textarea.style.top = '-1000px';
                    document.body.appendChild(textarea);
                    textarea.focus();
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                }
            } catch (error) {
                console.warn('[TranslateCacheManagerPanel] Failed to copy original text', error);
            }
        },
    },
};
