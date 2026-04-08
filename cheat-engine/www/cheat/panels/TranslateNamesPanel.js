import { ensureTranslationRuntime } from './translate-on-the-fly/TranslationRuntime.js';
import { createTranslationBatchManager } from '../translate-engines/batch-manager/TranslationBatchManagerFactory.js';

export default {
    name: 'TranslateNamesPanel',

    template: `
<v-card flat class="ma-0 pa-0">
    <v-card-title class="subtitle-1 font-weight-bold">Actor Names</v-card-title>
    <v-card-text class="py-0">
        <div class="caption">
            Actor names from the database and names extracted from game messages (e.g. MZ \\N&lt;name&gt; format).
            Edit translations; translated names are sent to the AI as official hints.
        </div>
        <div class="mt-2 d-flex align-center">
            <v-text-field
                v-model="filter"
                label="Filter"
                dense
                hide-details
                clearable
                @keydown.stop
                style="max-width: 220px;">
            </v-text-field>
            <v-spacer></v-spacer>
            <v-btn small outlined color="primary" class="ml-2" @click="refresh" :loading="loading">
                <v-icon small left>mdi-refresh</v-icon>
                Refresh
            </v-btn>
            <v-btn
                small outlined color="green" class="ml-2"
                :loading="translating"
                :disabled="translating || untranslatedCount === 0"
                @click="translateNames">
                <v-icon small left>mdi-translate</v-icon>
                Translate names ({{ untranslatedCount }})
            </v-btn>
        </div>
        <div class="mt-2 d-flex align-center">
            <v-text-field
                v-model="namePattern"
                label="Name regex pattern (capture group 1 = name)"
                dense
                hide-details
                @keydown.stop
                style="max-width: 320px;">
            </v-text-field>
            <v-btn small outlined color="primary" class="ml-2" @click="lookForNamesInCache">
                <v-icon small left>mdi-magnify</v-icon>
                Look for names in cache
            </v-btn>
        </div>
    </v-card-text>

    <v-card-text class="py-0">
        <div v-if="!loading && filteredEntries.length === 0" class="caption text--secondary mt-2">
            No actor names found.
        </div>

        <v-simple-table v-else dense class="mt-2">
            <thead>
                <tr>
                    <th class="text-left caption" style="width: 55px;">Lp.</th>
                    <th class="text-left caption" style="width: 65px;">Source</th>
                    <th class="text-left caption" style="width: 72px;">Gender</th>
                    <th class="text-left caption" style="width: 30%;">Original Name</th>
                    <th class="text-left caption">Translation</th>
                    <th class="text-left caption" style="width: 92px;"></th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="entry in filteredEntries" :key="entry.cacheKey">
                    <td class="caption white--text">{{ entry.lp }}</td>
                    <td>
                        <v-chip
                            x-small
                            :color="entry.source === 'both' ? 'green darken-3' : entry.source === 'db' ? 'blue darken-3' : 'grey darken-2'">
                            {{ entry.source }}
                        </v-chip>
                    </td>
                    <td>
                        <v-chip
                            x-small
                            :color="entry.gender === '?' ? 'grey darken-2' : entry.gender === 'male' ? 'blue darken-3' : 'pink darken-3'"
                            style="cursor: pointer;"
                            @click="cycleGender(entry)">
                            {{ entry.gender }}
                        </v-chip>
                    </td>
                    <td class="caption white--text">{{ entry.originalName }}</td>
                    <td>
                        <v-text-field
                            :value="entry.translation"
                            dense
                            hide-details
                            @change="onTranslationChange(entry, $event)"
                            @keydown.stop
                            class="mt-0 pt-0">
                        </v-text-field>
                    </td>
                    <td>
                          <div class="d-flex align-center justify-center">
                            <v-tooltip bottom>
                                <template v-slot:activator="{ on, attrs }">
                                <v-btn
                                  icon
                                  x-small
                                  color="primary"
                                  v-bind="attrs"
                                  v-on="on"
                                  @click="copyOriginal(entry)">
                                  <v-icon small>mdi-content-copy</v-icon>
                                </v-btn>
                                </template>
                              <span>Copy original name</span>
                            </v-tooltip>

                            <v-tooltip bottom v-if="entry.source === 'cache'">
                              <template v-slot:activator="{ on, attrs }">
                                <v-btn
                                  icon
                                  x-small
                                  color="error"
                                  v-bind="attrs"
                                  v-on="on"
                                  @click="removeCacheOnlyEntry(entry)">
                                  <v-icon small>mdi-trash-can-outline</v-icon>
                                </v-btn>
                              </template>
                              <span>Remove cache-only name</span>
                            </v-tooltip>
                          </div>
                    </td>
                </tr>
            </tbody>
        </v-simple-table>
    </v-card-text>
</v-card>
    `,

    data() {
        return {
            loading: false,
            translating: false,
            filter: '',
            namePattern: '\\\\N<(.*)>',
            entries: [],
        };
    },

    created() {
        this.refresh();
    },

    activated() {
        this.refresh();
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
                    (entry.translation && entry.translation.toLowerCase().includes(term))
                );
            });
        },

        untranslatedCount() {
            return this.entries.filter((e) => !e.translation || !e.translation.trim()).length;
        },
    },

    methods: {
        getCurrentPairKey() {
            const { sourceLang, targetLang } = this.getLanguagePair();
            return `${sourceLang}-${targetLang}`;
        },

        getNameProfilesForCurrentPair() {
            const runtime = ensureTranslationRuntime();
            const allProfiles =
                runtime && runtime.nameProfilesByLangPair ? runtime.nameProfilesByLangPair : {};
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
                sourceLang: (runtime && runtime.sourceLang) || 'ja',
                targetLang: (runtime && runtime.targetLang) || 'en',
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
                const cache = window.__TranslateOnTheFlyCache;
                const prefix = `actor_name:${sourceLang}-${targetLang}-`;

                // Collect all actor_name cache entries
                const cacheNameMap = new Map();
                if (cache instanceof Map) {
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
                        if (!actor || !actor.name) continue;
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
                            actorId: i,
                        });
                    }
                }

                // Add cache-only entries (not found in DB)
                let cacheOnlyIndex = 0;
                for (const [originalName, translation] of cacheNameMap.entries()) {
                    if (!dbOriginalNames.has(originalName)) {
                        entries.push({
                            lp: 1001 + cacheOnlyIndex,
                            source: 'cache',
                            originalName,
                            translation,
                            gender: this.resolveGender(originalName),
                            cacheKey: this.buildCacheKey(originalName, sourceLang, targetLang),
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
                regex = new RegExp(this.namePattern, 'g');
            } catch (err) {
                console.warn('[TranslateNamesPanel] Invalid regex:', this.namePattern, err);
                if (window.Alert)
                    window.Alert.error(
                        'Invalid regex pattern: ' + (err && err.message ? err.message : err)
                    );
                return;
            }

            const { sourceLang, targetLang } = this.getLanguagePair();
            const cache = window.__TranslateOnTheFlyCache;
            if (!(cache instanceof Map)) {
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
                    if (match[1]) foundNames.add(match[1]);

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
                const cacheKey = this.buildCacheKey(name, sourceLang, targetLang);
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

        async translateNames() {
            if (this.translating) return;

            const runtime = ensureTranslationRuntime();
            const items = [];
            let idCounter = 0;

            for (const entry of this.entries) {
                if (entry.translation && entry.translation.trim()) continue;
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
                        'Translate names failed: ' +
                            (error && error.message ? error.message : error)
                    );
            } finally {
                this.translating = false;
                if (processStarted) runtime.endNonOtfTranslationProcess();
                this.refresh();
            }
        },

        cycleGender(entry) {
            if (!entry || !entry.originalName) {
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
            if (!entry || entry.source !== 'cache' || !entry.cacheKey) {
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

        onTranslationChange(entry, value) {
            entry.translation = value || '';

            const runtime = ensureTranslationRuntime();
            runtime.setCacheValue(entry.cacheKey, entry.translation);

            // Apply to live game actors if the entry is tied to the DB
            if (entry.actorId !== null) {
                const dataActors = window.$dataActors;
                if (Array.isArray(dataActors) && dataActors[entry.actorId]) {
                    dataActors[entry.actorId].name = entry.translation || entry.originalName;
                }
                if (window.$gameActors && typeof window.$gameActors.actor === 'function') {
                    const gameActor = window.$gameActors.actor(entry.actorId);
                    if (gameActor) gameActor._name = entry.translation || entry.originalName;
                }
            }
        },

        async copyOriginal(entry) {
            const text = entry && entry.originalName ? String(entry.originalName) : '';
            if (!text) return;
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
                console.warn('[TranslateNamesPanel] Failed to copy original', error);
            }
        },
    },
};
