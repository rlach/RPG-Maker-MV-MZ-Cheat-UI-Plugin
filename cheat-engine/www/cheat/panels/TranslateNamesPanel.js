import { ensureTranslationRuntime } from '../js/translation-runtime/TranslationRuntime.js';
import { createTranslationBatchManager } from '../translate-engines/batch-manager/TranslationBatchManagerFactory.js';
import { getRowsPerPage, setRowsPerPage } from '../js/TableSettings.js';
import { ConfirmDialog } from '../js/DialogHelper.js';
import { ensureTranslateCacheRuntime, isMapLike } from '../js/TranslateCacheRuntime.js';

export default {
    name: 'TranslateNamesPanel',

    template: `
<v-card flat class="ma-0 pa-0 fill-height panel-with-sticky-table">
    <v-card-title class="subtitle-1 font-weight-bold">Names Manager</v-card-title>
    <v-card-text class="py-0">
        <div class="mt-2 d-flex align-center">
            <v-text-field
                v-model="namePattern"
                label="Name regex pattern (capture group 1 = name)"
                dense
                hide-details
                @keydown.stop
                style="max-width: 320px;">
            </v-text-field>
            <v-btn small color="primary" class="ml-2" @click="openPatternPicker">
                <v-icon small left>mdi-format-list-bulleted</v-icon>
                Select pattern
            </v-btn>
        </div>
        <div class="mt-2 d-flex align-center">
            <v-select
                v-model="officialNameEnforcementMode"
                :items="officialNameEnforcementOptions"
                label="Official name enforcement"
                item-text="text"
                item-value="value"
                dense
                hide-details
                style="max-width: 360px;">
            </v-select>
        </div>
        <div v-if="officialNameEnforcementMode === 'fill_before_llm'" class="mt-2">
            <v-checkbox
                v-model="officialNameEnforcementIncludeAllText"
                dense
                hide-details
                label="Include all text, not just regex">
            </v-checkbox>
        </div>
        <div class="mt-2 d-flex align-center">
            <span class="caption mr-2">Names:</span>
            <v-tooltip bottom>
                <template v-slot:activator="{ on, attrs }">
                    <v-btn
                        small
                        outlined
                        color="primary"
                        v-bind="attrs"
                        v-on="on"
                        @click="lookForNamesInCache">
                        <v-icon small left>mdi-magnify</v-icon>
                        Search
                    </v-btn>
                </template>
                <span>Look for names in cache</span>
            </v-tooltip>
            <v-tooltip bottom>
                <template v-slot:activator="{ on, attrs }">
                    <v-btn
                        small outlined color="green" class="ml-2"
                        :loading="translating"
                        :disabled="translating || untranslatedCount === 0"
                        v-bind="attrs"
                        v-on="on"
                        @click="translateNames">
                        <v-icon small left>mdi-translate</v-icon>
                        Translate ({{ untranslatedCount }})
                    </v-btn>
                </template>
                <span>Translate names</span>
            </v-tooltip>
            <v-tooltip bottom>
                <template v-slot:activator="{ on, attrs }">
                    <v-btn
                        small
                        outlined
                        color="error"
                        class="ml-2"
                        :disabled="cacheOnlyCount === 0"
                        v-bind="attrs"
                        v-on="on"
                        @click="confirmRemoveAllCacheOnlyEntries">
                        <v-icon small left>mdi-trash-can-outline</v-icon>
                        Remove ({{ cacheOnlyCount }})
                    </v-btn>
                </template>
                <span>Remove all cache names</span>
            </v-tooltip>
        </div>
        <div class="mt-2 d-flex align-center">
            <v-tooltip bottom>
                <template v-slot:activator="{ on, attrs }">
                    <v-btn
                        small
                        outlined
                        color="teal"
                        v-bind="attrs"
                        v-on="on"
                        @click="applyTranslatedNamesToDbActors">
                        <v-icon small left>mdi-account-check</v-icon>
                        Apply translations
                    </v-btn>
                </template>
                <span>Apply translated names to actors from the database.</span>
            </v-tooltip>
            <v-checkbox
                v-model="applyOnlyActorsWithOriginalNames"
                class="ml-3 mt-0 pt-0"
                dense
                hide-details
                label="Only actors with original names">
            </v-checkbox>
        </div>
        <div class="mt-2 d-flex align-center">
            <v-text-field
                v-model="filter"
                class="flex-grow-1"
                label="Search"
                solo
                dense
                hide-details
                clearable
                background-color="grey darken-3"
                @keydown.self.stop
                @focus="$event.target.select()">
            </v-text-field>
        </div>
    </v-card-text>

    <v-dialog v-model="patternPickerOpen" max-width="860">
        <v-card dark>
            <v-card-title class="subtitle-1 font-weight-bold">
                Select name pattern
            </v-card-title>
            <v-card-text>
                <div class="caption mb-3">
                    Patterns are used case-insensitively. Capture group 1 must be the character name.
                </div>
                <v-simple-table dense>
                    <thead>
                        <tr>
                            <th class="text-left caption white--text" style="width: 40%;">Pattern</th>
                            <th class="text-left caption white--text">Example</th>
                            <th class="text-right caption white--text" style="width: 92px;"></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="item in predefinedNamePatterns" :key="item.pattern">
                            <td>
                                <pre class="caption mb-0" style="white-space: pre-wrap;">{{ item.pattern }}</pre>
                            </td>
                            <td>
                                <pre class="caption mb-0" style="white-space: pre-wrap;">{{ item.example }}</pre>
                            </td>
                            <td class="text-right">
                                <v-btn x-small color="primary" @click="selectNamePattern(item.pattern)">
                                    Use
                                </v-btn>
                            </td>
                        </tr>
                    </tbody>
                </v-simple-table>
            </v-card-text>
            <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn text @click="patternPickerOpen = false">Close</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>

    <v-data-table
        class="mt-2 table-with-sticky-footer"
        :headers="tableHeaders"
        :items="filteredEntries"
        item-key="rowKey"
        :page.sync="page"
        :sort-by.sync="sortBy"
        :sort-desc.sync="sortDesc"
        :items-per-page.sync="rowsPerPage">
        <template v-slot:item.lp="{ item }">
            <span class="caption white--text">{{ item.lp }}</span>
        </template>

        <template v-slot:item.source="{ item }">
            <v-chip
                x-small
                :color="item.source === 'both' ? 'green darken-3' : item.source === 'db' ? 'blue darken-3' : 'grey darken-2'">
                {{ item.source }}
            </v-chip>
        </template>

        <template v-slot:item.gender="{ item }">
            <v-chip
                x-small
                :color="item.gender === '?' ? 'grey darken-2' : item.gender === 'male' ? 'blue darken-3' : 'pink darken-3'"
                style="cursor: pointer;"
                @click="cycleGender(item)">
                {{ item.gender }}
            </v-chip>
        </template>

        <template v-slot:item.originalName="{ item }">
            <span class="caption white--text">{{ item.originalName }}</span>
        </template>

        <template v-slot:item.translation="{ item }">
            <v-text-field
                :value="item.translation"
                dense
                hide-details
                @change="onTranslationChange(item, $event)"
                @keydown.stop
                class="mt-0 pt-0">
            </v-text-field>
        </template>

        <template v-slot:item.actions="{ item }">
            <div class="d-flex align-center justify-center">
                <v-tooltip bottom>
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
                    <span>Copy original name</span>
                </v-tooltip>

                <v-tooltip bottom v-if="item.source === 'cache'">
                    <template v-slot:activator="{ on, attrs }">
                        <v-btn
                            icon
                            x-small
                            color="error"
                            v-bind="attrs"
                            v-on="on"
                            @click="removeCacheOnlyEntry(item)">
                            <v-icon small>mdi-trash-can-outline</v-icon>
                        </v-btn>
                    </template>
                    <span>Remove cache-only name</span>
                </v-tooltip>
            </div>
        </template>

        <template v-slot:no-data>
            <div v-if="!loading" class="caption text--secondary mt-2">
                No actor names found.
            </div>
        </template>
    </v-data-table>
</v-card>
    `,

    data() {
        return {
            loading: false,
            translating: false,
            filter: '',
            page: 1,
            rowsPerPage: getRowsPerPage(),
            sortBy: 'lp',
            sortDesc: false,
            namePattern: String.raw`\\n\<([^<>]+)\>`,
            officialNameEnforcementMode: 'none',
            officialNameEnforcementIncludeAllText: false,
            applyOnlyActorsWithOriginalNames: true,
            patternPickerOpen: false,
            officialNameEnforcementOptions: [
                {
                    text: 'None',
                    value: 'none',
                },
                {
                    text: 'Fix responses with matching regex',
                    value: 'fix_matching_regex',
                },
                {
                    text: 'Fill in official names before sending to LLM',
                    value: 'fill_before_llm',
                },
            ],
            predefinedNamePatterns: [
                {
                    pattern: String.raw`\\n\<([^<>]+)\>`,
                    example: '\\N<Char Name>\nThe text being spoken.',
                },
                {
                    pattern: String.raw`^([^\[「]+)\n「`,
                    example: 'Char Name\n「The text being spoken.',
                },
                {
                    pattern: String.raw`\\nw\[([^\[\]]+)\]`,
                    example: '\\nw[Char Name]\nThe text being spoken.',
                },
                {
                    pattern: '^([^：]+)：\n',
                    example: 'Char Name：\nThe text being spoken.',
                },
                {
                    pattern: '^「([^」]+)」\n',
                    example: '「Char Name」\nThe text being spoken.',
                },
                {
                    pattern: '^【([^【】]+)】\n',
                    example: '【Char Name】\nThe text being spoken.',
                },
                {
                    pattern: '\\c\\[\\d+\\]([^\\[]+)\\c\\[\\d+\\]\n',
                    example: '\\c[23]Char Name\\c[0]\nThe text being spoken.',
                },
            ],
            tableHeaders: [
                {
                    text: 'Lp.',
                    value: 'lp',
                    width: 55,
                },
                {
                    text: 'Source',
                    value: 'source',
                    sortable: false,
                    width: 65,
                },
                {
                    text: 'Gender',
                    value: 'gender',
                    sortable: false,
                    width: 72,
                },
                {
                    text: 'Original Name',
                    value: 'originalName',
                    width: '30%',
                },
                {
                    text: 'Translation',
                    value: 'translation',
                    sortable: false,
                },
                {
                    text: '',
                    value: 'actions',
                    sortable: false,
                    width: 92,
                },
            ],
            entries: [],
        };
    },

    created() {
        this.refresh();
        const runtime = ensureTranslationRuntime();
        if (runtime) {
            if (runtime.namePatternForEnforcing) {
                this.namePattern = runtime.namePatternForEnforcing;
            }
            if (typeof runtime.officialNameEnforcementMode === 'string') {
                this.officialNameEnforcementMode = runtime.officialNameEnforcementMode;
            }
            if (typeof runtime.officialNameEnforcementIncludeAllText === 'boolean') {
                this.officialNameEnforcementIncludeAllText =
                    runtime.officialNameEnforcementIncludeAllText;
            }
        }
    },

    activated() {
        this.refresh();
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
        filter() {
            this.page = 1;
        },
        namePattern(newVal) {
            const runtime = ensureTranslationRuntime();
            if (runtime) {
                runtime.namePatternForEnforcing = newVal;
                runtime.saveSettings();
            }
        },
        officialNameEnforcementMode(newVal) {
            const runtime = ensureTranslationRuntime();
            if (runtime) {
                runtime.officialNameEnforcementMode = newVal;
                runtime.saveSettings();
            }
        },
        officialNameEnforcementIncludeAllText(newVal) {
            const runtime = ensureTranslationRuntime();
            if (runtime) {
                runtime.officialNameEnforcementIncludeAllText = newVal;
                runtime.saveSettings();
            }
        },
    },

    computed: {
        filteredEntries() {
            const term = (this.filter || '').toLowerCase();
            if (!term) {
                return this.entries;
            }
            return this.entries.filter((entry) => {
                return (
                    entry.originalName.toLowerCase().includes(term) ||
                    entry.translation?.toLowerCase().includes(term)
                );
            });
        },

        untranslatedCount() {
            return this.entries.filter((e) => !e.translation?.trim()).length;
        },

        cacheOnlyCount() {
            return this.entries.filter((entry) => entry.source === 'cache').length;
        },
    },

    methods: {
        openPatternPicker() {
            this.patternPickerOpen = true;
        },

        selectNamePattern(pattern) {
            this.namePattern = pattern;
            this.patternPickerOpen = false;
        },

        getCurrentPairKey() {
            const { sourceLang, targetLang } = this.getLanguagePair();
            return `${sourceLang}-${targetLang}`;
        },

        getNameProfilesForCurrentPair() {
            const runtime = ensureTranslationRuntime();
            const allProfiles = runtime?.nameProfilesByLangPair
                ? runtime.nameProfilesByLangPair
                : {};
            const pairKey = this.getCurrentPairKey();
            const pairProfiles = allProfiles[pairKey];
            if (!pairProfiles || typeof pairProfiles !== 'object') {
                return {};
            }
            return pairProfiles;
        },

        saveNameProfile(originalName, patch) {
            if (!originalName) {
                return;
            }

            const runtime = ensureTranslationRuntime();
            if (
                !runtime.nameProfilesByLangPair ||
                typeof runtime.nameProfilesByLangPair !== 'object'
            ) {
                runtime.nameProfilesByLangPair = {};
            }

            const pairKey = this.getCurrentPairKey();
            if (
                !runtime.nameProfilesByLangPair[pairKey] ||
                typeof runtime.nameProfilesByLangPair[pairKey] !== 'object'
            ) {
                runtime.nameProfilesByLangPair[pairKey] = {};
            }

            if (!patch || typeof patch !== 'object') {
                delete runtime.nameProfilesByLangPair[pairKey][originalName];
            } else {
                const existingProfile = runtime.nameProfilesByLangPair[pairKey][originalName];
                const mergedProfile = {};

                if (existingProfile && typeof existingProfile === 'object') {
                    Object.assign(mergedProfile, existingProfile);
                }
                Object.assign(mergedProfile, patch);

                runtime.nameProfilesByLangPair[pairKey][originalName] = mergedProfile;
            }

            runtime.saveSettings();
        },

        resolveGender(originalName) {
            const profile = this.getNameProfilesForCurrentPair()[originalName];
            const gender = profile && typeof profile.gender === 'string' ? profile.gender : '';
            return gender === 'male' || gender === 'female' ? gender : '?';
        },

        getLanguagePair() {
            const runtime = ensureTranslationRuntime();
            return {
                sourceLang: runtime?.sourceLang || 'ja',
                targetLang: runtime?.targetLang || 'en',
            };
        },

        buildCacheKey(originalName, sourceLang, targetLang) {
            return `actor_name:${sourceLang}-${targetLang}-${originalName}`;
        },

        extractSearchableCacheContent(cacheKey) {
            if (typeof cacheKey !== 'string') {
                return '';
            }

            const firstColon = cacheKey.indexOf(':');
            let payload = firstColon >= 0 ? cacheKey.slice(firstColon + 1) : cacheKey;

            // Hide implementation detail like "ja-en-" from user regex matching.
            payload = payload.replace(/^[a-z]{2}(?:-[A-Za-z]{2})?-[a-z]{2}(?:-[A-Za-z]{2})?-/, '');
            return payload;
        },

        refresh() {
            this.loading = true;
            try {
                const { sourceLang, targetLang } = this.getLanguagePair();
                const { cache } = ensureTranslateCacheRuntime();
                const prefix = `actor_name:${sourceLang}-${targetLang}-`;

                // Collect all actor_name cache entries
                const cacheNameMap = new Map();
                if (isMapLike(cache)) {
                    for (const [key, value] of cache.entries()) {
                        if (key.startsWith(prefix)) {
                            const name = key.slice(prefix.length);
                            if (name) cacheNameMap.set(name, value || '');
                        }
                    }
                }

                const dbOriginalNames = new Set();
                const entries = [];

                // Load DB actors
                const dataActors = window.$dataActors;
                if (Array.isArray(dataActors)) {
                    for (let i = 1; i < dataActors.length; i++) {
                        const actor = dataActors[i];
                        if (!actor?.name) continue;
                        const originalName = actor._translateOriginal
                            ? actor._translateOriginal.name
                            : actor.name;
                        if (!originalName) continue;

                        dbOriginalNames.add(originalName);
                        const cacheKey = this.buildCacheKey(originalName, sourceLang, targetLang);
                        const inCache = cacheNameMap.has(originalName);

                        entries.push({
                            lp: i,
                            source: inCache ? 'both' : 'db',
                            originalName,
                            translation: inCache ? cacheNameMap.get(originalName) : '',
                            gender: this.resolveGender(originalName),
                            cacheKey,
                            rowKey: `db:${i}:${originalName}`,
                            actorId: i,
                        });
                    }
                }

                // Add cache-only entries (not found in DB)
                let cacheOnlyIndex = 0;
                for (const [originalName, translation] of cacheNameMap.entries()) {
                    if (
                        !dbOriginalNames.has(originalName) &&
                        !dbOriginalNames.has(originalName.trim())
                    ) {
                        entries.push({
                            lp: 1001 + cacheOnlyIndex,
                            source: 'cache',
                            originalName,
                            translation,
                            gender: this.resolveGender(originalName),
                            cacheKey: this.buildCacheKey(originalName, sourceLang, targetLang),
                            rowKey: `cache:${cacheOnlyIndex}:${originalName}`,
                            actorId: null,
                        });
                        cacheOnlyIndex++;
                    }
                }

                this.entries = entries;
            } catch (err) {
                console.warn('[TranslateNamesPanel] Failed to refresh', err);
                this.entries = [];
            } finally {
                this.loading = false;
            }
        },

        lookForNamesInCache() {
            if (!this.namePattern) {
                return;
            }

            let regex;
            try {
                regex = new RegExp(this.namePattern, 'gi');
            } catch (err) {
                console.warn('[TranslateNamesPanel] Invalid regex:', this.namePattern, err);
                if (window.Alert)
                    window.Alert.error(
                        'Invalid regex pattern: ' + (err?.message ? err.message : err)
                    );
                return;
            }

            const { sourceLang, targetLang } = this.getLanguagePair();
            const { cache } = ensureTranslateCacheRuntime();
            if (!isMapLike(cache)) {
                this.refresh();
                return;
            }

            const foundNames = new Set();
            for (const key of cache.keys()) {
                const searchableContent = this.extractSearchableCacheContent(key);
                if (!searchableContent) {
                    continue;
                }

                regex.lastIndex = 0;
                let match;
                while ((match = regex.exec(searchableContent)) !== null) {
                    const trimmedName = match[1]?.trim();
                    if (trimmedName) foundNames.add(trimmedName);

                    // Guard against zero-length regex matches causing infinite loops.
                    if (match[0] === '') {
                        regex.lastIndex += 1;
                    }
                }
            }

            if (foundNames.size === 0) {
                if (window.Alert) window.Alert.info('No names found in cache with this pattern.');
                return;
            }

            const changedKeys = [];
            for (const name of foundNames) {
                const nameWithoutColor = name.replace(/\\c\[\d+\]/g, '').trim();
                if (this.nameIsTag(nameWithoutColor)) {
                    continue;
                }
                const cacheKey = this.buildCacheKey(nameWithoutColor, sourceLang, targetLang);
                if (!cache.has(cacheKey)) {
                    cache.set(cacheKey, '');
                    changedKeys.push(cacheKey);
                }
            }

            if (changedKeys.length > 0) {
                const runtime = ensureTranslationRuntime();
                runtime.persistCache(changedKeys);
                runtime.notifyCacheRuntime('names-panel-found-names');
            }

            this.refresh();
        },

        nameIsTag(cacheKey) {
            // Detect tags \N[\d+] or \V[\d+] patterns as they are used for dynamic content and not suitable for name translation.
            return /^\\N\[\d+\]$/.test(cacheKey) || /^\\V\[\d+\]$/.test(cacheKey);
        },

        async translateNames() {
            if (this.translating) return;

            const runtime = ensureTranslationRuntime();
            const items = [];
            let idCounter = 0;

            for (const entry of this.entries) {
                if (entry.translation?.trim()) continue;
                items.push({
                    type: 'actor_name',
                    id: `actor_name_${idCounter++}`,
                    value: entry.originalName,
                    cacheKey: entry.cacheKey,
                });
            }

            if (!items.length) {
                if (window.Alert) window.Alert.info('All names are already translated.');
                return;
            }

            if (!runtime.beginNonOtfTranslationProcess('translate names')) {
                return;
            }

            this.translating = true;
            let processStarted = true;

            try {
                if (!runtime.batchManager) {
                    runtime.batchManager = createTranslationBatchManager(runtime);
                }

                const maxItems =
                    Number(runtime.batchItemsLimit) > 0 ? Number(runtime.batchItemsLimit) : 20;
                const maxChars = Number(runtime.charLimit) > 0 ? Number(runtime.charLimit) : 1000;

                await runtime.batchManager.runBatchedTranslation([
                    {
                        kind: 'directItems',
                        items,
                        backgroundJob: false,
                        translationPhaseLabel: 'names',
                        showSummary: true,
                        itemLimit: maxItems,
                        charLimit: maxChars,
                    },
                ]);
            } catch (error) {
                console.error('[TranslateNamesPanel] Translate names failed', error);
                if (window.Alert)
                    window.Alert.error(
                        'Translate names failed: ' + (error?.message ? error.message : error)
                    );
            } finally {
                this.translating = false;
                if (processStarted) runtime.endNonOtfTranslationProcess();
                this.refresh();
            }
        },

        cycleGender(entry) {
            if (!entry?.originalName) {
                return;
            }

            let nextGender = 'male';
            if (entry.gender === 'male') {
                nextGender = 'female';
            } else if (entry.gender === 'female') {
                nextGender = '?';
            }

            entry.gender = nextGender;
            if (nextGender === '?') {
                this.saveNameProfile(entry.originalName, null);
            } else {
                this.saveNameProfile(entry.originalName, { gender: nextGender });
            }
        },

        removeCacheOnlyEntry(entry) {
            if (entry?.source !== 'cache' || !entry.cacheKey) {
                return;
            }

            const runtime = ensureTranslationRuntime();
            runtime.translationCache.delete(entry.cacheKey);
            runtime.persistCache([entry.cacheKey]);
            runtime.notifyCacheRuntime('names-panel-remove-cache-only', entry.cacheKey);

            if (entry.originalName) {
                this.saveNameProfile(entry.originalName, null);
            }

            this.refresh();
        },

        removeAllCacheOnlyEntries() {
            const cacheOnlyEntries = this.entries.filter(
                (entry) => entry?.source === 'cache' && entry.cacheKey
            );
            if (cacheOnlyEntries.length === 0) {
                return;
            }

            const runtime = ensureTranslationRuntime();
            const uniqueKeys = Array.from(new Set(cacheOnlyEntries.map((entry) => entry.cacheKey)));

            for (const cacheKey of uniqueKeys) {
                runtime.translationCache.delete(cacheKey);
            }

            for (const entry of cacheOnlyEntries) {
                if (entry.originalName) {
                    this.saveNameProfile(entry.originalName, null);
                }
            }

            runtime.persistCache(uniqueKeys);
            runtime.notifyCacheRuntime('names-panel-remove-all-cache-only');
            this.refresh();
        },

        confirmRemoveAllCacheOnlyEntries() {
            if (this.cacheOnlyCount <= 0) {
                return;
            }

            ConfirmDialog.show({
                width: 420,
                message:
                    'Remove all cache-only names?\nThis cannot be undone and keeps DB/both names unchanged.',
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
                            this.removeAllCacheOnlyEntries();
                            ConfirmDialog.close();
                        },
                    },
                ],
            });
        },

        getSpawnedGameActor(actorId) {
            if (!window.$gameActors || !Array.isArray(window.$gameActors._data)) {
                return null;
            }

            const safeActorId = Number(actorId);
            if (!Number.isFinite(safeActorId) || safeActorId <= 0) {
                return null;
            }

            return window.$gameActors._data[safeActorId] || null;
        },

        onTranslationChange(entry, value) {
            entry.translation = value || '';

            const runtime = ensureTranslationRuntime();
            runtime.setCacheValue(entry.cacheKey, entry.translation);

            const normalizedTranslation = entry.translation?.trim();
            if (normalizedTranslation) {
                this.saveNameProfile(entry.originalName, { translation: normalizedTranslation });
            }

            // Apply only to already spawned in-game actor instances.
            // Never mutate DB actor names ($dataActors[*].name), because original name is immutable key.
            if (entry.actorId !== null) {
                const gameActor = this.getSpawnedGameActor(entry.actorId);
                if (gameActor) {
                    gameActor._name = entry.translation || entry.originalName;
                }
            }
        },

        applyTranslatedNamesToDbActors() {
            const onlyOriginal = !!this.applyOnlyActorsWithOriginalNames;
            let updatedCount = 0;
            let skippedCount = 0;

            for (const entry of this.entries) {
                if (entry.actorId === null) {
                    continue;
                }

                const translatedName = entry.translation?.trim();
                if (!translatedName) {
                    continue;
                }

                const gameActor = this.getSpawnedGameActor(entry.actorId);
                if (!gameActor) {
                    // Not spawned in current session; do not create instances implicitly.
                    continue;
                }

                const originalName = entry.originalName || '';
                const currentSpawnedName = gameActor._name || '';

                if (onlyOriginal && currentSpawnedName !== originalName) {
                    skippedCount += 1;
                    continue;
                }

                gameActor._name = translatedName;

                updatedCount += 1;
            }

            if (window.Alert) {
                const modeLabel = onlyOriginal ? 'only actors with original names' : 'all actors';
                window.Alert.info(
                    `Applied translated names to ${updatedCount} spawned actor(s) (${modeLabel}). Skipped: ${skippedCount}.`
                );
            }

            this.refresh();
        },

        async copyOriginal(entry) {
            const text = entry?.originalName ? String(entry.originalName) : '';
            if (!text) return;
            try {
                if (navigator?.clipboard?.writeText) {
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
                console.warn('[TranslateNamesPanel] Failed to copy original', error);
            }
        },
    },
};
