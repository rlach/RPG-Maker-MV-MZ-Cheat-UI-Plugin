import { KeyValueStorage } from "../js/KeyValueStorage.js";
import { getRowsPerPage, setRowsPerPage } from "../js/TableSettings.js";
import { createTranslationBatchManager } from "../translate-engines/batch-manager/TranslationBatchManagerFactory.js";
import {
  ensureTranslateCacheRuntime,
  onTranslateCacheRuntimeChanged,
  parseCacheKeyForLangPair,
} from "../js/TranslateCacheRuntime.js";
import { ConfirmDialog } from "../js/DialogHelper.js";
import { ensureTranslationRuntime } from "./translate-on-the-fly/TranslationRuntime.js";

export default {
  name: "TranslateCacheManagerPanel",

  template: `
<v-card flat class="ma-0 pa-0 fill-height panel-with-sticky-table">
    <v-card-title class="subtitle-1 font-weight-bold pb-1">
        Translation Cache Manager
    </v-card-title>

    <v-card-text class="pt-0 pb-1">
        <div class="d-flex align-center justify-space-between">
            <div class="caption grey--text text--lighten-1">
                Active language pair: {{sourceLang}} -> {{targetLang}}
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
          <div class="d-flex align-center" style="gap: 8px;">
            <v-text-field
              v-model="searchInput"
              label="Search original / translation"
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
            <v-btn
              icon
              color="error"
              :disabled="matchingFilterEntryCount <= 0"
              @click="confirmClearTranslationsMatchingFilter">
              <v-icon small>mdi-delete</v-icon>
            </v-btn>
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
                v-text="item.original">
            </div>
        </template>

        <template v-slot:item.translation="{ item }">
            <v-textarea
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
        </template>

        <template v-slot:item.actionsSort="{ item }">
            <div class="d-flex align-center justify-center">
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
            </div>
        </template>
    </v-data-table>
</v-card>
    `,

  data() {
    return {
      searchInput: "",
      search: "",
      page: 1,
      rowsPerPage: getRowsPerPage(),
      sortBy: "seenSort",
      sortDesc: true,
      selectedTypeFilter: "",
      sourceLang: "ja",
      targetLang: "en",
      entries: [],
      draftByKey: {},
      refreshTimer: null,
      searchDebounceTimer: null,
      isTranslatingEmptyStrings: false,
      tableHeaders: [
        {
          text: "Seen",
          value: "seenSort",
          width: 88,
        },
        {
          text: "Type",
          value: "type",
          width: 100,
        },
        {
          text: "Original",
          value: "original",
          width: "40%",
        },
        {
          text: "Translation",
          value: "translation",
          width: "40%",
        },
        {
          text: "Actions",
          value: "actionsSort",
          width: 92,
        },
      ],
    };
  },

  created() {
    this.settingsStorage = new KeyValueStorage(
      "./www/cheat-settings/translate-on-the-fly.json",
    );
    this.cacheStorage = new KeyValueStorage(
      "./www/cheat-settings/translate-cache.json",
    );

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
    this.flushPendingCacheEdits("panel-deactivated");
  },

  beforeDestroy() {
    this.flushPendingCacheEdits("panel-before-destroy");

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
      this.flushPendingCacheEdits("rows-per-page");
    },

    page() {
      this.saveTableState();
      this.flushPendingCacheEdits("page");
    },

    sortBy() {
      this.saveTableState();
      this.flushPendingCacheEdits("sort");
    },

    sortDesc() {
      this.saveTableState();
      this.flushPendingCacheEdits("sort");
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
    matchingFilterEntryCount() {
      return this.getEntriesMatchingFilter(
        this.searchInput,
        this.selectedTypeFilter,
      ).length;
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

      const sortedTypes = Array.from(typeSet).sort((a, b) =>
        a.localeCompare(b),
      );
      return [{ text: "", value: "" }].concat(
        sortedTypes.map((type) => ({ text: type, value: type })),
      );
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
        const json = this.settingsStorage.getItem("data");
        if (!json) {
          return {
            sourceLang: "ja",
            targetLang: "en",
          };
        }

        const data = JSON.parse(json);
        return {
          sourceLang: data.sourceLang || "ja",
          targetLang: data.targetLang || "en",
        };
      } catch (error) {
        return {
          sourceLang: "ja",
          targetLang: "en",
        };
      }
    },

    normalizeCacheValue(value) {
      if (typeof value === "string") {
        return value;
      }

      if (value === null || value === undefined) {
        return "";
      }

      return String(value);
    },

    normalizeTypeFilterValue(value) {
      const normalized = this.normalizeCacheValue(value).trim();
      if (!normalized) {
        return "";
      }

      // Defend against stale/broken persisted state where label text was stored.
      if (normalized.toLowerCase() === "type") {
        return "";
      }

      return normalized;
    },

    ensureSelectedTypeFilterIsValid() {
      const selected = this.normalizeTypeFilterValue(this.selectedTypeFilter);
      if (!selected) {
        if (this.selectedTypeFilter !== "") {
          this.selectedTypeFilter = "";
        }
        return;
      }

      const available = new Set(
        (this.entries || [])
          .map((entry) => this.normalizeCacheValue(entry && entry.type).trim())
          .filter((type) => !!type),
      );

      if (!available.has(selected)) {
        this.selectedTypeFilter = "";
      } else if (this.selectedTypeFilter !== selected) {
        this.selectedTypeFilter = selected;
      }
    },

    formatSeenTimestamp(timestamp) {
      if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return "";
      }

      const date = new Date(timestamp);
      const hh = String(date.getHours()).padStart(2, "0");
      const mm = String(date.getMinutes()).padStart(2, "0");
      const ss = String(date.getSeconds()).padStart(2, "0");
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
        draftValue === null ? item.translation : draftValue,
      );
      return Math.max(2, originalLines, translationLines);
    },

    getDraftValue(item) {
      if (!item || !item.key) {
        return "";
      }

      if (Object.prototype.hasOwnProperty.call(this.draftByKey, item.key)) {
        return this.normalizeCacheValue(this.draftByKey[item.key]);
      }

      return this.normalizeCacheValue(item.translation);
    },

    loadTableState() {
      try {
        const raw = localStorage.getItem(
          "cheat.translateCacheManager.tableState",
        );
        if (!raw) {
          return;
        }

        const parsed = JSON.parse(raw);
        if (typeof parsed.sortBy === "string" && parsed.sortBy.trim() !== "") {
          this.sortBy = parsed.sortBy;
        }
        if (typeof parsed.sortDesc === "boolean") {
          this.sortDesc = parsed.sortDesc;
        }
        if (Number.isFinite(Number(parsed.page)) && Number(parsed.page) > 0) {
          this.page = Number(parsed.page);
        }
        if (typeof parsed.searchInput === "string") {
          this.searchInput = parsed.searchInput;
          this.search = parsed.searchInput;
        }
        if (typeof parsed.selectedTypeFilter === "string") {
          this.selectedTypeFilter = this.normalizeTypeFilterValue(
            parsed.selectedTypeFilter,
          );
        }
      } catch (error) {
        // Ignore malformed state and keep defaults.
      }
    },

    saveTableState() {
      try {
        const payload = {
          sortBy: this.sortBy,
          sortDesc: !!this.sortDesc,
          page: this.page,
          searchInput: this.searchInput,
          selectedTypeFilter: this.selectedTypeFilter,
        };
        localStorage.setItem(
          "cheat.translateCacheManager.tableState",
          JSON.stringify(payload),
        );
      } catch (error) {
        // Ignore persistence failures.
      }
    },

    flushPendingCacheEdits(reason = "unknown") {
      const draftEntries = Object.entries(this.draftByKey || {});
      if (!draftEntries.length) {
        return;
      }

      const changedKeys = [];
      for (const [cacheKey, draftValue] of draftEntries) {
        const normalizedDraft = this.normalizeCacheValue(draftValue);
        const currentValue = this.normalizeCacheValue(
          this.translationCache.get(cacheKey),
        );

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
      runtime.persistCache();
      runtime.notifyCacheRuntime(reason);

      this.refreshEntries();
    },

    refreshEntries() {
      const pair = this.getActiveLanguagePair();
      this.sourceLang = pair.sourceLang;
      this.targetLang = pair.targetLang;

      const items = [];
      for (const [cacheKey, value] of this.translationCache.entries()) {
        const parsed = parseCacheKeyForLangPair(
          cacheKey,
          this.sourceLang,
          this.targetLang,
        );
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

    matchesTypeFilter(item, selectedType = "") {
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

      this.onTranslationInput(item, "");
    },

    getEntriesMatchingFilter(searchValue, selectedType = "") {
      const search = this.normalizeCacheValue(searchValue);
      const term = search === null ? "" : String(search).trim().toLowerCase();
      return (this.entries || []).filter((entry) => {
        if (!this.matchesTypeFilter(entry, selectedType)) {
          return false;
        }

        if (!term) {
          return true;
        }

        return (
          this.normalizeCacheValue(entry && entry.original)
            .toLowerCase()
            .includes(term) ||
          this.normalizeCacheValue(entry && entry.translation)
            .toLowerCase()
            .includes(term)
        );
      });
    },

    confirmClearTranslationsMatchingFilter() {
      const matchingEntries = this.getEntriesMatchingFilter(
        this.searchInput,
        this.selectedTypeFilter,
      );
      if (!matchingEntries.length) {
        return;
      }

      ConfirmDialog.show({
        width: 420,
        message:
          "Are you sure? This cannot be undone and will clear translations for all entries matching the current search filter.",
        actions: [
          {
            icon: "mdi-close",
            label: "No",
            color: "white",
            action: ConfirmDialog.close,
          },
          {
            icon: "mdi-check",
            label: "Yes",
            color: "green",
            action: () => {
              this.clearTranslationsMatchingFilter();
              ConfirmDialog.close();
            },
          },
        ],
      });
    },

    clearTranslationsMatchingFilter() {
      this.flushPendingCacheEdits("cache-manager-pre-clear-filtered");

      const matchingEntries = this.getEntriesMatchingFilter(
        this.searchInput,
        this.selectedTypeFilter,
      );
      let changed = 0;
      for (const entry of matchingEntries) {
        if (!entry || !entry.key) {
          continue;
        }

        const currentValue = this.normalizeCacheValue(
          this.translationCache.get(entry.key),
        );
        if (currentValue === "") {
          continue;
        }

        this.translationCache.set(entry.key, "");
        changed += 1;
      }

      if (!changed) {
        this.refreshEntries();
        return;
      }

      const runtime = ensureTranslationRuntime();
      runtime.persistCache();
      runtime.notifyCacheRuntime("cache-manager-clear-filtered");

      this.refreshEntries();
    },

    async translateEmptyStrings() {
      if (this.isTranslatingEmptyStrings) {
        return;
      }

      let processStarted = false;

      this.flushPendingCacheEdits("cache-manager-pre-translate-empty");

      const runtime = ensureTranslationRuntime();

      const items = [];
      let idCounter = 0;
      for (const [cacheKey, value] of this.translationCache.entries()) {
        const parsed = parseCacheKeyForLangPair(
          cacheKey,
          this.sourceLang,
          this.targetLang,
        );
        if (!parsed) {
          continue;
        }

        if (this.normalizeCacheValue(value) !== "") {
          continue;
        }

        const original = this.normalizeCacheValue(parsed.original);
        if (original.trim() === "") {
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
        if (window.Alert && typeof window.Alert.info === "function") {
          window.Alert.info("No empty translations for current language pair.");
        }
        return;
      }

      if (!runtime.beginNonOtfTranslationProcess("translate empty strings")) {
        return;
      }
      processStarted = true;

      const maxItems =
        Number(runtime.batchItemsLimit) > 0
          ? Number(runtime.batchItemsLimit)
          : 20;
      const maxChars =
        Number(runtime.charLimit) > 0 ? Number(runtime.charLimit) : 1000;

      this.isTranslatingEmptyStrings = true;

      try {
        if (!runtime.batchManager) {
          runtime.batchManager = createTranslationBatchManager(runtime);
        }

        await runtime.batchManager.runBatchedTranslation([
          {
            kind: "emptyStrings",
            items,
            backgroundJob: false,
            itemLimit: maxItems,
            charLimit: maxChars,
            showSummary: true,
          },
        ]);
      } catch (error) {
        console.error(
          "[TranslateCacheManagerPanel] Translate empty strings failed",
          error,
        );
        if (window.Alert && typeof window.Alert.error === "function") {
          window.Alert.error(
            "Translate empty strings failed: " +
              (error && error.message ? error.message : error),
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

    async copyOriginal(item) {
      const text = item && item.original ? String(item.original) : "";
      if (!text) {
        return;
      }

      try {
        if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          const textarea = document.createElement("textarea");
          textarea.value = text;
          textarea.style.position = "fixed";
          textarea.style.top = "-1000px";
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          document.execCommand("copy");
          document.body.removeChild(textarea);
        }
      } catch (error) {
        console.warn(
          "[TranslateCacheManagerPanel] Failed to copy original text",
          error,
        );
      }
    },
  },
};
