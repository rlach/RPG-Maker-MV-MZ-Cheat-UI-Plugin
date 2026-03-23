import { Alert } from "../js/AlertHelper.js";
import { MessageCheat, GeneralCheat } from "../js/CheatHelper.js";
import { KeyValueStorage } from "../js/KeyValueStorage.js";
import { TranslateOnTheFlyState } from "../js/TranslateOnTheFlyState.js";
import { TRANSLATE_SETTINGS, TRANSLATOR } from "../js/TranslateHelper.js";
import {
  ensureTranslateCacheRuntime,
  notifyTranslateCacheRuntimeChanged,
} from "../js/TranslateCacheRuntime.js";
import {
  AIEngine,
  createEngine,
  getAvailableEngines,
} from "../translate-engines/index.js";
import { BatchSummaryReporter } from "../translate-engines/batch-manager/BatchSummaryReporter.js";
import { TranslationBatchManager } from "../translate-engines/batch-manager/TranslationBatchManager.js";
import { translateOnTheFlyFlowMethods } from "./translate-on-the-fly/TranslateOnTheFlyFlowMethods.js";
import { translateOnTheFlyRuntimeMethods } from "./translate-on-the-fly/TranslateOnTheFlyRuntimeMethods.js";

export default {
  name: "TranslateOnTheFlyPanel",

  template: `
<v-card flat class="ma-0 pa-0">
    <v-card-subtitle class="pb-0 font-weight-bold">Translate Messages</v-card-subtitle>
    <v-card-text class="pb-0">
        Enable this to automatically translate all in-game messages using Google Translate.
    </v-card-text>
    
    <v-card-text class="py-0">
        <v-switch
            v-model="enabled"
            label="Enable Real-time Translation"
            dense
            hide-details
            @click.self.stop
            @change="onChangeEnabled">
        </v-switch>

        <v-switch
            v-model="translateCacheWhenDisabled"
            label="Translate cached keys even when Real-time translation is disabled"
            dense
            hide-details
            @click.self.stop
            @change="onChangeCacheOnly">
        </v-switch>

        <v-switch
            v-model="tryTranslateAhead"
            label="Translate full event instead of single message"
            dense
            hide-details
            @click.self.stop
            @change="onChangeTryTranslateAhead">
        </v-switch>

        <v-switch
            v-model="translateGameObjects"
            label="Translate game objects in the background"
            dense
            hide-details
            @click.self.stop
            @change="onChangeTranslateGameObjects">
        </v-switch>

        <v-switch
            v-model="cancelBackgroundForOnTheFly"
            label="Allow cancelling of background translations when on-the-fly is needed"
            dense
            hide-details
            @click.self.stop
            @change="onChangeCancelBackgroundForOnTheFly">
        </v-switch>
    </v-card-text>

    <v-card-subtitle class="pb-0 mt-4 font-weight-bold">Language Settings</v-card-subtitle>
    
    <v-card-text class="py-0">
        <v-select
            v-model="translationEngine"
            :items="translationEngineOptions"
            label="Translation Engine"
            outlined
            dense
            hide-details
            @change="onChangeTranslationEngine"
            class="mb-2">
        </v-select>

        <v-select
            v-model="sourceLang"
            :items="languageOptions"
            label="Source Language"
            outlined
            dense
            hide-details
            @change="onChangeSourceLang"
            class="mb-2">
        </v-select>
        
        <v-select
            v-model="targetLang"
            :items="languageOptions"
            label="Target Language"
            outlined
            dense
            hide-details
            @change="onChangeTargetLang">
        </v-select>

        <!-- Engine-specific configuration -->
        <!-- LibreTranslate config -->
        <div v-if="translationEngine === 'libretranslate'" class="mt-3">
            <v-text-field
                v-model="libreTranslateHost"
                label="LibreTranslate Host"
                outlined
                dense
                hide-details
                @keydown.stop
                @change="onChangeLibreTranslateHost"
                class="mb-2"
            ></v-text-field>
            <v-text-field
                v-model="libreTranslateApiKey"
                label="LibreTranslate API Key (optional)"
                outlined
                dense
                hide-details
                type="password"
                @keydown.stop
                @change="onChangeLibreTranslateApiKey"
            ></v-text-field>
        </div>

        <!-- AI Engine (OpenAPI compatible / Open WebUI) config -->
        ${AIEngine.getConfigTemplate()}
        </div>
    </v-card-text>

    <v-card-subtitle class="pb-0 mt-4 font-weight-bold">Text Wrapping</v-card-subtitle>
    
    <v-card-text class="py-0">
        <v-switch
            v-model="enableTextWrapping"
            label="Keep translated strings under max width (in characters)"
            dense
            hide-details
            @click.self.stop
            @change="onChangeTextWrapping">
        </v-switch>
    </v-card-text>
    
    <v-card-text class="py-0">
        <v-text-field
            v-model.number="maxLineWidth"
            label="Maximum line width for dialogue"
            outlined
            dense
            type="number"
            min="20"
            max="200"
            hide-details
            :disabled="!enableTextWrapping"
            @keydown.self.stop
            @change="onChangeMaxWidth"
            @focus="$event.target.select()">
        </v-text-field>

        <v-text-field
            v-model.number="descriptionMaxLineWidth"
            label="Maximum line width for descriptions (items, skills etc.)"
            outlined
            dense
            type="number"
            min="20"
            max="200"
            hide-details
            :disabled="!enableTextWrapping"
            @keydown.self.stop
            @change="onChangeDescriptionMaxWidth"
            @focus="$event.target.select()">
        </v-text-field>
    </v-card-text>

    <v-card-subtitle class="pb-0 mt-4 font-weight-bold">Batching</v-card-subtitle>
    <v-card-text class="py-0">
        <v-text-field
            v-model.number="charLimit"
            label="Max characters per translation batch"
            outlined
            dense
            type="number"
            min="200"
            max="10000"
            hide-details
            @keydown.self.stop
            @change="onChangeCharLimit"
            class="mb-2"
        ></v-text-field>

        <v-text-field
            v-model.number="batchItemsLimit"
            label="Max items per translation batch"
            outlined
            dense
            type="number"
            min="1"
            max="100"
            hide-details
            @keydown.self.stop
            @change="onChangeBatchItemsLimit"
        ></v-text-field>
    </v-card-text>
    
    <v-card-subtitle class="pb-0 mt-4 font-weight-bold">Translation Status</v-card-subtitle>
    <v-card-text class="py-0">
        <div class="caption">
            <div>Total Translations: {{translationCount}}</div>
            <div>Cached Texts: {{cachedCount}}</div>
        </div>
    </v-card-text>
    
    <v-card-text class="py-2">
      <v-btn
        small
        outlined
        color="primary"
        class="mr-2"
        @click="openObjectTranslationModal">
        <v-icon small left>mdi-translate</v-icon>
        Translate items
      </v-btn>

        <v-btn
            small
            outlined
            color="warning"
            :disabled="cachedCount === 0"
            @click="clearCache">
            <v-icon small left>mdi-delete</v-icon>
            Clear Cache
        </v-btn>
    </v-card-text>

    <v-dialog v-model="objectTranslationDialogVisible" max-width="640">
        <v-card dark>
            <v-card-title class="subtitle-1 font-weight-bold">Object Translation</v-card-title>
            <v-card-text class="caption pb-1">Select what to translate. Counts show remaining objects and total.</v-card-text>
            <v-card-text class="pt-1">
                <div
                    v-for="item in objectTranslationModalStats"
                    :key="item.id"
                    class="d-flex align-center justify-space-between py-1"
                >
                    <v-checkbox
                        v-model="objectTranslationSelection[item.id]"
                        :label="item.label"
                        :disabled="item.total <= 0"
                        hide-details
                        dense
                        class="ma-0 pa-0"
                    ></v-checkbox>
                    <span class="caption grey--text text--lighten-1">left {{item.left}} of {{item.total}}</span>
                </div>

                  <v-divider class="my-3"></v-divider>

                  <div
                    v-for="item in objectTranslationModalExtraStats"
                    :key="item.id"
                    class="d-flex align-center justify-space-between py-1"
                  >
                    <v-checkbox
                      v-model="objectTranslationSelection[item.id]"
                      :label="item.label"
                      :disabled="item.total <= 0"
                      hide-details
                      dense
                      class="ma-0 pa-0"
                    ></v-checkbox>
                      <div class="d-flex align-center">
                        <span class="caption grey--text text--lighten-1 mr-2">{{item.metaText}}</span>
                        <v-btn
                        v-if="item.id === 'mapEvents'"
                        icon
                        x-small
                        color="grey lighten-1"
                        :disabled="item.total <= 0"
                        @click.stop="openMapEventsSelectionModal"
                        >
                        <v-icon small>mdi-cog</v-icon>
                        </v-btn>
                      </div>
                  </div>
            </v-card-text>
            <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn text color="grey" @click="closeObjectTranslationModal">Cancel</v-btn>
                <v-btn text color="primary" @click="startObjectTranslationFromModal">Start</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>

              <v-dialog v-model="objectTranslationMapEventsDialogVisible" max-width="760">
                <v-card dark>
                  <v-card-title class="subtitle-1 font-weight-bold">Map events selection</v-card-title>
                  <v-card-text class="caption pb-1">Choose which maps should be included in object translation.</v-card-text>
                  <v-card-text class="pt-1">
                    <v-text-field
                      v-model="objectTranslationMapEventsSearch"
                      label="Search maps"
                      solo
                      dense
                      hide-details
                      background-color="grey darken-3"
                      class="mb-2"
                      @keydown.self.stop
                      @focus="$event.target.select()"
                    ></v-text-field>

                    <div class="d-flex justify-end mb-2">
                      <v-btn text small color="primary" @click="selectAllMapEventsForObjectTranslation">Select all</v-btn>
                      <v-btn text small color="grey lighten-1" @click="deselectAllMapEventsForObjectTranslation">Deselect all</v-btn>
                    </div>

                    <div v-if="objectTranslationMapEventsLoading" class="caption grey--text text--lighten-1 py-4 text-center">
                      Loading map statistics...
                    </div>

                    <div v-else style="max-height: 420px; overflow-y: auto;">
                      <div
                        v-for="item in filteredObjectTranslationMapEventDetails"
                        :key="item.id"
                        class="d-flex align-center justify-space-between py-1"
                      >
                        <v-checkbox
                          v-model="objectTranslationMapEventDraftSelection[item.id]"
                          :label="item.label"
                          :disabled="item.totalStrings <= 0"
                          hide-details
                          dense
                          class="ma-0 pa-0"
                        ></v-checkbox>
                        <span class="caption grey--text text--lighten-1">left {{item.leftStrings}} of {{item.totalStrings}}</span>
                      </div>
                    </div>
                  </v-card-text>
                  <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn text color="grey" @click="closeMapEventsSelectionModal">Cancel</v-btn>
                    <v-btn text color="primary" :disabled="objectTranslationMapEventsLoading" @click="saveMapEventsSelection">Save</v-btn>
                  </v-card-actions>
                </v-card>
              </v-dialog>
</v-card>
    `,

  data() {
    const engineOptions = getAvailableEngines();
    return {
      enabled: false,
      sourceLang: "ja",
      targetLang: "en",
      translationCount: 0,
      enableTextWrapping: true,
      maxLineWidth: 60,
      descriptionMaxLineWidth: 59,
      translationEngine: "mymemory",
      translateCacheWhenDisabled: false,
      tryTranslateAhead: true,
      translateGameObjects: true,
      cancelBackgroundForOnTheFly: false,
      // Batching / performance
      charLimit: 1000,
      batchItemsLimit: 20,
      spinnerActiveCount: 0,
      translationEngineOptions: engineOptions,
      engineSettings: {}, // Stores engine-specific configuration
      engine: null, // Current engine instance
      languageOptions: [
        { text: "English", value: "en" },
        { text: "Japanese (日本語)", value: "ja" },
        { text: "Spanish (Español)", value: "es" },
        { text: "French (Français)", value: "fr" },
        { text: "German (Deutsch)", value: "de" },
        { text: "Italian (Italiano)", value: "it" },
        { text: "Portuguese (Português)", value: "pt" },
        { text: "Russian (Русский)", value: "ru" },
        { text: "Korean (한국어)", value: "ko" },
        { text: "Chinese Simplified (简体中文)", value: "zh-CN" },
        { text: "Chinese Traditional (繁體中文)", value: "zh-TW" },
        { text: "Polish (Polski)", value: "pl" },
      ],
      // Engine-specific UI defaults to avoid runtime reactivity warnings
      // LibreTranslate
      libreTranslateHost: "http://127.0.0.1:5000",
      libreTranslateApiKey: "",
      // AI Engine (OpenAPI compatible / Open WebUI)
      aiProvider: "openApi",
      aiProviderOptions: [
        { text: "OpenAPI compatible", value: "openApi" },
        { text: "Open WebUI", value: "openwebui" },
      ],
      aiHost: "http://localhost:4891",
      aiApiKey: "",
      aiSelectedModel: "",
      aiModels: [],
      aiLoadingModels: false,
      aiModelsError: "",
      aiAllowNewlineMismatch: false,
      aiAskIfTextTranslated: true,
      aiInvalidJsonHandlingStrategy: "resendFirstHalf",
      aiInvalidJsonHandlingStrategyOptions: [
        { text: "Split into two half-batches", value: "resendFirstHalf" },
        { text: "Ask AI to fix it", value: "askAIToFix" },
        { text: "Use JsonFixer", value: "useJsonFixer" },
        { text: "None", value: "none" },
      ],
      aiSystemPrompt:
        "You are translating scripts that contain [[tags]]. Altering contents or order of any such tags, removing or adding tags will break the script. DO NOT REMOVE OR ADD ANY TAGS. Only translate the text, do not comment or add anything else. Do not bold, DO NOT FORMAT THE RESPONSE, RETURN IT ALL IN ONE LINE",
      // Track the current message window and $gameMessage for live refresh
      currentMessageWindow: null,
      currentGameMessage: null,
      useJsonFixer: true,
      aiFixRecursionMaxDepth: 0,
      objectTranslationDialogVisible: false,
      objectTranslationModalStats: [],
      objectTranslationModalExtraStats: [],
      objectTranslationSelection: {},
      objectTranslationSelectedMapIds: null,
      objectTranslationMapEventsDialogVisible: false,
      objectTranslationMapEventsLoading: false,
      objectTranslationMapEventsSearch: "",
      objectTranslationMapEventDetails: [],
      objectTranslationMapEventDraftSelection: {},
      objectTranslationJob: {
        active: false,
        currentTypeLabel: "",
        currentDone: 0,
        currentTotal: 0,
        totalDone: 0,
        totalTarget: 0,
        runErrors: 0,
      },
    };
  },

  created() {
    this.kvStorage = new KeyValueStorage(
      "./www/cheat-settings/translate-on-the-fly.json",
    );
    this.cacheStorage = new KeyValueStorage(
      "./www/cheat-settings/translate-cache.json",
    );
    const runtime = ensureTranslateCacheRuntime(
      window.__TranslateOnTheFlyCache || new Map(),
    );
    this.translationCache = runtime.cache;
    this.lastSeenByCacheKey = runtime.lastSeenByCacheKey;
    this.pendingTranslations = new Map();
    this.failedTranslations = new Map(); // Track failed translation attempts to prevent retry spam
    this.translationInProgress = false;
    this._foregroundDialogBatchState = {
      active: false,
      operationKey: "",
      sourceTrigger: "",
      startedAt: 0,
      promise: null,
    };
    this._foregroundBatchWatchdogMs = 60000;
    this._foregroundPreemptedOperationKey = "";
    this.loadSettings(); // Load settings first so 'enabled' is set
    this.loadCacheFromDisk();

    // Create engine instance after settings are loaded
    this.engine = createEngine(this.translationEngine, this);
    this.batchManager = new TranslationBatchManager(this);

    // Restore engine-specific settings if available
    if (this.engineSettings && this.engineSettings[this.translationEngine]) {
      const engineConfig = this.engineSettings[this.translationEngine];
      Object.assign(this.engine, engineConfig);
    }

    // Bind engine config data to panel for reactivity (always sync)
    const engineConfigData = this.engine.getConfigData();
    Object.keys(engineConfigData).forEach((key) => {
      this.$set(this, key, engineConfigData[key]);
    });

    // Bind engine config methods to panel
    const engineConfigMethods = this.engine.getConfigMethods();
    Object.keys(engineConfigMethods).forEach((methodName) => {
      if (!this[methodName]) {
        this[methodName] = engineConfigMethods[methodName].bind(this.engine);
      }
    });

    this.deferHookInitialization();

    console.log(
      "[TranslateOnTheFly] init created enabled=",
      this.enabled,
      "state=",
      TranslateOnTheFlyState.isEnabled(),
    );

    this.stateUnsubscribe = TranslateOnTheFlyState.subscribe((enabled) => {
      this.enabled = enabled;
    });

    window.__TranslateOnTheFlyPanel = this;
    console.log(
      "[TOF-DEBUG][TranslateOnTheFlyPanel] created and exposed on window",
      {
        deferredOpenFlag: !!window.__TOF_OPEN_OBJECT_TRANSLATION_MODAL__,
      },
    );

    if (window.__TOF_OPEN_OBJECT_TRANSLATION_MODAL__) {
      window.__TOF_OPEN_OBJECT_TRANSLATION_MODAL__ = false;
      setTimeout(() => {
        console.log(
          "[TOF-DEBUG][TranslateOnTheFlyPanel] deferred open flag consumed -> opening object translation modal",
        );
        this.openObjectTranslationModal();
      }, 0);
    }

    if (this.translateCacheWhenDisabled) {
      console.log(
        "[TranslateOnTheFly] Applying cached translations to data objects",
      );
      this.applyCachedTranslationsToData();
    }
  },

  beforeDestroy() {
    if (this.stateUnsubscribe) {
      this.stateUnsubscribe();
      this.stateUnsubscribe = null;
    }

    if (this._spinnerEl && this._spinnerEl.parentNode) {
      this._spinnerEl.parentNode.removeChild(this._spinnerEl);
      this._spinnerEl = null;
    }

    if (this._spinnerStyle && this._spinnerStyle.parentNode) {
      this._spinnerStyle.parentNode.removeChild(this._spinnerStyle);
      this._spinnerStyle = null;
    }

    if (
      this._objectTranslationModalEl &&
      this._objectTranslationModalEl.parentNode
    ) {
      this._objectTranslationModalEl.parentNode.removeChild(
        this._objectTranslationModalEl,
      );
      this._objectTranslationModalEl = null;
    }

    if (
      this._objectTranslationModalStyle &&
      this._objectTranslationModalStyle.parentNode
    ) {
      this._objectTranslationModalStyle.parentNode.removeChild(
        this._objectTranslationModalStyle,
      );
      this._objectTranslationModalStyle = null;
    }
  },

  computed: {
    cachedCount() {
      return this.translationCache ? this.translationCache.size : 0;
    },

    filteredObjectTranslationMapEventDetails() {
      const items = Array.isArray(this.objectTranslationMapEventDetails)
        ? this.objectTranslationMapEventDetails
        : [];
      const search = (this.objectTranslationMapEventsSearch || "")
        .trim()
        .toLowerCase();

      if (!search) {
        return items;
      }

      return items.filter((item) => {
        const label = String(item.label || "").toLowerCase();
        const id = String(item.id || "").toLowerCase();
        return label.includes(search) || id.includes(search);
      });
    },
  },

  methods: {
    deferHookInitialization() {
      if (this._hookInitialized) {
        return;
      }

      // Try delayed hook setup to ensure RPG Maker classes are ready after startup
      setTimeout(() => {
        if (this._hookInitialized) {
          return;
        }
        this.setupTranslationHook();
        this._hookInitialized = true;
        console.log("[TranslateOnTheFly] Hook initialized (delayed)");
      }, 1000);
    },

    loadSettings() {
      const json = this.kvStorage.getItem("data");

      if (!json) {
        // Use defaults
        this.enabled = false;
        this.sourceLang = "ja";
        this.enableTextWrapping = true;
        this.maxLineWidth = 60;
        this.translateCacheWhenDisabled = false;
        this.tryTranslateAhead = false;
        TranslateOnTheFlyState.setEnabled(this.enabled, { notify: false });
        return;
      }

      const data = JSON.parse(json);
      this.enabled = data.enabled || false;
      this.sourceLang = data.sourceLang || "ja";
      this.targetLang = data.targetLang || "en";
      this.translationCount = data.translationCount || 0;
      this.enableTextWrapping =
        data.enableTextWrapping !== undefined ? data.enableTextWrapping : true;
      this.maxLineWidth = data.maxLineWidth || 60;
      this.descriptionMaxLineWidth = data.descriptionMaxLineWidth || 59;
      this.charLimit = data.charLimit || 1000;
      this.batchItemsLimit = data.batchItemsLimit || 20;
      const savedEngine = data.translationEngine || "mymemory";
      this.translationEngine =
        savedEngine === "gpt4all" ? "openApi" : savedEngine;
      this.translateCacheWhenDisabled =
        data.translateCacheWhenDisabled || false;
      this.tryTranslateAhead = data.tryTranslateAhead || false;
      this.translateGameObjects =
        data.translateGameObjects !== undefined
          ? data.translateGameObjects
          : true;
      this.cancelBackgroundForOnTheFly =
        data.cancelBackgroundForOnTheFly !== undefined
          ? data.cancelBackgroundForOnTheFly
          : false;

      // Load engine-specific settings
      this.engineSettings = data.engineSettings || {};
      if (this.engineSettings.gpt4all && !this.engineSettings.openApi) {
        this.engineSettings.openApi = this.engineSettings.gpt4all;
        delete this.engineSettings.gpt4all;
      }

      TranslateOnTheFlyState.setEnabled(this.enabled, { notify: false });
    },

    saveSettings() {
      // Collect engine-specific settings before saving
      if (this.engine) {
        const engineConfig = { ...this.engine.getConfigData() };
        if (!this.engineSettings) {
          this.engineSettings = {};
        }
        this.engineSettings[this.translationEngine] = engineConfig;
      }

      const data = {
        enabled: TranslateOnTheFlyState.isEnabled(),
        sourceLang: this.sourceLang,
        targetLang: this.targetLang,
        translationCount: this.translationCount,
        enableTextWrapping: this.enableTextWrapping,
        maxLineWidth: this.maxLineWidth,
        descriptionMaxLineWidth: this.descriptionMaxLineWidth,
        charLimit: this.charLimit,
        batchItemsLimit: this.batchItemsLimit,
        translationEngine: this.translationEngine,
        translateCacheWhenDisabled: this.translateCacheWhenDisabled,
        tryTranslateAhead: this.tryTranslateAhead,
        translateGameObjects: this.translateGameObjects,
        cancelBackgroundForOnTheFly: this.cancelBackgroundForOnTheFly,
        engineSettings: this.engineSettings || {},
      };
      this.kvStorage.setItem("data", JSON.stringify(data));
    },

    onChangeCacheOnly() {
      // When real-time is enabled, this flag is ignored; still persist for when disabled later
      this.saveSettings();
      this.notifyCacheRuntime("settings-cache-only");
    },

    onChangeTryTranslateAhead() {
      this.saveSettings();
    },

    onChangeTranslateGameObjects() {
      this.saveSettings();
    },

    onChangeCancelBackgroundForOnTheFly() {
      this.saveSettings();
    },

    getObjectTranslationTypeDefs() {
      return [
        {
          id: "items",
          label: "items",
          kind: "data",
          getContainer: () => window.$dataItems,
          fields: ["name", "description", "note"],
          cachePrefix: "item",
        },
        {
          id: "skills",
          label: "skills",
          kind: "data",
          getContainer: () => window.$dataSkills,
          fields: ["name", "description", "message1", "message2"],
          cachePrefix: "skill",
        },
        {
          id: "classes",
          label: "classes",
          kind: "data",
          getContainer: () => window.$dataClasses,
          fields: ["name"],
          cachePrefix: "class",
        },
        {
          id: "enemies",
          label: "enemies",
          kind: "data",
          getContainer: () => window.$dataEnemies,
          fields: ["name"],
          cachePrefix: "enemy",
        },
        {
          id: "armors",
          label: "armors",
          kind: "data",
          getContainer: () => window.$dataArmors,
          fields: ["name", "description"],
          cachePrefix: "armor",
        },
        {
          id: "weapons",
          label: "weapons",
          kind: "data",
          getContainer: () => window.$dataWeapons,
          fields: ["name", "description"],
          cachePrefix: "weapon",
        },
        {
          id: "maps",
          label: "maps",
          kind: "data",
          getContainer: () => window.$dataMapInfos,
          fields: ["name"],
          cachePrefix: "map",
        },
        {
          id: "actors",
          label: "actors",
          kind: "data",
          getContainer: () => window.$dataActors,
          fields: ["name", "nickname", "profile"],
          cachePrefix: "actor",
        },
        {
          id: "systemMessages",
          label: "system messages",
          kind: "systemMessages",
        },
        {
          id: "systemCommands",
          label: "system commands",
          kind: "systemCommands",
        },
        {
          id: "gameArrays",
          label: "game arrays (terms, types, elements)",
          kind: "gameArrays",
        },
        {
          id: "commonEvents",
          label: "CommonEvents",
          kind: "commonEvents",
        },
        {
          id: "mapEvents",
          label: "Map events",
          kind: "mapEvents",
        },
      ];
    },

    getValidMapInfos() {
      if (!window.$dataMapInfos || !Array.isArray($dataMapInfos)) {
        return [];
      }

      const validMaps = [];
      for (let i = 0; i < $dataMapInfos.length; i++) {
        const mapInfo = $dataMapInfos[i];
        if (mapInfo && mapInfo.id) {
          validMaps.push({
            id: mapInfo.id,
            name: mapInfo.name || `Map ${mapInfo.id}`,
          });
        }
      }

      return validMaps;
    },

    countCommonEventsStats() {
      if (!Array.isArray(window.$dataCommonEvents)) {
        return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
      }

      let total = 0;
      let left = 0;

      for (const entry of $dataCommonEvents) {
        if (!entry || !Array.isArray(entry.list)) {
          continue;
        }

        for (let i = 0; i < entry.list.length; i++) {
          const cmd = entry.list[i];
          if (!cmd || typeof cmd.code !== "number") {
            continue;
          }

          if (cmd.code === 101) {
            const speaker = (cmd.parameters && cmd.parameters[4]) || "";
            const speakerKey = speaker
              ? this.getCacheKey(speaker, "speaker")
              : null;
            if (speakerKey) {
              total++;
              if (!this.hasUsableCacheValue(speakerKey)) {
                left++;
              }
            }

            let j = i + 1;
            const lines = [];
            while (
              j < entry.list.length &&
              entry.list[j] &&
              entry.list[j].code === 401
            ) {
              lines.push(
                entry.list[j].parameters && entry.list[j].parameters[0],
              );
              j += 1;
            }

            const joined = lines.join("\n");
            if (joined && joined.trim()) {
              total++;
              if (!this.hasUsableCacheValue(this.getCacheKey(joined, "text"))) {
                left++;
              }
            }

            i = j - 1;
            continue;
          }

          if (cmd.code === 102) {
            const choices = cmd.parameters && cmd.parameters[0];
            if (Array.isArray(choices)) {
              for (const choice of choices) {
                if (
                  !choice ||
                  typeof choice !== "string" ||
                  choice.trim() === ""
                ) {
                  continue;
                }
                total++;
                if (
                  !this.hasUsableCacheValue(this.getCacheKey(choice, "choice"))
                ) {
                  left++;
                }
              }
            }
          }
        }
      }

      return { total, left, totalStrings: total, leftStrings: left };
    },

    countMapEventsStats() {
      const validMaps = this.getValidMapInfos();
      const totalMaps = validMaps.length;
      return {
        total: totalMaps,
        left: totalMaps,
        totalStrings: 0,
        leftStrings: 0,
      };
    },

    countEventCommandListStats(list = []) {
      if (!Array.isArray(list)) {
        return { totalStrings: 0, leftStrings: 0 };
      }

      let totalStrings = 0;
      let leftStrings = 0;

      for (let i = 0; i < list.length; i++) {
        const cmd = list[i];
        if (!cmd || typeof cmd.code !== "number") {
          continue;
        }

        if (cmd.code === 101) {
          const speaker = (cmd.parameters && cmd.parameters[4]) || "";
          if (speaker && speaker.trim()) {
            totalStrings += 1;
            if (
              !this.hasUsableCacheValue(this.getCacheKey(speaker, "speaker"))
            ) {
              leftStrings += 1;
            }
          }

          let j = i + 1;
          const lines = [];
          while (j < list.length && list[j] && list[j].code === 401) {
            lines.push(list[j].parameters && list[j].parameters[0]);
            j += 1;
          }

          const text = lines.join("\n");
          if (text && text.trim()) {
            totalStrings += 1;
            if (!this.hasUsableCacheValue(this.getCacheKey(text, "text"))) {
              leftStrings += 1;
            }
          }

          i = j - 1;
          continue;
        }

        if (cmd.code === 102) {
          const choices = cmd.parameters && cmd.parameters[0];
          if (!Array.isArray(choices)) {
            continue;
          }

          for (const choice of choices) {
            if (!choice || typeof choice !== "string" || choice.trim() === "") {
              continue;
            }

            totalStrings += 1;
            if (!this.hasUsableCacheValue(this.getCacheKey(choice, "choice"))) {
              leftStrings += 1;
            }
          }
        }
      }

      return { totalStrings, leftStrings };
    },

    countMapEventStatsForData(mapData) {
      if (!mapData || !Array.isArray(mapData.events)) {
        return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
      }

      let totalStrings = 0;
      let leftStrings = 0;

      for (const event of mapData.events) {
        if (!event || !Array.isArray(event.pages)) {
          continue;
        }

        for (const page of event.pages) {
          if (!page || !Array.isArray(page.list)) {
            continue;
          }

          const stats = this.countEventCommandListStats(page.list);
          totalStrings += stats.totalStrings;
          leftStrings += stats.leftStrings;
        }
      }

      return {
        total: totalStrings > 0 ? 1 : 0,
        left: leftStrings > 0 ? 1 : 0,
        totalStrings,
        leftStrings,
      };
    },

    getSelectedObjectTranslationMapIds(validMaps = null) {
      const safeMaps = Array.isArray(validMaps)
        ? validMaps
        : this.getValidMapInfos();
      const validIds = safeMaps
        .map((mapInfo) => Number(mapInfo.id))
        .filter(Boolean);

      if (!Array.isArray(this.objectTranslationSelectedMapIds)) {
        this.objectTranslationSelectedMapIds = validIds.slice();
      }

      const selectedSet = new Set(
        (this.objectTranslationSelectedMapIds || [])
          .map((id) => Number(id))
          .filter(Boolean),
      );
      const sanitizedIds = validIds.filter((id) => selectedSet.has(id));
      this.objectTranslationSelectedMapIds = sanitizedIds;
      return sanitizedIds.slice();
    },

    getObjectTranslationMapEventsMetaText(totalMaps, selectedMapCount) {
      const safeTotal = Math.max(0, Number(totalMaps) || 0);
      const safeSelected = Math.max(0, Number(selectedMapCount) || 0);

      if (safeSelected > 0 && safeSelected < safeTotal) {
        return `${safeSelected} of ${safeTotal} maps`;
      }

      return `${safeTotal} maps`;
    },

    async getTranslatedMapNames(validMaps) {
      const safeMaps = Array.isArray(validMaps) ? validMaps : [];
      const rawNames = safeMaps.map(
        (mapInfo) => mapInfo.name || `Map ${mapInfo.id}`,
      );
      let displayNames = rawNames.slice();

      if (TRANSLATE_SETTINGS.isMapTranslateEnabled()) {
        try {
          displayNames = await TRANSLATOR.translateBulk(rawNames);
        } catch (error) {
          console.warn(
            "[TranslateOnTheFly] Failed to translate map names for object modal:",
            error,
          );
        }
      }

      const lookup = new Map();
      for (let i = 0; i < safeMaps.length; i++) {
        const mapInfo = safeMaps[i];
        lookup.set(
          mapInfo.id,
          displayNames[i] || mapInfo.name || `Map ${mapInfo.id}`,
        );
      }

      return lookup;
    },

    async buildObjectTranslationMapEventDetails() {
      const validMaps = this.getValidMapInfos();
      const selectedMapIds = new Set(
        this.getSelectedObjectTranslationMapIds(validMaps),
      );
      const mapNames = await this.getTranslatedMapNames(validMaps);
      const details = [];

      for (const mapInfo of validMaps) {
        let stats = { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };

        try {
          const mapData = await this.loadMapDataById(mapInfo.id);
          stats = this.countMapEventStatsForData(mapData);
        } catch (error) {
          console.error(
            `[TranslateOnTheFly] Failed to build map event stats for map ${mapInfo.id}:`,
            error,
          );
        }

        details.push({
          id: mapInfo.id,
          label:
            mapNames.get(mapInfo.id) || mapInfo.name || `Map ${mapInfo.id}`,
          total: 1,
          left: stats.left,
          totalStrings: stats.totalStrings,
          leftStrings: stats.leftStrings,
          selected: selectedMapIds.has(mapInfo.id),
        });
      }

      return details;
    },

    loadMapDataById(mapId) {
      return new Promise((resolve, reject) => {
        const filename = "Map%1.json".format(mapId.padZero(3));
        const xhr = new XMLHttpRequest();
        xhr.open("GET", `data/${filename}`, true);
        xhr.onload = () => {
          if (xhr.status === 200) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch (e) {
              reject(new Error(`Failed to parse JSON: ${e.message}`));
            }
          } else {
            reject(new Error(`Failed to load file: ${xhr.status}`));
          }
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send();
      });
    },

    getObjectTranslationStats() {
      const defs = this.getObjectTranslationTypeDefs();
      return defs.map((def) => {
        if (def.kind === "commonEvents") {
          const stats = this.countCommonEventsStats();
          return { ...def, ...stats };
        }

        if (def.kind === "mapEvents") {
          const stats = this.countMapEventsStats();
          return { ...def, ...stats };
        }

        if (def.kind === "systemMessages") {
          const stats = this.countSystemMessagesStats();
          return { ...def, ...stats };
        }

        if (def.kind === "systemCommands") {
          const stats = this.countSystemCommandsStats();
          return { ...def, ...stats };
        }

        if (def.kind === "gameArrays") {
          const stats = this.countGameArraysStats();
          return { ...def, ...stats };
        }

        const container = def.getContainer && def.getContainer();
        if (!Array.isArray(container)) {
          return { ...def, total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        let total = 0;
        let left = 0;
        let totalStrings = 0;
        let leftStrings = 0;

        for (let i = 1; i < container.length; i++) {
          const item = container[i];
          if (!item) continue;
          total++;

          if (!item._translateOriginal) {
            item._translateOriginal = {};
          }

          for (const field of def.fields) {
            if (!item._translateOriginal[field] && item[field]) {
              item._translateOriginal[field] = item[field];
            }
          }

          let hasUntranslated = false;
          for (const field of def.fields) {
            const originalValue = item._translateOriginal[field];
            if (
              !originalValue ||
              typeof originalValue !== "string" ||
              originalValue.trim() === ""
            ) {
              continue;
            }

            totalStrings++;
            const cacheKey = this.getCacheKey(
              originalValue,
              `${def.cachePrefix}_${field}`,
            );
            if (!this.hasUsableCacheValue(cacheKey)) {
              leftStrings++;
              hasUntranslated = true;
            }
          }

          if (hasUntranslated) {
            left++;
          }
        }

        return { ...def, total, left, totalStrings, leftStrings };
      });
    },

    countSystemCommandsStats() {
      if (
        !window.$dataSystem ||
        !$dataSystem.terms ||
        !Array.isArray($dataSystem.terms.commands)
      ) {
        return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
      }

      const source =
        $dataSystem.terms.commandsOriginal || $dataSystem.terms.commands;
      let total = 0;
      let left = 0;
      for (const val of source) {
        if (!val || typeof val !== "string" || val.trim() === "") continue;
        total++;
        const cacheKey = this.getCacheKey(val, "command");
        if (!this.hasUsableCacheValue(cacheKey)) {
          left++;
        }
      }

      return { total, left, totalStrings: total, leftStrings: left };
    },

    countSystemMessagesStats() {
      if (
        !window.$dataSystem ||
        !$dataSystem.terms ||
        !$dataSystem.terms.messages ||
        typeof $dataSystem.terms.messages !== "object"
      ) {
        return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
      }

      const source =
        $dataSystem.terms.messagesOriginal || $dataSystem.terms.messages;
      const keys = Object.keys(source || {});

      let total = 0;
      let left = 0;
      for (const key of keys) {
        const value = source[key];
        if (typeof value !== "string" || value.trim() === "") {
          continue;
        }
        total++;
        if (!this.hasUsableCacheValue(key)) {
          left++;
        }
      }

      return {
        total,
        left,
        totalStrings: total,
        leftStrings: left,
      };
    },

    getGameArrayDefs() {
      return [
        {
          parent: () => ($dataSystem && $dataSystem.terms) || null,
          prop: "basic",
          type: "terms_basic",
        },
        {
          parent: () => ($dataSystem && $dataSystem.terms) || null,
          prop: "params",
          type: "terms_params",
        },
        {
          parent: () => ($dataSystem && $dataSystem.terms) || null,
          prop: "commands",
          type: "command",
        },
        {
          parent: () => $dataSystem || null,
          prop: "weaponTypes",
          type: "weaponType",
        },
        {
          parent: () => $dataSystem || null,
          prop: "variables",
          type: "variable",
        },
        { parent: () => $dataSystem || null, prop: "switches", type: "switch" },
        {
          parent: () => $dataSystem || null,
          prop: "skillTypes",
          type: "skillType",
        },
        {
          parent: () => $dataSystem || null,
          prop: "equipTypes",
          type: "equipType",
        },
        {
          parent: () => $dataSystem || null,
          prop: "elements",
          type: "element",
        },
        {
          parent: () => $dataSystem || null,
          prop: "armorTypes",
          type: "armorType",
        },
      ];
    },

    collectGameArrayCandidates() {
      if (!window.$dataSystem) {
        return { uniqueValues: [], pendingValues: [] };
      }

      const arrays = this.getGameArrayDefs();
      const uniqueValuesMap = new Map();

      for (const entry of arrays) {
        const parentObj = entry.parent();
        if (!parentObj) {
          continue;
        }

        const sourceArr = Array.isArray(parentObj[`${entry.prop}Original`])
          ? parentObj[`${entry.prop}Original`]
          : parentObj[entry.prop];
        if (!Array.isArray(sourceArr)) {
          continue;
        }

        for (const value of sourceArr) {
          if (!value || typeof value !== "string") {
            continue;
          }

          const trimmed = value.trim();
          if (!trimmed) {
            continue;
          }

          if (!uniqueValuesMap.has(trimmed)) {
            uniqueValuesMap.set(trimmed, {
              value: trimmed,
              types: new Set(),
              cacheKeys: new Set(),
            });
          }

          const candidate = uniqueValuesMap.get(trimmed);
          candidate.types.add(entry.type);
          candidate.cacheKeys.add(this.getCacheKey(trimmed, entry.type));
        }
      }

      const uniqueValues = Array.from(uniqueValuesMap.values()).map(
        (candidate) => ({
          value: candidate.value,
          types: Array.from(candidate.types),
          cacheKeys: Array.from(candidate.cacheKeys),
        }),
      );

      const pendingValues = uniqueValues.filter((candidate) => {
        return !candidate.cacheKeys.some((cacheKey) =>
          this.hasUsableCacheValue(cacheKey),
        );
      });

      return { uniqueValues, pendingValues };
    },

    countGameArraysStats() {
      if (!window.$dataSystem) {
        return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
      }

      const candidates = this.collectGameArrayCandidates();
      const total = candidates.uniqueValues.length;
      const left = candidates.pendingValues.length;

      return { total, left, totalStrings: total, leftStrings: left };
    },

    ensureObjectTranslationModalElements() {
      const currentDoc = typeof document !== "undefined" ? document : null;
      const parentDoc = this.getSpinnerHostDocument();

      let hostDoc = currentDoc;
      if (
        window.__CHEAT_EXTERNAL_WINDOW__ &&
        window.opener &&
        !window.opener.closed &&
        window.opener.document
      ) {
        hostDoc = window.opener.document;
      } else if (!hostDoc) {
        hostDoc = parentDoc;
      }

      if (!hostDoc) {
        console.warn(
          "[TOF-DEBUG][TranslateOnTheFlyPanel] ensureObjectTranslationModalElements: no host document",
        );
        return null;
      }

      console.log(
        "[TOF-DEBUG][TranslateOnTheFlyPanel] ensureObjectTranslationModalElements",
        {
          hostHref: hostDoc.location ? hostDoc.location.href : null,
          isExternalWindow: !!window.__CHEAT_EXTERNAL_WINDOW__,
        },
      );

      if (
        this._objectTranslationModalEl &&
        this._objectTranslationModalEl.ownerDocument !== hostDoc
      ) {
        if (this._objectTranslationModalEl.parentNode) {
          this._objectTranslationModalEl.parentNode.removeChild(
            this._objectTranslationModalEl,
          );
        }
        this._objectTranslationModalEl = null;
      }

      if (
        this._objectTranslationModalStyle &&
        this._objectTranslationModalStyle.ownerDocument !== hostDoc
      ) {
        if (this._objectTranslationModalStyle.parentNode) {
          this._objectTranslationModalStyle.parentNode.removeChild(
            this._objectTranslationModalStyle,
          );
        }
        this._objectTranslationModalStyle = null;
      }

      if (!this._objectTranslationModalStyle) {
        const existingStyle = hostDoc.getElementById(
          "tof-object-translation-modal-style",
        );
        const style = existingStyle || hostDoc.createElement("style");
        style.id = "tof-object-translation-modal-style";
        style.textContent = [
          "#tof-object-translation-modal { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; z-index: 10000; background: rgba(0, 0, 0, 0.55); }",
          "#tof-object-translation-modal .tof-modal-card { width: 540px; max-width: calc(100vw - 24px); max-height: calc(100vh - 24px); overflow: auto; background: #1f1f1f; color: #f2f2f2; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.45); }",
          "#tof-object-translation-modal .tof-modal-header { padding: 14px 16px 8px 16px; font-size: 16px; font-weight: 700; }",
          "#tof-object-translation-modal .tof-modal-sub { padding: 0 16px 8px 16px; color: #bdbdbd; font-size: 12px; }",
          "#tof-object-translation-modal .tof-modal-list { padding: 0 16px 10px 16px; }",
          "#tof-object-translation-modal .tof-modal-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }",
          "#tof-object-translation-modal .tof-modal-item:last-child { border-bottom: none; }",
          "#tof-object-translation-modal .tof-modal-item label { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }",
          "#tof-object-translation-modal .tof-modal-meta { color: #9e9e9e; font-size: 12px; white-space: nowrap; }",
          "#tof-object-translation-modal .tof-modal-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 10px 16px 16px 16px; }",
          "#tof-object-translation-modal .tof-btn { border: none; border-radius: 4px; padding: 6px 12px; cursor: pointer; font-size: 12px; font-weight: 700; }",
          "#tof-object-translation-modal .tof-btn-start { background: #42a5f5; color: #fff; }",
          "#tof-object-translation-modal .tof-btn-cancel { background: #616161; color: #fff; }",
        ].join("");
        if (!existingStyle) {
          hostDoc.head.appendChild(style);
        }
        this._objectTranslationModalStyle = style;
      }

      if (!this._objectTranslationModalEl) {
        const existingEl = hostDoc.getElementById(
          "tof-object-translation-modal",
        );
        const el = existingEl || hostDoc.createElement("div");
        el.id = "tof-object-translation-modal";
        el.innerHTML = [
          '<div class="tof-modal-card">',
          '  <div class="tof-modal-header">Object Translation</div>',
          '  <div class="tof-modal-sub">Select what to translate. Counts show remaining objects and total.</div>',
          '  <div class="tof-modal-list" id="tof-object-translation-list"></div>',
          '  <div class="tof-modal-actions">',
          '    <button class="tof-btn tof-btn-cancel" id="tof-object-translation-cancel">Cancel</button>',
          '    <button class="tof-btn tof-btn-start" id="tof-object-translation-start">Start</button>',
          "  </div>",
          "</div>",
        ].join("");
        if (!existingEl) {
          hostDoc.body.appendChild(el);
        }
        this._objectTranslationModalEl = el;
      }

      return this._objectTranslationModalEl;
    },

    openObjectTranslationModal() {
      console.log(
        "[TOF-DEBUG][TranslateOnTheFlyPanel] openObjectTranslationModal called",
        {
          jobActive: !!(
            this.objectTranslationJob && this.objectTranslationJob.active
          ),
        },
      );

      if (this.objectTranslationJob.active) {
        Alert.warn("Object translation is already in progress");
        return;
      }

      if (this.checkIfDataIsLoaded()) {
        console.warn(
          "[TOF-DEBUG][TranslateOnTheFlyPanel] openObjectTranslationModal aborted: data not loaded",
        );
        Alert.warn("Game data is not fully loaded yet");
        return;
      }

      const stats = this.getObjectTranslationStats();
      const extraIds = new Set(["commonEvents", "mapEvents"]);
      const commonEventsStats =
        stats.find((item) => item.id === "commonEvents") ||
        this.countCommonEventsStats();
      const mapEventsStats =
        stats.find((item) => item.id === "mapEvents") ||
        this.countMapEventsStats();
      const selectedMapIds = this.getSelectedObjectTranslationMapIds();

      this.objectTranslationModalStats = stats.filter(
        (item) => !extraIds.has(item.id),
      );
      this.objectTranslationModalExtraStats = [
        {
          id: "commonEvents",
          label: "CommonEvents",
          metaText: `${commonEventsStats.leftStrings} of ${commonEventsStats.totalStrings}`,
          total: commonEventsStats.totalStrings,
        },
        {
          id: "mapEvents",
          label: "Map events",
          metaText: this.getObjectTranslationMapEventsMetaText(
            mapEventsStats.total,
            selectedMapIds.length,
          ),
          total: mapEventsStats.total,
        },
      ];
      for (const item of this.objectTranslationModalStats) {
        if (this.objectTranslationSelection[item.id] === undefined) {
          this.$set(this.objectTranslationSelection, item.id, item.left > 0);
        }
      }
      for (const item of this.objectTranslationModalExtraStats) {
        if (this.objectTranslationSelection[item.id] === undefined) {
          this.$set(this.objectTranslationSelection, item.id, item.total > 0);
        }
      }
      this.objectTranslationDialogVisible = true;
    },

    closeObjectTranslationModal() {
      this.objectTranslationDialogVisible = false;
    },

    async openMapEventsSelectionModal() {
      this.objectTranslationMapEventsDialogVisible = true;
      this.objectTranslationMapEventsLoading = true;
      this.objectTranslationMapEventsSearch = "";

      try {
        const details = await this.buildObjectTranslationMapEventDetails();
        this.objectTranslationMapEventDetails = details;

        const draftSelection = {};
        for (const item of details) {
          draftSelection[item.id] = !!item.selected;
        }
        this.objectTranslationMapEventDraftSelection = draftSelection;
      } finally {
        this.objectTranslationMapEventsLoading = false;
      }
    },

    closeMapEventsSelectionModal() {
      this.objectTranslationMapEventsDialogVisible = false;
    },

    selectAllMapEventsForObjectTranslation() {
      const nextSelection = { ...this.objectTranslationMapEventDraftSelection };
      for (const item of this.objectTranslationMapEventDetails) {
        if (item.totalStrings > 0) {
          nextSelection[item.id] = true;
        }
      }
      this.objectTranslationMapEventDraftSelection = nextSelection;
    },

    deselectAllMapEventsForObjectTranslation() {
      const nextSelection = { ...this.objectTranslationMapEventDraftSelection };
      for (const item of this.objectTranslationMapEventDetails) {
        nextSelection[item.id] = false;
      }
      this.objectTranslationMapEventDraftSelection = nextSelection;
    },

    saveMapEventsSelection() {
      const selectedMapIds = this.objectTranslationMapEventDetails
        .filter(
          (item) =>
            item.totalStrings > 0 &&
            !!this.objectTranslationMapEventDraftSelection[item.id],
        )
        .map((item) => item.id);

      this.objectTranslationSelectedMapIds = selectedMapIds;
      this.$set(
        this.objectTranslationSelection,
        "mapEvents",
        selectedMapIds.length > 0,
      );

      const mapEventsItem = (this.objectTranslationModalExtraStats || []).find(
        (item) => item.id === "mapEvents",
      );
      if (mapEventsItem) {
        mapEventsItem.metaText = this.getObjectTranslationMapEventsMetaText(
          mapEventsItem.total,
          selectedMapIds.length,
        );
      }

      this.closeMapEventsSelectionModal();
    },

    async startObjectTranslationFromModal() {
      const selected = [];
      const stats = [
        ...(this.objectTranslationModalStats || []),
        ...(this.objectTranslationModalExtraStats || []),
      ];
      for (const item of stats) {
        const isChecked = !!this.objectTranslationSelection[item.id];
        if (isChecked) {
          this.objectTranslationSelection[item.id] = true;
          selected.push(item.id);
        } else {
          this.objectTranslationSelection[item.id] = false;
        }
      }

      if (!selected.length) {
        Alert.warn("Select at least one type to translate");
        return;
      }

      this.closeObjectTranslationModal();
      await this.runObjectTranslationJob(selected);
    },

    ...translateOnTheFlyFlowMethods,

    onChangeEnabled() {
      TranslateOnTheFlyState.setEnabled(this.enabled);
      this.saveSettings();
      this.notifyCacheRuntime("settings-enabled");
      if (this.enabled) {
        console.log("[TranslateOnTheFly] Translation enabled");
      } else {
        console.log("[TranslateOnTheFly] Translation disabled");
      }
    },

    onChangeSourceLang() {
      // Don't clear cache - keys contain source/target lang, so they don't conflict
      this.saveSettings();
      this.notifyCacheRuntime("settings-language");
    },

    onChangeTargetLang() {
      // Don't clear cache - keys contain source/target lang, so they don't conflict
      this.saveSettings();
      this.notifyCacheRuntime("settings-language");
    },
    onChangeTranslationEngine() {
      // Save current engine's configuration before switching
      if (this.engine) {
        const currentConfig = this.engine.getConfigData();
        if (!this.engineSettings) {
          this.engineSettings = {};
        }
        this.engineSettings[this.translationEngine] = currentConfig;
      }

      // Create new engine instance
      this.engine = createEngine(this.translationEngine, this);

      // Restore settings for new engine if available
      if (this.engineSettings && this.engineSettings[this.translationEngine]) {
        const engineConfig = this.engineSettings[this.translationEngine];
        Object.assign(this.engine, engineConfig);
      }

      // Bind new engine config data to panel
      const engineConfigData = this.engine.getConfigData();
      Object.keys(engineConfigData).forEach((key) => {
        this.$set(this, key, engineConfigData[key]);
      });

      // Bind new engine config methods to panel
      const engineConfigMethods = this.engine.getConfigMethods();
      Object.keys(engineConfigMethods).forEach((methodName) => {
        this[methodName] = engineConfigMethods[methodName].bind(this.engine);
      });

      // Don't clear cache - keys contain engine name, so they don't conflict
      this.saveSettings();
    },

    onChangeTextWrapping() {
      // Don't clear cache - wrapping doesn't affect cache validity
      this.saveSettings();
    },

    onChangeMaxWidth() {
      // Don't clear cache - wrapping is applied on display, not stored in cache
      this.saveSettings();
    },

    onChangeDescriptionMaxWidth() {
      // Don't clear cache - wrapping is applied on display, not stored in cache
      this.saveSettings();
    },

    onChangeCharLimit() {
      // Persist new batch character limit
      // Ensure sensible minimum
      if (!this.charLimit || this.charLimit < 200) this.charLimit = 200;
      this.saveSettings();
    },

    onChangeBatchItemsLimit() {
      if (!this.batchItemsLimit || this.batchItemsLimit < 1)
        this.batchItemsLimit = 1;
      this.saveSettings();
    },

    clearCache() {
      const count = this.translationCache.size;
      const seenCount = this.lastSeenByCacheKey
        ? this.lastSeenByCacheKey.size
        : 0;
      this.translationCache.clear();
      if (this.lastSeenByCacheKey) {
        this.lastSeenByCacheKey.clear();
      }
      this.persistCache();
      this.notifyCacheRuntime("cache-cleared");
      console.log(
        `[TranslateOnTheFly] Cleared ${count} cached translations and ${seenCount} seen timestamps`,
      );
    },

    shouldTrackRealtimeCacheUsage() {
      return this.isTranslationEnabled() || !!this.translateCacheWhenDisabled;
    },

    isRealtimeTrackableType(type) {
      return type === "text" || type === "choice";
    },

    isTranslatedCacheValue(value) {
      if (typeof value !== "string") {
        return value !== null && value !== undefined;
      }

      return value !== "";
    },

    hasUsableCacheValue(cacheKey) {
      if (
        !cacheKey ||
        !this.translationCache ||
        !this.translationCache.has(cacheKey)
      ) {
        return false;
      }

      return this.isTranslatedCacheValue(this.translationCache.get(cacheKey));
    },

    markBatchFailuresAsUntranslated(failures, markAsFailed = true) {
      if (!Array.isArray(failures) || failures.length === 0) {
        return;
      }

      for (const failure of failures) {
        if (!failure || !failure.cacheKey) {
          continue;
        }

        if (markAsFailed) {
          this.failedTranslations.set(failure.cacheKey, Date.now());
        }
      }
    },

    markBatchItemsAsUntranslated(items, markAsFailed = false) {
      if (!Array.isArray(items) || items.length === 0) {
        return;
      }

      for (const item of items) {
        if (!item || !item.cacheKey) {
          continue;
        }

        if (markAsFailed) {
          this.failedTranslations.set(item.cacheKey, Date.now());
        }
      }
    },

    getCacheKeyType(cacheKey) {
      if (typeof cacheKey !== "string") {
        return "";
      }

      const idx = cacheKey.indexOf(":");
      if (idx <= 0) {
        return "";
      }

      return cacheKey.slice(0, idx);
    },

    ensureRealtimeTrackedCacheEntry(value, type) {
      if (
        !this.shouldTrackRealtimeCacheUsage() ||
        !this.isRealtimeTrackableType(type)
      ) {
        return null;
      }

      if (typeof value !== "string" || value.trim() === "") {
        return null;
      }

      const cacheKey = this.getCacheKey(value, type);
      return cacheKey;
    },

    markCacheKeySeen(cacheKey, type = null) {
      if (!this.shouldTrackRealtimeCacheUsage() || !this.lastSeenByCacheKey) {
        return;
      }

      const resolvedType = type || this.getCacheKeyType(cacheKey);
      if (!this.isRealtimeTrackableType(resolvedType)) {
        return;
      }

      this.lastSeenByCacheKey.set(cacheKey, Date.now());
      this.notifyCacheRuntime("seen-updated", cacheKey);
    },

    touchRealtimeEntry(value, type) {
      const cacheKey = this.ensureRealtimeTrackedCacheEntry(value, type);
      if (cacheKey) {
        this.markCacheKeySeen(cacheKey, type);
      }

      return cacheKey;
    },

    deleteCacheValue(cacheKey, options = {}) {
      if (!cacheKey || !this.translationCache.has(cacheKey)) {
        return;
      }

      this.translationCache.delete(cacheKey);
      if (options.deleteSeen !== false && this.lastSeenByCacheKey) {
        this.lastSeenByCacheKey.delete(cacheKey);
      }
      if (options.persist !== false) {
        this.persistCache();
      }
      if (options.notify !== false) {
        this.notifyCacheRuntime("cache-delete", cacheKey);
      }
    },

    notifyCacheRuntime(reason = "unknown", key = null) {
      notifyTranslateCacheRuntimeChanged(reason, key);
    },

    isTranslationEnabled() {
      // Prefer global state; fall back to local flag to survive any desync on startup
      const stateEnabled = TranslateOnTheFlyState.isEnabled();
      const localEnabled = this.enabled;
      const enabled = stateEnabled || localEnabled;
      if (enabled && !this._loggedEnabledOnce) {
        console.log(
          "[TranslateOnTheFly] isTranslationEnabled true (state/local):",
          stateEnabled,
          localEnabled,
        );
        this._loggedEnabledOnce = true;
      }
      return enabled;
    },

    isSkippingMessages() {
      return !!(MessageCheat && MessageCheat.skip);
    },

    applyExternalToggle(enabled, notify = false) {
      TranslateOnTheFlyState.setEnabled(enabled);
      this.enabled = enabled;
      this.saveSettings();
      this.notifyCacheRuntime("settings-enabled");

      if (notify) {
        Alert.success(
          `Real-time translation: ${enabled ? "enabled" : "disabled"}`,
        );
      }
    },

    toggleEnabledExternal(notify = true) {
      const enabled = TranslateOnTheFlyState.toggleEnabled();
      this.applyExternalToggle(enabled, notify);
      return enabled;
    },

    ...translateOnTheFlyRuntimeMethods,

    replaceMessageText(translatedText) {
      // Do NOT extract \n<...> as speaker - these are RPG Maker script elements/plugin commands
      // Speaker name comes from $gameMessage._speakerName, not from text

      // Split translated text into lines
      const lines = translatedText.split("\n");

      // Clear current message texts
      $gameMessage._texts.length = 0;

      // Add translated lines (preserving all RPG Maker tags)
      for (const line of lines) {
        if (line || lines.length === 1) {
          // Keep empty lines if they're intentional
          $gameMessage._texts.push(line);
        }
      }
    },

    replaceChoiceText(translatedChoices) {
      if (!Array.isArray(translatedChoices)) {
        return;
      }

      $gameMessage._choices = translatedChoices.slice();
    },

    replaceSpeakerName(translatedSpeaker) {
      const safeSpeaker = this.normalizeSpeakerNameCase(
        (translatedSpeaker || "").trim(),
      );
      if (!safeSpeaker) {
        return;
      }

      $gameMessage._speakerName = safeSpeaker;
    },

    getCacheKey(text, type = "text") {
      const keyText =
        type === "speaker" ? this.ensureSpeakerKeyPrefix(text) : text;
      return `${type}:${this.sourceLang}-${this.targetLang}-${keyText}`;
    },

    getLegacySpeakerCacheKey(speakerName) {
      if (!speakerName) {
        return null;
      }
      return `speaker:${this.sourceLang}-${this.targetLang}-${speakerName}`;
    },

    ensureSpeakerKeyPrefix(text) {
      if (!text) {
        return text;
      }

      return text.startsWith("name_") ? text : `name_${text}`;
    },

    setCacheValue(key, value) {
      const normalizedValue =
        typeof value === "string"
          ? value
          : value === null || value === undefined
            ? ""
            : String(value);
      this.translationCache.set(key, normalizedValue);
      this.persistCache();
      this.notifyCacheRuntime("cache-set", key);
    },

    loadCacheFromDisk() {
      try {
        const json = this.cacheStorage.getItem("data");
        if (!json) {
          return;
        }
        const entries = JSON.parse(json);
        if (Array.isArray(entries)) {
          if (!this.translationCache) {
            const runtime = ensureTranslateCacheRuntime(new Map());
            this.translationCache = runtime.cache;
            this.lastSeenByCacheKey = runtime.lastSeenByCacheKey;
          }
          this.translationCache.clear();
          for (const [k, v] of entries) {
            const normalizedValue =
              typeof v === "string"
                ? v
                : v === null || v === undefined
                  ? ""
                  : String(v);
            this.translationCache.set(k, normalizedValue);
          }
          this.notifyCacheRuntime("cache-loaded");
        }
      } catch (error) {
        console.warn(
          "[TranslateOnTheFly] Failed to load cache, starting fresh",
          error,
        );
        const runtime = ensureTranslateCacheRuntime(new Map());
        this.translationCache = runtime.cache;
        this.lastSeenByCacheKey = runtime.lastSeenByCacheKey;
        this.notifyCacheRuntime("cache-load-failed-reset");
      }
    },

    persistCache() {
      try {
        const payload = JSON.stringify(
          Array.from(this.translationCache.entries()),
        );
        this.cacheStorage.setItem("data", payload);
      } catch (error) {
        console.warn("[TranslateOnTheFly] Failed to persist cache", error);
      }
    },

    getSpinnerHostDocument() {
      // Always prefer the main game window as the host for spinner UI
      const parentDoc =
        window.__CHEAT_EXTERNAL_WINDOW__ &&
        window.opener &&
        !window.opener.closed
          ? window.opener.document
          : null;
      return parentDoc || (typeof document !== "undefined" ? document : null);
    },

    ensureSpinnerElements() {
      const hostDoc = this.getSpinnerHostDocument();
      if (!hostDoc) {
        return null;
      }

      if (!this._spinnerStyle) {
        const existingStyle = hostDoc.getElementById(
          "tof-translate-spinner-style",
        );
        const style = existingStyle || hostDoc.createElement("style");
        style.id = "tof-translate-spinner-style";
        style.textContent = [
          "#tof-translate-spinner { position: fixed; right: 12px; bottom: 12px; width: 48px; height: 48px; display: none; align-items: center; justify-content: center; pointer-events: none; z-index: 9999; }",
          "#tof-translate-spinner .tof-spinner-ring { width: 32px; height: 32px; border: 3px solid rgba(255,255,255,0.35); border-top: 3px solid #4fc3f7; border-radius: 50%; animation: tof-translate-spin 0.9s linear infinite; box-shadow: 0 0 10px rgba(0,0,0,0.35); background: rgba(0,0,0,0.25); }",
          "@keyframes tof-translate-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }",
        ].join("");
        if (!existingStyle) {
          hostDoc.head.appendChild(style);
        }
        this._spinnerStyle = style;
      }

      if (!this._spinnerEl) {
        const existingEl = hostDoc.getElementById("tof-translate-spinner");
        const el = existingEl || hostDoc.createElement("div");
        el.id = "tof-translate-spinner";
        el.innerHTML = '<div class="tof-spinner-ring"></div>';
        if (!existingEl) {
          hostDoc.body.appendChild(el);
        }
        this._spinnerEl = el;
      }

      return this._spinnerEl;
    },

    ensureProgressBoxElements() {
      const hostDoc = this.getSpinnerHostDocument();
      if (!hostDoc) {
        return null;
      }

      if (!this._progressBoxStyle) {
        const existingStyle = hostDoc.getElementById("tof-progress-box-style");
        const style = existingStyle || hostDoc.createElement("style");
        style.id = "tof-progress-box-style";
        style.textContent = [
          "#tof-progress-box { position: fixed; right: 12px; bottom: 72px; padding: 8px 12px; display: none; background: rgba(50, 50, 50, 0.75); border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.3); pointer-events: none; z-index: 9998; font-family: Arial, sans-serif; text-align: right; }",
          "#tof-progress-box .tof-progress-line { color: #fff; font-size: 12px; line-height: 1.5; margin: 1px 0; white-space: nowrap; }",
          "#tof-progress-box .tof-progress-line.map-progress { font-weight: bold; color: #82d4f8; }",
          "#tof-progress-box .tof-progress-line.message-progress { color: #ccc; }",
          "#tof-progress-box .tof-progress-line.total-errors-progress { color: #ffb3b3; }",
        ].join("");
        if (!existingStyle) {
          hostDoc.head.appendChild(style);
        }
        this._progressBoxStyle = style;
      }

      if (!this._progressBoxEl) {
        const existingEl = hostDoc.getElementById("tof-progress-box");
        const el = existingEl || hostDoc.createElement("div");
        el.id = "tof-progress-box";
        el.innerHTML =
          '<div class="tof-progress-line map-progress" id="tof-map-progress"></div><div class="tof-progress-line message-progress" id="tof-message-progress"></div><div class="tof-progress-line total-errors-progress" id="tof-total-errors-progress"></div>';
        if (!existingEl) {
          hostDoc.body.appendChild(el);
        }
        this._progressBoxEl = el;
      }

      return this._progressBoxEl;
    },

    updateProgressBox(
      mapProgress = null,
      messageProgress = null,
      successes = null,
      failures = null,
      totalErrorsProgress = null,
    ) {
      const el = this.ensureProgressBoxElements();
      if (!el) {
        return;
      }

      const mapProgressEl = el.querySelector("#tof-map-progress");
      const messageProgressEl = el.querySelector("#tof-message-progress");
      const totalErrorsEl = el.querySelector("#tof-total-errors-progress");

      if (mapProgress !== null && mapProgressEl) {
        mapProgressEl.textContent = mapProgress;
        mapProgressEl.style.display = mapProgress ? "block" : "none";
      } else if (mapProgressEl) {
        mapProgressEl.textContent = "";
        mapProgressEl.style.display = "none";
      }

      if (messageProgress !== null && messageProgressEl) {
        let progressText = messageProgress;
        // Add error info if provided and there are failures
        if (successes !== null && failures !== null && failures > 0) {
          progressText += ` (${successes} OK, ${failures} errors)`;
        }
        messageProgressEl.textContent = progressText;
        messageProgressEl.style.display = messageProgress ? "block" : "none";
      } else if (messageProgressEl) {
        messageProgressEl.textContent = "";
        messageProgressEl.style.display = "none";
      }

      if (totalErrorsProgress !== null && totalErrorsEl) {
        totalErrorsEl.textContent = totalErrorsProgress;
        totalErrorsEl.style.display = totalErrorsProgress ? "block" : "none";
      } else if (totalErrorsEl) {
        totalErrorsEl.textContent = "";
        totalErrorsEl.style.display = "none";
      }

      // Show box if any progress is set
      const hasContent =
        (mapProgress && mapProgress.length > 0) ||
        (messageProgress && messageProgress.length > 0) ||
        (totalErrorsProgress && totalErrorsProgress.length > 0);
      el.style.display = hasContent ? "block" : "none";
    },

    hideProgressBox() {
      const el = this.ensureProgressBoxElements();
      if (el) {
        el.style.display = "none";
      }
    },

    updateSpinnerVisibility() {
      const el = this.ensureSpinnerElements();
      if (!el) {
        return;
      }
      el.style.display = this.spinnerActiveCount > 0 ? "flex" : "none";
    },

    showSpinner() {
      this.spinnerActiveCount = Math.max(0, this.spinnerActiveCount) + 1;
      this.updateSpinnerVisibility();
    },

    hideSpinner() {
      this.spinnerActiveCount = Math.max(0, this.spinnerActiveCount - 1);
      this.updateSpinnerVisibility();
    },

    protectSpecialSequences(text) {
      // Store original sequences with placeholders
      const protectedSequences = [];
      let protectedText = text;

      // Protect RPG Maker control characters and escape sequences
      const patterns = [
        /\\[nNpPgGcCiI]\[(\d+)\]/g, // \n[1], \p[2], etc.
        /\\[vV]\[(\d+)\]/g, // \v[1] - variables
        /\\[cC]\[(\d+)\]/g, // \c[1] - colors
        /\\[gG]/g, // \g - gold
        /\\[.!><\|^$]/g, // \., \!, \>, \<, \|, \^, \$
        /\n/g, // newlines
        /\\n/g, // literal \n
        /\\\\/g, // escaped backslashes
      ];

      patterns.forEach((pattern, index) => {
        protectedText = protectedText.replace(pattern, (match) => {
          const placeholder = `XPROTX${protectedSequences.length}XPROTX`;
          protectedSequences.push(match);
          return placeholder;
        });
      });

      return { protectedText, protectedSequences };
    },

    restoreSpecialSequences(text, protectedSequences) {
      let restoredText = text;

      // Restore all protected sequences
      protectedSequences.forEach((sequence, index) => {
        const placeholder = `XPROTX${index}XPROTX`;
        // Handle various possible mutations by the translator
        const patterns = [
          new RegExp(placeholder, "g"),
          new RegExp(placeholder.replace(/X/g, "X\\s*"), "g"),
          new RegExp("X\\s*PROT\\s*X\\s*" + index + "\\s*X\\s*PROT\\s*X", "g"),
          new RegExp("XPROT X" + index + "X PROTX", "g"),
          new RegExp("X PROT X" + index + "X PROT X", "g"),
        ];

        patterns.forEach((pattern) => {
          restoredText = restoredText.replace(pattern, sequence);
        });
      });

      return restoredText;
    },

    cleanTranslatedText(text) {
      let cleaned = text;

      // Remove spaces after > before " (for dialogue)
      cleaned = cleaned.replace(/>\s+"/g, '>"');
      cleaned = cleaned.replace(/>\s+'/g, ">'");
      cleaned = cleaned.replace(/>\s+「/g, ">「");
      cleaned = cleaned.replace(/>\s+『/g, ">『");

      // Fix common API spacing issues in escape sequences
      cleaned = cleaned.replace(/\\\s+n/g, "\\n");
      cleaned = cleaned.replace(/\\\s+c/g, "\\c");
      cleaned = cleaned.replace(/\\\s+v/g, "\\v");
      cleaned = cleaned.replace(/\\\s+p/g, "\\p");
      cleaned = cleaned.replace(/\\\s+g/g, "\\g");

      return cleaned;
    },

    wrapText(text, maxWidth) {
      if (!this.enableTextWrapping || !maxWidth || maxWidth <= 0) {
        return text;
      }

      // Function to calculate visible length (excluding escape sequences)
      const getVisibleLength = (str) => {
        // Remove all RPG Maker escape sequences: \n[N], \v[N], \c[N], \p[N], \g, etc.
        const withoutEscapes = str
          .replace(/\\[nvcpgif]\[\d+\]/gi, "")
          .replace(/\\[nvcpgif]/gi, "")
          .replace(/\\[!.^<>]/g, "");
        return withoutEscapes.length;
      };

      const lines = text.split("\n");
      const wrappedLines = [];

      for (const line of lines) {
        const visibleLength = getVisibleLength(line);

        if (visibleLength <= maxWidth) {
          wrappedLines.push(line);
          continue;
        }

        // Line is too long, need to wrap
        const words = line.split(" ");
        let currentLine = "";

        for (const word of words) {
          const wordVisibleLength = getVisibleLength(word);

          // If word itself is longer than maxWidth, split it
          if (wordVisibleLength > maxWidth) {
            if (currentLine) {
              wrappedLines.push(currentLine.trim());
              currentLine = "";
            }
            // Split long word into chunks based on visible length
            let remainingWord = word;
            while (getVisibleLength(remainingWord) > maxWidth) {
              // This is a simplified approach - just break at maxWidth
              wrappedLines.push(remainingWord.substring(0, maxWidth));
              remainingWord = remainingWord.substring(maxWidth);
            }
            if (remainingWord) {
              wrappedLines.push(remainingWord);
            }
            continue;
          }

          // Check if adding this word would exceed maxWidth
          const testLine = currentLine ? currentLine + " " + word : word;
          const testVisibleLength = getVisibleLength(testLine);

          if (testVisibleLength <= maxWidth) {
            currentLine = testLine;
          } else {
            // Adding word would exceed limit, start new line
            if (currentLine) {
              wrappedLines.push(currentLine.trim());
            }
            currentLine = word;
          }
        }

        // Add remaining text
        if (currentLine) {
          wrappedLines.push(currentLine.trim());
        }
      }

      return wrappedLines.join("\n");
    },

    async translateCommandName(commandName) {
      try {
        const cleanName = (commandName || "").trim();
        if (!cleanName) {
          return commandName;
        }

        const commandKey = this.getCacheKey(cleanName, "command");

        // Check cache first
        if (this.hasUsableCacheValue(commandKey)) {
          return this.translationCache.get(commandKey);
        }

        // If translation is in progress, return original for now
        if (this.pendingTranslations.has(commandKey)) {
          return commandName;
        }

        this.showSpinner();
        const result = await this.engine.batchTranslate([
          {
            type: "command",
            id: "cmd_0",
            value: cleanName,
            cacheKey: commandKey,
          },
        ]);
        this.hideSpinner();

        if (result.successes.length > 0) {
          const translated = result.successes[0].translated;
          this.setCacheValue(commandKey, translated);
          return translated;
        }

        if (result.failures.length > 0) {
          console.warn(
            "[TranslateOnTheFly] Failed to translate command:",
            cleanName,
            "→",
            result.failures[0].rejectReason,
          );
          this.markBatchFailuresAsUntranslated(result.failures, true);
        }

        return commandName;
      } catch (error) {
        console.error("[TranslateOnTheFly] Command translation error:", error);
        return commandName;
      }
    },

    async translateChoiceText(text) {
      try {
        const cleanText = (text || "").trim();
        if (!cleanText) {
          return text;
        }

        const { protectedText, protectedSequences } =
          this.protectSpecialSequences(cleanText);
        const translatedRaw =
          await this.translateWithSelectedEngine(protectedText);

        if (translatedRaw) {
          let translated = this.restoreSpecialSequences(
            translatedRaw,
            protectedSequences,
          );
          translated = this.cleanTranslatedText(translated);
          translated = this.wrapText(translated, this.maxLineWidth);
          return translated;
        }

        return text;
      } catch (error) {
        console.error(
          "[TranslateOnTheFly] Choice translation API error:",
          error,
        );
        return text;
      }
    },

    async translateChoices(choices) {
      if (!Array.isArray(choices) || !choices.length) {
        return { choices: choices || [], complete: true };
      }

      // Build items for uncached choices
      const items = choices
        .map((choice, i) => {
          const cacheKey = this.getCacheKey(choice, "choice");
          return {
            type: "choice",
            id: `choice_${i}`,
            value: choice,
            cacheKey,
          };
        })
        .filter((item) => !this.hasUsableCacheValue(item.cacheKey));

      if (items.length === 0) {
        // All individual choices cached, build result
        const translatedChoices = choices.map((choice) => {
          const cacheKey = this.getCacheKey(choice, "choice");
          return this.translationCache.get(cacheKey) || choice;
        });
        return { choices: translatedChoices, complete: true };
      }

      // Translate uncached choices
      this.showSpinner();
      const result = await this.engine.batchTranslate(items);
      this.hideSpinner();

      // Apply successes to cache
      for (const success of result.successes) {
        this.setCacheValue(success.cacheKey, success.translated);
      }

      // Build final choice array
      const translatedChoices = choices.map((choice) => {
        const cacheKey = this.getCacheKey(choice, "choice");
        return this.translationCache.get(cacheKey) || choice;
      });

      const complete = result.failures.length === 0;
      if (!complete) {
        this.markBatchFailuresAsUntranslated(result.failures, true);
      }

      return { choices: translatedChoices, complete };
    },

    async translateSpeakerName(speakerName) {
      try {
        const cleanName = (speakerName || "").trim();
        if (!cleanName) {
          return speakerName;
        }

        const translated = await this.translateWithSelectedEngine(cleanName, {
          skipWrap: true,
        });
        return this.normalizeSpeakerNameCase(translated || speakerName);
      } catch (error) {
        console.error(
          "[TranslateOnTheFly] Speaker name translation API error:",
          error,
        );
        return speakerName;
      }
    },

    normalizeSpeakerNameCase(name) {
      if (!name || typeof name !== "string") {
        return name;
      }

      // Capitalize first latin letter if present (helps translators that lowercase names)
      return name.replace(/^([a-z])/, (match) => match.toUpperCase());
    },

    async translateWithSelectedEngine(text, options = {}) {
      const sourceLang = this.sourceLang || "auto";
      const targetLang = this.targetLang || "en";
      const payload = (text || "").trim();

      if (!payload) {
        return text;
      }

      // Delegate to engine
      return await this.engine.translate(
        payload,
        sourceLang,
        targetLang,
        options,
      );
    },

    isEngineFullyConfigured() {
      if (!this.engine) {
        return false;
      }

      // Check if engine has isFullyConfigured method
      if (typeof this.engine.isFullyConfigured === "function") {
        return this.engine.isFullyConfigured();
      }

      // Fallback: assume fully configured if method doesn't exist
      return true;
    },

    applyCachedTranslations(
      dataContainer,
      fields,
      cacheKeyPrefix,
      instanceContainer,
      instanceFunctionName,
    ) {
      let appliedCount = 0;
      for (let i = 1; i < dataContainer.length; i++) {
        const item = dataContainer[i];
        if (!item) continue;

        let itemInstance;
        if (
          instanceContainer &&
          instanceFunctionName &&
          typeof instanceContainer[instanceFunctionName] === "function"
        ) {
          itemInstance = instanceContainer[instanceFunctionName](item.id);
        }

        // Store original values if not stored
        if (!item._translateOriginal) {
          item._translateOriginal = {};
          for (const field of fields) {
            item._translateOriginal[field] = item[field];
          }
        }

        // Apply cached translations
        for (const field of fields) {
          const originalValue = item._translateOriginal[field];
          if (
            originalValue &&
            typeof originalValue === "string" &&
            originalValue.trim() !== ""
          ) {
            const cacheKey = this.getCacheKey(
              originalValue,
              `${cacheKeyPrefix}_${field}`,
            );
            if (this.hasUsableCacheValue(cacheKey)) {
              try {
                item[field] = this.translationCache.get(cacheKey);
                if (itemInstance) {
                  itemInstance[`_${field}`] = item[field];
                }
                appliedCount++;
              } catch (error) {
                console.log(error);
              }
            }
          }
        }
      }
      return appliedCount;
    },

    applyCachedActorClassEnemyTranslations() {
      this.applyCachedTranslations(
        $dataActors,
        ["name", "nickname", "profile"],
        "actor",
        $gameActors,
        "actor",
      );
      this.applyCachedTranslations($dataClasses, ["name"], "class");
      this.applyCachedTranslations($dataEnemies, ["name"], "enemy");
    },

    checkIfDataIsLoaded() {
      return (
        !window.$dataItems ||
        !window.$dataSkills ||
        !window.$dataArmors ||
        !window.$dataWeapons ||
        !window.$dataMapInfos ||
        !window.$dataClasses ||
        !window.$dataEnemies
      );
    },

    applyCachedTranslationsToData() {
      if (this.checkIfDataIsLoaded()) {
        console.log(
          "[TranslateOnTheFly] Game data not fully loaded, cannot apply cached translations",
        );
        setTimeout(() => {
          this.applyCachedTranslationsToData();
        }, 2000);
        return;
      }

      let appliedCount = 0;

      // Apply cached translations using type definitions as source of truth
      for (const def of this.getObjectTranslationTypeDefs().filter(
        (d) => d.kind === "data",
      )) {
        const container = def.getContainer && def.getContainer();
        if (!Array.isArray(container)) continue;
        const instanceContainer =
          def.cachePrefix === "actor" ? $gameActors : null;
        const instanceFunctionName =
          def.cachePrefix === "actor" ? "actor" : null;
        appliedCount += this.applyCachedTranslations(
          container,
          def.fields,
          def.cachePrefix,
          instanceContainer,
          instanceFunctionName,
        );
      }

      if (appliedCount > 0) {
        console.log(
          `[TranslateOnTheFly] Applied ${appliedCount} cached translations to objects`,
        );
      }
    },

    hasUntranslatedFields(dataObject, fields, type) {
      // Store original values if not already stored
      if (!dataObject._translateOriginal) {
        dataObject._translateOriginal = {};
        for (const field of fields) {
          dataObject._translateOriginal[field] = dataObject[field];
        }
      }

      // Check if any field needs translation (not empty and not cached)
      for (const field of fields) {
        const value = dataObject._translateOriginal[field];
        if (value && typeof value === "string" && value.trim() !== "") {
          const cacheKey = this.getCacheKey(value, `${type}_${field}`);
          if (!this.hasUsableCacheValue(cacheKey)) {
            return true; // At least one field needs translation
          }
        }
      }

      return false; // All fields are cached or empty
    },

    async translateDataBatch(dataObjects, fields, type, options = {}) {
      if (!this.batchManager) {
        this.batchManager = new TranslationBatchManager(this);
      }

      return this.batchManager.translateDataBatch(
        dataObjects,
        fields,
        type,
        options,
      );
    },

    async translateAndApplyCurrentMessage() {
      try {
        // Use stored $gameMessage reference instead of global one
        const gameMessage = this.currentGameMessage || $gameMessage;

        if (!gameMessage || typeof gameMessage.allText !== "function") {
          console.warn("[TranslateOnTheFly] No gameMessage available");
          return;
        }

        // Verify engine exists
        if (!this.engine || typeof this.engine.batchTranslate !== "function") {
          console.error(
            "[TranslateOnTheFly] No engine available or batchTranslate not found",
            {
              hasEngine: !!this.engine,
              engineType: this.engine ? this.engine.constructor.name : "null",
              hasBatchTranslate:
                this.engine && typeof this.engine.batchTranslate === "function",
            },
          );
          Alert.error("Translation engine not initialized");
          return;
        }

        // Get original text (before translation) or current text
        const originalText =
          gameMessage._translateOriginalText || gameMessage.allText();

        // Get original speaker (before translation) or current speaker
        const originalSpeakerName =
          gameMessage._translateOriginalSpeaker ||
          gameMessage._speakerName ||
          "";

        // Get original choices (before translation) or current choices
        const choices = gameMessage.choices ? gameMessage.choices() : [];
        const originalChoices =
          gameMessage._translateOriginalChoices || choices;
        const hasChoices =
          Array.isArray(originalChoices) && originalChoices.length > 0;

        // Validate that we have something to translate (text, speaker, or choices)
        const hasText = originalText && originalText.trim().length > 0;
        const hasSpeaker =
          originalSpeakerName && originalSpeakerName.trim().length > 0;

        if (!hasText && !hasSpeaker && !hasChoices) {
          console.warn(
            "[TranslateOnTheFly] Message text is empty and no choices or speaker",
          );
          return;
        }

        console.log("[TranslateOnTheFly] Translating current message:", {
          text: hasText ? originalText.substring(0, 50) : "(no text)",
          speaker: originalSpeakerName,
          choices: originalChoices,
        });

        // Build items array
        const items = [];
        let itemIdCounter = 0;

        // Add text
        const textKey = this.getCacheKey(originalText, "text");
        items.push({
          type: "text",
          id: `text_${itemIdCounter++}`,
          value: originalText,
          cacheKey: textKey,
        });

        // Add speaker
        if (originalSpeakerName && originalSpeakerName.trim().length > 0) {
          const speakerKey = this.getCacheKey(originalSpeakerName, "speaker");
          items.push({
            type: "speaker",
            id: `speaker_${itemIdCounter++}`,
            value: originalSpeakerName,
            cacheKey: speakerKey,
          });
        }

        // Add choices
        if (hasChoices) {
          for (let i = 0; i < originalChoices.length; i++) {
            const choice = originalChoices[i];
            const choiceKey = this.getCacheKey(choice, "choice");
            items.push({
              type: "choice",
              id: `choice_${itemIdCounter++}`,
              value: choice,
              cacheKey: choiceKey,
            });
          }
        }

        // Clear cache for these items to force re-translation
        for (const item of items) {
          this.deleteCacheValue(item.cacheKey, {
            persist: false,
            notify: false,
            deleteSeen: false,
          });
        }
        this.persistCache();
        this.notifyCacheRuntime("cache-force-retranslate");

        // Translate using batch
        this.showSpinner();
        const result = await this.engine.batchTranslate(items);
        this.hideSpinner();

        console.log("[TranslateOnTheFly] Translation result:", {
          successes: result.successes.length,
          failures: result.failures.length,
        });

        // Cache successes
        for (const success of result.successes) {
          this.setCacheValue(success.cacheKey, success.translated);
        }

        // Log failures
        for (const failure of result.failures) {
          console.warn(
            `[TranslateOnTheFly] Failed to translate ${failure.type}:`,
            failure.value,
            "→",
            failure.rejectReason,
          );
        }
        this.markBatchFailuresAsUntranslated(result.failures, true);

        // Apply translations
        const translatedText = this.translationCache.get(textKey);
        if (translatedText) {
          this.replaceMessageText(translatedText);
          this.translationCount++;
          this.saveSettings();
        }

        // Apply speaker
        if (originalSpeakerName) {
          const speakerKey = this.getCacheKey(originalSpeakerName, "speaker");
          const translatedSpeaker = this.translationCache.get(speakerKey);
          if (translatedSpeaker) {
            this.replaceSpeakerName(translatedSpeaker);
          }
        }

        // Apply choices
        if (hasChoices) {
          const translatedChoices = originalChoices.map((choice) => {
            const choiceKey = this.getCacheKey(choice, "choice");
            return this.translationCache.get(choiceKey) || choice;
          });
          this.replaceChoiceText(translatedChoices);
        }

        // Force refresh the currently displayed message window
        if (this.currentMessageWindow && this.currentMessageWindow.isOpen()) {
          const msgWindow = this.currentMessageWindow;

          console.log(
            "[TranslateOnTheFly] Refreshing message window by close/open cycle",
          );

          // Save current state
          const wasOpen = msgWindow.isOpen();
          const currentOpenness = msgWindow.openness;

          if (wasOpen) {
            if (translatedText) {
              msgWindow.contents.clear();
              const tState = msgWindow.createTextState(translatedText, 0, 0, 5);
              msgWindow._textState = tState;
              msgWindow.pause = false;
            }
          }

          // If choices are displayed, refresh them too
          if (
            hasChoices &&
            SceneManager._scene &&
            SceneManager._scene._choiceListWindow
          ) {
            const choiceWindow = SceneManager._scene._choiceListWindow;
            if (choiceWindow.isOpen()) {
              choiceWindow.refresh();
            }
          }
        }

        console.log(
          "[TranslateOnTheFly] Translation applied and window refreshed",
        );
      } catch (error) {
        console.error("[TranslateOnTheFly] Translation error:", error);
        this.hideSpinner();
      }
    },

    async translateAllMaps() {
      try {
        const startedAt = Date.now();
        // Check if engine is configured
        if (!this.engine || !this.isEngineFullyConfigured()) {
          Alert.error("Translation engine not fully configured");
          return;
        }

        // Check if map data is loaded
        if (!$dataMapInfos || !Array.isArray($dataMapInfos)) {
          Alert.error("Map info not loaded");
          return;
        }

        console.log("[TranslateOnTheFly] Starting translation of all maps");

        // Collect all valid map IDs
        const validMaps = this.getValidMapInfos();

        if (validMaps.length === 0) {
          Alert.warn("No valid maps found");
          return;
        }

        console.log(
          `[TranslateOnTheFly] Found ${validMaps.length} maps to translate`,
        );

        let totalTranslated = 0;
        let totalFailed = 0;
        let totalTarget = 0;
        const aggregatedErrorStats =
          BatchSummaryReporter.createErrorStatsAccumulator();

        console.log("[TranslateOnTheFly] Translating common events first");
        try {
          const result = await this.translateMapEvents(
            {
              events: [
                {
                  pages: $dataCommonEvents,
                },
              ],
            },
            -1,
            null,
            "translating common events",
          );
          if (result) {
            totalTranslated += result.successCount || 0;
            totalFailed += result.failureCount || 0;
            totalTarget += result.totalCount || 0;
            BatchSummaryReporter.mergeErrorStats(
              aggregatedErrorStats,
              result.stats,
            );
          }
        } catch (error) {
          console.error(
            "[TranslateOnTheFly] Failed to translate common events:",
            error,
          );
        }

        // Process each map
        for (let i = 0; i < validMaps.length; i++) {
          const mapInfo = validMaps[i];
          const mapId = mapInfo.id;
          const mapNumber = i + 1;

          console.log(
            `[TranslateOnTheFly] Processing map ${mapNumber}/${validMaps.length}: ${mapInfo.name} (ID: ${mapId})`,
          );

          try {
            // Load map data
            const mapData = await this.loadMapDataById(mapId);

            // Translate map events with progress info
            const result = await this.translateMapEvents(
              mapData,
              mapNumber,
              validMaps.length,
              `translating map ${mapNumber}/${validMaps.length}`,
            );
            if (result) {
              totalTranslated += result.successCount || 0;
              totalFailed += result.failureCount || 0;
              totalTarget += result.totalCount || 0;
              BatchSummaryReporter.mergeErrorStats(
                aggregatedErrorStats,
                result.stats,
              );
            }
          } catch (error) {
            console.error(
              `[TranslateOnTheFly] Failed to load or translate map ${mapId}:`,
              error,
            );
          }
        }

        this.hideProgressBox();
        const summary = BatchSummaryReporter.buildSummary({
          batchLabel: "all maps translation",
          totalItems: totalTarget,
          successes: totalTranslated,
          failures: totalFailed,
          errorStats: aggregatedErrorStats,
          durationMs: Date.now() - startedAt,
        });
        BatchSummaryReporter.showAlert(summary);
        BatchSummaryReporter.logSummary(summary);
      } catch (error) {
        this.hideProgressBox();
        console.error("[TranslateOnTheFly] translateAllMaps error:", error);
        Alert.error("Failed to translate all maps: " + error.message);
      }
    },

    async translateMapEvents(
      mapData = null,
      mapNumber = null,
      totalMaps = null,
      progressLabel = null,
    ) {
      if (!this.batchManager) {
        this.batchManager = new TranslationBatchManager(this);
      }

      return this.batchManager.translateMapEvents(
        mapData,
        mapNumber,
        totalMaps,
        progressLabel,
      );
    },
  },
};
