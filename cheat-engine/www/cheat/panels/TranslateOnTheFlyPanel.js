import { Alert } from "../js/AlertHelper.js";
import { MessageCheat, GeneralCheat } from "../js/CheatHelper.js";
import { TranslateOnTheFlyState } from "../js/TranslateOnTheFlyState.js";
import { AIEngine, getAvailableEngines } from "../translate-engines/index.js";
import { ensureTranslationRuntime } from "./translate-on-the-fly/TranslationRuntime.js";

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
        @click="MessageCheat.openObjectTranslationModal()">
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
      objectTranslationSelectedMapIds: null,
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
    this.runtime = ensureTranslationRuntime();
    this.syncRuntimeToUi();

    this.stateUnsubscribe = TranslateOnTheFlyState.subscribe((enabled) => {
      this.enabled = enabled;
    });
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
  },

  computed: {
    cachedCount() {
      return this.translationCache ? this.translationCache.size : 0;
    },
  },

  methods: {
    syncRuntimeToUi() {
      if (!this.runtime) {
        return;
      }

      this.runtime.syncUiStateTo(this);
      this.translationCache = this.runtime.translationCache;
      this.lastSeenByCacheKey = this.runtime.lastSeenByCacheKey;
      this.pendingTranslations = this.runtime.pendingTranslations;
      this.failedTranslations = this.runtime.failedTranslations;
      this.batchManager = this.runtime.batchManager;
      this.engine = this.runtime.engine;
    },

    syncUiToRuntime() {
      if (!this.runtime) {
        return;
      }

      this.runtime.syncUiStateFrom(this);
    },

    callRuntime(methodName, ...args) {
      if (!this.runtime) {
        this.runtime = ensureTranslationRuntime();
      }

      if (!this.runtime || typeof this.runtime[methodName] !== "function") {
        throw new Error(`Translation runtime method is missing: ${methodName}`);
      }

      this.syncUiToRuntime();
      const result = this.runtime[methodName](...args);

      if (result && typeof result.then === "function") {
        return result.finally(() => {
          this.syncRuntimeToUi();
        });
      }

      this.syncRuntimeToUi();
      return result;
    },

    onChangeEnabled() {
      return this.callRuntime("onChangeEnabled");
    },

    onChangeCacheOnly() {
      return this.callRuntime("onChangeCacheOnly");
    },

    onChangeTryTranslateAhead() {
      return this.callRuntime("onChangeTryTranslateAhead");
    },

    onChangeTranslateGameObjects() {
      return this.callRuntime("onChangeTranslateGameObjects");
    },

    onChangeCancelBackgroundForOnTheFly() {
      return this.callRuntime("onChangeCancelBackgroundForOnTheFly");
    },

    onChangeTranslationEngine() {
      return this.callRuntime("onChangeTranslationEngine");
    },

    onChangeSourceLang() {
      return this.callRuntime("onChangeSourceLang");
    },

    onChangeTargetLang() {
      return this.callRuntime("onChangeTargetLang");
    },

    onChangeTextWrapping() {
      return this.callRuntime("onChangeTextWrapping");
    },

    onChangeMaxWidth() {
      return this.callRuntime("onChangeMaxWidth");
    },

    onChangeDescriptionMaxWidth() {
      return this.callRuntime("onChangeDescriptionMaxWidth");
    },

    onChangeCharLimit() {
      return this.callRuntime("onChangeCharLimit");
    },

    onChangeBatchItemsLimit() {
      return this.callRuntime("onChangeBatchItemsLimit");
    },

    clearCache() {
      return this.callRuntime("clearCache");
    },
  },
};
