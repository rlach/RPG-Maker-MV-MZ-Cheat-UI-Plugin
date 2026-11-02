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
import { ensureTranslationRuntime } from '../js/translation-runtime/TranslationRuntime.js';
import { BOXING_SERVICE } from '../components/BoxingModal.js';

const cacheManagerTableStateMemory = {
    sortBy: 'seenSort',
    sortDesc: true,
    page: 1,
    searchInput: '',
    selectedTypeFilter: '',
    searchIn: 'both',
    onlyEmpty: false,
};

export default {
    name: 'TranslateCacheManagerPanel',

    template: `
<v-card flat class="ma-0 pa-0 fill-height panel-with-sticky-table">
    <v-card-title class="text-subtitle-1 font-weight-bold pb-1">
        Translation Cache Manager
    </v-card-title>

    <v-card-text class="pt-0 pb-1">
        <div class="d-flex align-center justify-space-between">
            <cheat-tooltip location="bottom">
                <template v-slot:activator="{ props: activatorProps }">
                    <div
                        class="text-caption text-grey-lighten-1"
                        v-bind="activatorProps"
                        >
                        {{ activeLanguagePairLabel }}
                    </div>
                </template>
                <span>{{ activeLanguagePairTooltip }}</span>
            </cheat-tooltip>
            <div class="d-flex align-center" style="gap: 4px;">
                <v-btn size="small" variant="text"
                    color="primary"
                    :loading="isTranslatingEmptyStrings"
                    :disabled="isTranslatingEmptyStrings"
                    @click="translateEmptyStrings">
                    Translate empty
                </v-btn>
                <v-btn size="small" variant="text"
                    color="secondary"
                    @click="openBoxingModal">
                    Boxing...
                </v-btn>
            </div>
        </div>
    </v-card-text>

    <v-data-table return-object
      class="mt-1 table-with-sticky-footer"
        :headers="uiTableHeaders(tableHeaders)"
        :items="filteredEntries"
        v-model:page="page"
        :sort-by="uiTableSort(sortBy, sortDesc)" @update:sort-by="updateUiTableSort($event, 'sortBy', 'sortDesc')"

        v-model:items-per-page="rowsPerPage">
                <template v-slot:top>
                    <div>
                        <div class="d-flex align-center" style="gap: 8px;">
                            <v-text-field
                                v-model="searchInput"
                                :label="searchFieldLabel" variant="solo" single-line density="compact"
                                hide-details
                                bg-color="grey-darken-3"
                                @keydown.stop>
                            </v-text-field>
                            <v-select
                                v-model="selectedTypeFilter"
                                :items="typeFilterOptions"
                                label="Type"
                                item-title="text"
                                item-value="value" variant="solo" single-line density="compact"
                                clearable
                                hide-details
                                bg-color="grey-darken-3"
                                style="max-width: 220px;"
                                @keydown.stop>
                            </v-select>
                            <cheat-tooltip location="bottom">
                                <template v-slot:activator="{ props: activatorProps }">
                                    <v-btn variant="text" icon size="small" v-bind="activatorProps"  @click="searchExpanded = !searchExpanded">
                                        <v-icon size="small">{{ searchExpanded ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
                                    </v-btn>
                                </template>
                                <span>{{ searchExpanded ? 'Hide options' : 'More options' }}</span>
                            </cheat-tooltip>
                        </div>
                        <div v-if="searchExpanded" class="d-flex align-center mt-1" style="gap: 8px;">
                            <v-text-field
                                v-model="replaceInput"
                                label="Replace" variant="solo" single-line density="compact"
                                hide-details
                                bg-color="grey-darken-3"
                                @keydown.stop>
                            </v-text-field>
                            <v-btn size="small"
                                color="primary"
                                :disabled="replaceButtonDisabled"
                                @click="performReplace">
                                Replace
                            </v-btn>
                            <span class="text-caption text-grey-lighten-1" style="white-space: nowrap;">Search in:</span>
                            <v-select
                                v-model="searchIn"
                                :items="searchInOptions"
                                item-title="text"
                                item-value="value" variant="solo" single-line density="compact"
                                hide-details
                                bg-color="grey-darken-3"
                                style="max-width: 180px;"
                                @keydown.stop>
                            </v-select>
                            <v-btn variant="text"
                                icon size="small"
                                color="error"
                                :disabled="matchingFilterEntryCount <= 0"
                                @click="confirmClearTranslationsMatchingFilter">
                                <v-icon size="small">mdi-delete</v-icon>
                            </v-btn>
                        </div>
                        <div v-if="searchExpanded" class="d-flex align-center mt-1" style="gap: 8px;">
                            <v-switch
                                v-model="onlyEmpty"
                                label="Only empty"
                                inset density="compact"
                                hide-details
                                class="mt-0 pt-0"
                                @keydown.stop>
                            </v-switch>
                        </div>
                    </div>
                </template>

        <template v-slot:item.seenSort="{ item }">
            <span class="text-caption">{{item.seenDisplay}}</span>
        </template>

        <template v-slot:item.type="{ item }">
            <span class="text-caption">{{item.type}}</span>
        </template>

        <template v-slot:item.original="{ item }">
            <div
                class="text-caption text-white"
                style="white-space: pre-wrap; word-break: break-word;"
                v-html="highlightText(item.original, searchHighlightTerm, 'original')">
            </div>
        </template>

        <template v-slot:item.translation="{ item }">
            <v-textarea
                v-if="editingKey === item.key"
                :model-value="getDraftValue(item)"
                :rows="getRowLineCount(item, getDraftValue(item))"
                auto-grow
                no-resize variant="outlined" density="compact"
                hide-details
                class="mt-0 pt-0"
                @update:model-value="onTranslationInput(item, $event)"
                @keydown.stop>
            </v-textarea>
            <div
                v-else
                class="text-caption text-white"
                style="white-space: pre-wrap; word-break: break-word;"
                v-html="highlightText(getDraftValue(item), searchHighlightTerm, 'translation')">
            </div>
        </template>

        <template v-slot:item.actionsSort="{ item }">
            <div class="d-flex align-center justify-center" style="gap: 2px;">
                <template v-if="editingKey === item.key">
                    <v-btn variant="text" icon size="x-small" color="success" @click="saveEdit">
                        <v-icon size="small">mdi-check</v-icon>
                    </v-btn>
                    <v-btn variant="text" icon size="x-small" color="grey" @click="cancelEdit">
                        <v-icon size="small">mdi-close</v-icon>
                    </v-btn>
                </template>
                <template v-else>
                    <cheat-tooltip location="bottom">
                        <span>Edit translation</span>
                        <template v-slot:activator="{ props: activatorProps }">
                            <v-btn variant="text"
                                icon size="x-small"
                                color="primary"
                                v-bind="activatorProps"

                                @click="startEdit(item)">
                                <v-icon size="small">mdi-pencil</v-icon>
                            </v-btn>
                        </template>
                    </cheat-tooltip>
                    <cheat-tooltip location="bottom">
                        <span>Copy original text</span>
                        <template v-slot:activator="{ props: activatorProps }">
                            <v-btn variant="text"
                                icon size="x-small"
                                color="primary"
                                v-bind="activatorProps"

                                @click="copyOriginal(item)">
                                <v-icon size="small">mdi-content-copy</v-icon>
                            </v-btn>
                        </template>
                    </cheat-tooltip>
                    <cheat-tooltip location="bottom">
                        <span>Remove translation</span>
                        <template v-slot:activator="{ props: activatorProps }">
                            <v-btn variant="text"
                                icon size="x-small"
                                color="error"
                                v-bind="activatorProps"

                                @click="clearTranslation(item)">
                                <v-icon size="small">mdi-close</v-icon>
                            </v-btn>
                        </template>
                    </cheat-tooltip>
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
            onlyEmpty: false,
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

        this.unsubscribeRuntime = onTranslateCacheRuntimeChanged((detail) => {
            if (detail?.reason === 'cache-manager-remove-translation' && detail.key) {
                this.updateEntryTranslation(detail.key);
                return;
            }
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

    beforeUnmount() {
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

        onlyEmpty() {
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

        activeLanguagePairTooltip() {
            const { translatedKeyLength, totalKeyLength } = computeLangPairCompletionByKeyLength({
                translationCache: this.translationCache,
                sourceLang: this.sourceLang,
                targetLang: this.targetLang,
            });
            const translated = translatedKeyLength;
            const total = totalKeyLength;
            return `${translated} out of ${total} characters`;
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
            if (typeof state.onlyEmpty === 'boolean') {
                this.onlyEmpty = state.onlyEmpty;
            }
        },

        saveTableState() {
            cacheManagerTableStateMemory.sortBy = this.sortBy;
            cacheManagerTableStateMemory.sortDesc = !!this.sortDesc;
            cacheManagerTableStateMemory.page = this.page;
            cacheManagerTableStateMemory.searchInput = this.searchInput;
            cacheManagerTableStateMemory.selectedTypeFilter = this.selectedTypeFilter;
            cacheManagerTableStateMemory.searchIn = this.searchIn;
            cacheManagerTableStateMemory.onlyEmpty = !!this.onlyEmpty;
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
            this.draftByKey[item.key] = normalized;
        },

        clearTranslation(item) {
            if (!item || !item.key) {
                return;
            }

            delete this.draftByKey[item.key];
            this.translationCache.set(item.key, '');
            this.updateEntryTranslation(item.key);
            const runtime = ensureTranslationRuntime();
            runtime.persistCache([item.key]);
            runtime.notifyCacheRuntime('cache-manager-remove-translation', item.key);
        },

        updateEntryTranslation(cacheKey) {
            const index = this.entries.findIndex((entry) => entry.key === cacheKey);
            if (index < 0) return;
            const translation = this.normalizeCacheValue(this.translationCache.get(cacheKey));
            if (this.entries[index].translation === translation) return;
            this.entries.splice(index, 1, { ...this.entries[index], translation });
        },

        isEmptyTranslationEntry(entry) {
            return this.normalizeCacheValue(entry?.translation).trim() === '';
        },

        matchesSearchTermByScope(entry, term, searchIn) {
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
        },

        getEntriesMatchingFilter(searchValue, selectedType = '') {
            const search = this.normalizeCacheValue(searchValue);
            const term = search === null ? '' : String(search).trim().toLowerCase();
            const searchIn = this.searchIn;
            return (this.entries || []).filter((entry) => {
                if (!this.matchesTypeFilter(entry, selectedType)) {
                    return false;
                }

                if (!this.matchesSearchTermByScope(entry, term, searchIn)) {
                    return false;
                }

                if (!this.onlyEmpty) {
                    return true;
                }

                return this.isEmptyTranslationEntry(entry);
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

        openBoxingModal() {
            BOXING_SERVICE.openModal();
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
            this.draftByKey[item.key] = this.normalizeCacheValue(this.getDraftValue(item));
        },

        saveEdit() {
            this.flushPendingCacheEdits('save-edit');
        },

        cancelEdit() {
            if (this.editingKey) {
                delete this.draftByKey[this.editingKey];
            }
            this.editingKey = null;
        },

        performReplace() {
            const searchTerm = this.normalizeCacheValue(this.searchInput).trim();
            if (!searchTerm) {
                return;
            }

            const replaceWith = this.normalizeCacheValue(this.replaceInput);
            const matching = this.getEntriesMatchingFilter(
                this.searchInput,
                this.selectedTypeFilter
            );
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
