import { getRowsPerPage, setRowsPerPage } from "../js/TableSettings.js";
import { ensureTranslationRuntime } from "./translate-on-the-fly/TranslationRuntime.js";
import { TAG_CONFIGS } from "../translate-engines/ai-engine/constants.js";

const TABLE_STATE_KEY = "cheat.translateTagManager.tableState";
const UNKNOWN_TAGS_STORAGE_KEY = "cheat.unknownTagsScan";

export default {
  name: "TranslateTagManagerPanel",

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
            Find possible unknown tags
        </v-btn>
        <v-btn
            v-if="isAiEngine"
            small
            outlined
            color="primary"
            @click="openAddCustomTagDialog">
            <v-icon small left>mdi-plus</v-icon>
            Add custom tag
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
                <template v-if="item.tagSource === 'custom'">
                    <v-btn icon x-small color="primary" @click="openEditCustomTagDialog(item.tag, item.customIndex)">
                        <v-icon small>mdi-pencil</v-icon>
                    </v-btn>
                    <v-btn icon x-small color="error" @click="removeCustomTag(item.customIndex)">
                        <v-icon small>mdi-delete</v-icon>
                    </v-btn>
                </template>
            </div>
        </template>
    </v-data-table>

    <!-- Add / Edit custom tag dialog -->
    <v-dialog v-model="customTagDialogVisible" max-width="560" @keydown.stop>
        <v-card dark class="pt-2">
            <v-card-title class="subtitle-1 font-weight-bold">
                {{ customTagEditIndex >= 0 ? 'Edit Custom Tag' : 'Add Custom Tag' }}
            </v-card-title>
            <v-card-text>
                <v-text-field
                    v-model="customTagForm.description"
                    label="Description"
                    outlined
                    dense
                    hide-details
                    @keydown.stop
                    class="mb-2"
                ></v-text-field>

                <v-text-field
                    v-model="customTagForm.tagSymbol"
                    label="Tag Symbol"
                    outlined
                    dense
                    hide-details
                    @keydown.stop
                    class="mb-2"
                ></v-text-field>

                <v-select
                    v-model="customTagForm.style"
                    :items="tagStyleOptions"
                    label="Style"
                    outlined
                    dense
                    hide-details
                    @keydown.stop
                    class="mb-2"
                ></v-select>

                <v-select
                    v-model="customTagForm.type"
                    :items="tagTypeOptions"
                    label="Type"
                    outlined
                    dense
                    hide-details
                    @keydown.stop
                    class="mb-2"
                ></v-select>

                <v-checkbox
                    v-model="customTagForm.requiredConsistency"
                    label="Required consistency"
                    hide-details
                    class="mt-0 mb-2"
                ></v-checkbox>

                <template v-if="customTagForm.type === 'withCustomParameter'">
                    <v-select
                        v-model="customTagForm.bracket"
                        :items="customTagBracketOptionsForStyle"
                        label="Bracket"
                        outlined
                        dense
                        hide-details
                        @keydown.stop
                        class="mb-2"
                    ></v-select>

                    <v-checkbox
                        v-model="customTagForm.maskValue"
                        label="Mask value (preserve exact value, LLM cannot change it)"
                        hide-details
                        class="mt-0"
                    ></v-checkbox>
                </template>
            </v-card-text>
            <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn text color="grey" @click="closeCustomTagDialog">Cancel</v-btn>
                <v-btn text color="primary" @click="saveCustomTag">Save</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>

    <!-- Find Unknown Tags modal -->
    <v-dialog v-model="findUnknownTagsVisible" max-width="700" @keydown.stop>
        <v-card dark class="pt-2">
            <v-card-title class="subtitle-1 font-weight-bold d-flex align-center">
                <span>Find Possible Unknown Tags</span>
                <v-spacer></v-spacer>
                <v-btn
                    small
                    outlined
                    color="primary"
                    :loading="isScanning"
                    @click="scanCacheForUnknownTags">
                    <v-icon small left>mdi-refresh</v-icon>
                    Scan cache
                </v-btn>
            </v-card-title>

            <v-card-text class="pb-1">
                <div v-if="unknownTagsList.length === 0 && !isScanning" class="caption grey--text text--lighten-1">
                    No unknown tags found. Click "Scan cache" to scan for unrecognized tag patterns in the translation cache.
                </div>
            </v-card-text>

            <v-data-table
                v-if="unknownTagsList.length > 0"
                :headers="unknownTagsHeaders"
                :items="unknownTagsList"
                :items-per-page="20"
                :sort-by="'count'"
                :sort-desc="true"
                dense
                class="mx-4"
                style="background: transparent;">
                <template v-slot:item.pattern="{ item }">
                    <span class="caption font-weight-bold" style="font-family: monospace;">{{ item.pattern }}</span>
                </template>
                <template v-slot:item.count="{ item }">
                    <span class="caption">{{ item.count }}</span>
                </template>
                <template v-slot:item.add="{ item }">
                    <v-btn icon x-small color="primary" @click="openAddCustomTagFromUnknown(item)">
                        <v-icon small>mdi-plus</v-icon>
                    </v-btn>
                </template>
            </v-data-table>

            <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn text color="grey" @click="findUnknownTagsVisible = false">Close</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</v-card>
  `,

  data() {
    return {
      runtime: null,
      entries: [],

      searchInput: "",
      search: "",
      page: 1,
      rowsPerPage: getRowsPerPage(),
      sortBy: "description",
      sortDesc: false,
      selectedTypeFilter: "",
      searchDebounceTimer: null,

      tableHeaders: [
        { text: "Tag", value: "tagDisplay", width: 160, sortable: true },
        { text: "Type", value: "tagSource", width: 90, sortable: true },
        { text: "Description", value: "description" },
        { text: "Actions", value: "actions", width: 80, sortable: false },
      ],

      typeFilterOptions: [
        { text: "All", value: "" },
        { text: "default", value: "default" },
        { text: "plugin", value: "plugin" },
        { text: "custom", value: "custom" },
      ],

      // Custom tag dialog
      customTagDialogVisible: false,
      customTagEditIndex: -1,
      customTagForm: {
        description: "",
        tagSymbol: "",
        type: "withNumericParameter",
        requiredConsistency: false,
        style: "escape",
        bracket: "<",
        maskValue: false,
      },

      // Static options (populated from runtime engine or fallback defaults)
      tagStyleOptions: [
        { text: "Escape style (\\Symbol)", value: "escape" },
        { text: "XML style (<Symbol>)", value: "xml" },
      ],
      tagTypeOptions: [
        { text: "withNumericParameter", value: "withNumericParameter" },
        { text: "withoutParameter", value: "withoutParameter" },
        { text: "withCustomParameter", value: "withCustomParameter" },
      ],
      tagBracketOptions: [
        { text: "< >", value: "<" },
        { text: "[ ]", value: "[" },
        { text: "( )", value: "(" },
        { text: "{ }", value: "{" },
        { text: "none (xml :value)", value: "none" },
      ],

      // Find unknown tags
      findUnknownTagsVisible: false,
      unknownTagsList: [],
      isScanning: false,
      unknownTagsHeaders: [
        { text: "Pattern", value: "pattern" },
        { text: "Count", value: "count", width: 90 },
        { text: "Add", value: "add", width: 60, sortable: false },
      ],
    };
  },

  created() {
    this.runtime = ensureTranslationRuntime();
    this.loadTableState();
    this.refreshEntries();
    this.unknownTagsList = this.loadUnknownTagsFromStorage();
  },

  activated() {
    if (this.runtime) {
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
      if (parsed !== val) { this.rowsPerPage = parsed; return; }
      setRowsPerPage(parsed);
      this.saveTableState();
    },
    page() { this.saveTableState(); },
    sortBy() { this.saveTableState(); },
    sortDesc() { this.saveTableState(); },
    searchInput(value) { this.scheduleSearchDebounce(value); },
    search() { this.saveTableState(); },
    selectedTypeFilter() { this.saveTableState(); },
  },

  computed: {
    isAiEngine() {
      if (!this.runtime) return false;
      const e = this.runtime.translationEngine;
      return e === "openApi" || e === "gpt4all";
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
            e.tagDisplay.toLowerCase().includes(q),
        );
      }
      return result;
    },

    customTagBracketOptionsForStyle() {
      const all = this.tagBracketOptions;
      if (this.customTagForm.style === "xml") return all;
      return all.filter((o) => o.value !== "none");
    },
  },

  methods: {
    refreshEntries() {
      const entries = [];

      // 1. Default tags from TAG_CONFIGS
      for (const tag of TAG_CONFIGS) {
        entries.push({
          tagDisplay: this.formatTagDisplay(tag),
          tagSource: "default",
          description: tag.description,
          tag,
          customIndex: -1,
        });
      }

      // 2. Plugin tags (only exist on AI engine)
      const engine = this.runtime && this.runtime.engine;
      if (engine && Array.isArray(engine.pluginTags)) {
        for (const tag of engine.pluginTags) {
          const pluginName = tag._pluginName || "unknown";
          entries.push({
            tagDisplay: this.formatTagDisplay(tag),
            tagSource: "plugin",
            description: `${pluginName}: ${tag.description}`,
            tag,
            customIndex: -1,
          });
        }
      }

      // 3. Custom tags (bound via runtime proxy aiCustomTags)
      const customTags =
        this.runtime && Array.isArray(this.runtime.aiCustomTags)
          ? this.runtime.aiCustomTags
          : [];
      customTags.forEach((tag, idx) => {
        entries.push({
          tagDisplay: this.formatTagDisplay(tag),
          tagSource: "custom",
          description: tag.description,
          tag,
          customIndex: idx,
        });
      });

      this.entries = entries;

      // Sync option arrays from engine if available
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
      const sym = tag.tagSymbol || "?";
      if (tag.style === "xml") {
        if (tag.type === "withNumericParameter") return `<${sym}:N>`;
        if (tag.type === "withCustomParameter") return `<${sym}:…>`;
        return `<${sym}>`;
      }
      // legacy TAG_TYPE.XML
      if (tag.type === "xml") return `<${sym}>`;
      // escape style
      if (tag.type === "withNumericParameter") return `\\${sym}[N]`;
      if (tag.type === "withCustomParameter") {
        const open = tag.bracket && tag.bracket !== "none" ? tag.bracket : "<";
        const close = { "<": ">", "[": "]", "(": ")", "{": "}" }[open] || ">";
        return `\\${sym}${open}…${close}`;
      }
      return `\\${sym}`;
    },

    callRuntime(methodName, ...args) {
      if (!this.runtime) {
        this.runtime = ensureTranslationRuntime();
      }
      if (!this.runtime || typeof this.runtime[methodName] !== "function") {
        throw new Error(`Translation runtime method is missing: ${methodName}`);
      }
      const result = this.runtime[methodName](...args);
      if (result && typeof result.then === "function") {
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

    loadTableState() {
      try {
        const raw = localStorage.getItem(TABLE_STATE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (typeof parsed.sortBy === "string" && parsed.sortBy.trim()) this.sortBy = parsed.sortBy;
        if (typeof parsed.sortDesc === "boolean") this.sortDesc = parsed.sortDesc;
        if (Number.isFinite(Number(parsed.page)) && Number(parsed.page) > 0) this.page = Number(parsed.page);
        if (typeof parsed.searchInput === "string") { this.searchInput = parsed.searchInput; this.search = parsed.searchInput; }
        if (typeof parsed.selectedTypeFilter === "string") this.selectedTypeFilter = parsed.selectedTypeFilter;
      } catch (_) { /* ignore */ }
    },

    saveTableState() {
      try {
        localStorage.setItem(TABLE_STATE_KEY, JSON.stringify({
          sortBy: this.sortBy,
          sortDesc: !!this.sortDesc,
          page: this.page,
          searchInput: this.searchInput,
          selectedTypeFilter: this.selectedTypeFilter,
        }));
      } catch (_) { /* ignore */ }
    },

    // ---- Custom Tag CRUD ----

    openAddCustomTagDialog() {
      this.customTagEditIndex = -1;
      this.customTagForm = {
        description: "",
        tagSymbol: "",
        type: "withNumericParameter",
        requiredConsistency: false,
        style: "escape",
        bracket: "<",
        maskValue: false,
      };
      this.customTagDialogVisible = true;
    },

    openEditCustomTagDialog(tag, index) {
      this.customTagEditIndex = index;
      this.customTagForm = {
        description: String(tag.description || ""),
        tagSymbol: String(tag.tagSymbol || ""),
        type: String(tag.type || "withNumericParameter"),
        requiredConsistency: !!tag.requiredConsistency,
        style: String(tag.style || "escape"),
        bracket: String(tag.bracket || "<"),
        maskValue: !!tag.maskValue,
      };
      this.customTagDialogVisible = true;
    },

    closeCustomTagDialog() {
      this.customTagDialogVisible = false;
    },

    saveCustomTag() {
      const payload = {
        description: String(this.customTagForm.description || "").trim(),
        tagSymbol: String(this.customTagForm.tagSymbol || "").trim(),
        type: String(this.customTagForm.type || "withNumericParameter"),
        requiredConsistency: !!this.customTagForm.requiredConsistency,
        style: String(this.customTagForm.style || "escape"),
      };
      if (payload.type === "withCustomParameter") {
        payload.bracket = String(this.customTagForm.bracket || (payload.style === "xml" ? "none" : "<"));
        payload.maskValue = !!this.customTagForm.maskValue;
      }

      if (this.customTagEditIndex >= 0) {
        this.callRuntime("updateAiCustomTag", this.customTagEditIndex, payload);
      } else {
        this.callRuntime("addAiCustomTag", payload);
      }
      this.callRuntime("bindEngineConfigTo", this.runtime);

      // If this save was triggered from unknown-tag flow, remove matched pattern
      if (this._pendingUnknownTagPattern !== null) {
        this.unknownTagsList = this.unknownTagsList.filter(
          (u) => u.pattern !== this._pendingUnknownTagPattern,
        );
        this.saveUnknownTagsToStorage(this.unknownTagsList);
        this._pendingUnknownTagPattern = null;
      }

      this.closeCustomTagDialog();
    },

    removeCustomTag(index) {
      this.callRuntime("removeAiCustomTag", index);
      this.callRuntime("bindEngineConfigTo", this.runtime);
    },

    // ---- Find Unknown Tags ----

    openFindUnknownTags() {
      this.findUnknownTagsVisible = true;
    },

    loadUnknownTagsFromStorage() {
      try {
        const raw = localStorage.getItem(UNKNOWN_TAGS_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        return [];
      }
    },

    saveUnknownTagsToStorage(list) {
      try {
        localStorage.setItem(UNKNOWN_TAGS_STORAGE_KEY, JSON.stringify(list));
      } catch (_) { /* ignore */ }
    },

    scanCacheForUnknownTags() {
      if (!this.runtime) return;
      const engine = this.runtime.engine;
      if (!engine || typeof engine.scanForUnknownTags !== "function") return;

      this.isScanning = true;
      this.unknownTagsList = [];

      // Use setTimeout to allow UI to update (show loading) before potentially heavy scan
      setTimeout(() => {
        try {
          const cache = this.runtime.translationCache;
          const results = engine.scanForUnknownTags(cache || new Map());
          this.unknownTagsList = results;
          this.saveUnknownTagsToStorage(results);
        } catch (err) {
          console.warn("[TagManager] scanForUnknownTags failed:", err);
        } finally {
          this.isScanning = false;
        }
      }, 0);
    },

    guessConfigFromPattern(pattern) {
      // XML style: <SYM>, <SYM:N>, <SYM:…>
      const xmlMatch = /^<([A-Za-z][A-Za-z0-9]*)(?::(.+))?>$/.exec(pattern);
      if (xmlMatch) {
        const sym = xmlMatch[1];
        const val = xmlMatch[2];
        let type = "withoutParameter";
        if (val === "N") type = "withNumericParameter";
        else if (val === "…") type = "withCustomParameter";
        return {
          description: sym.toLowerCase(),
          tagSymbol: sym,
          style: "xml",
          type,
          bracket: "none",
          maskValue: false,
          requiredConsistency: false,
        };
      }

      // Escape style: \SYM, \SYM[N], \SYM[…], \SYM<…>, \SYM(…), \SYM{…}
      const escMatch = /^\\([A-Za-z${}|.!><^][A-Za-z0-9]*)(.*)$/.exec(pattern);
      if (escMatch) {
        const sym = escMatch[1];
        const rest = escMatch[2] || "";
        let type = "withoutParameter";
        let bracket = "<";
        if (rest === "[N]") {
          type = "withNumericParameter";
        } else if (rest === "[…]") {
          type = "withCustomParameter";
          bracket = "[";
        } else if (rest === "<…>") {
          type = "withCustomParameter";
          bracket = "<";
        } else if (rest === "(…)") {
          type = "withCustomParameter";
          bracket = "(";
        } else if (rest === "{…}") {
          type = "withCustomParameter";
          bracket = "{";
        }
        return {
          description: sym.toLowerCase(),
          tagSymbol: sym,
          style: "escape",
          type,
          bracket,
          maskValue: false,
          requiredConsistency: false,
        };
      }

      return {
        description: "",
        tagSymbol: "",
        style: "escape",
        type: "withNumericParameter",
        bracket: "<",
        maskValue: false,
        requiredConsistency: false,
      };
    },

    openAddCustomTagFromUnknown(unknownTag) {
      this._pendingUnknownTagPattern = unknownTag.pattern;
      const guessed = this.guessConfigFromPattern(unknownTag.pattern);
      this.customTagEditIndex = -1;
      this.customTagForm = guessed;
      this.customTagDialogVisible = true;
    },
  },
};
