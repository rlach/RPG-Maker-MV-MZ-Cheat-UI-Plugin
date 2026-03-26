import { Alert } from "../js/AlertHelper.js";
import { MessageCheat, GeneralCheat } from "../js/CheatHelper.js";
import { TranslateOnTheFlyState } from "../js/TranslateOnTheFlyState.js";
import { AIEngine } from "../translate-engines/index.js";
import { ensureTranslationRuntime } from "./translate-on-the-fly/TranslationRuntime.js";
import { TRANSLATION_RUNTIME_STATE_KEYS } from "./translate-on-the-fly/TranslationRuntimeDefaults.js";

const runtimeStateProxyComputed = TRANSLATION_RUNTIME_STATE_KEYS.reduce(
  (acc, key) => {
    acc[key] = {
      get() {
        return this.runtime ? this.runtime[key] : undefined;
      },
      set(value) {
        if (this.runtime) {
          this.runtime[key] = value;
        }
      },
    };
    return acc;
  },
  {},
);

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

        <div v-if="translationEngine === 'openApi' || translationEngine === 'gpt4all'" class="mt-3">
          <div class="d-flex align-center justify-space-between mb-2">
            <div class="subtitle-2 font-weight-bold">Custom Tags</div>
            <v-btn
              small
              outlined
              color="primary"
              @click="openAddCustomTagDialog">
              <v-icon small left>mdi-plus</v-icon>
              Add
            </v-btn>
          </div>

          <div v-if="!aiCustomTags || aiCustomTags.length === 0" class="caption grey--text text--lighten-1 mb-2">
            No custom tags defined.
          </div>

          <div
            v-for="(tag, idx) in aiCustomTags"
            :key="'custom-tag-' + idx"
            class="d-flex align-center mb-1">
            <span class="caption font-weight-bold mr-2">[{{tag.tagSymbol}}]</span>
            <span class="caption mr-2">{{tag.description}}</span>
            <v-spacer></v-spacer>
            <v-btn icon x-small color="primary" @click="openEditCustomTagDialog(tag, idx)">
              <v-icon small>mdi-pencil</v-icon>
            </v-btn>
            <v-btn icon x-small color="error" @click="removeCustomTag(idx)">
              <v-icon small>mdi-delete</v-icon>
            </v-btn>
          </div>
        </div>
        </div>
    </v-card-text>

      <v-dialog v-model="customTagDialogVisible" max-width="560" @keydown.stop>
        <v-card dark class="pt-2">
          <v-card-title class="subtitle-1 font-weight-bold">{{ customTagEditIndex >= 0 ? 'Edit Custom Tag' : 'Add Custom Tag' }}</v-card-title>
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
              v-model="customTagForm.type"
              :items="aiCustomTagTypeOptions"
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
                :items="aiCustomTagBracketOptions"
                label="Bracket"
                outlined
                dense
                hide-details
                @keydown.stop
                class="mb-2"
              ></v-select>

              <v-checkbox
                v-model="customTagForm.maskValue"
                label="Mask value"
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
    return {
      runtime: null,
      translationCache: null,
      lastSeenByCacheKey: null,
      pendingTranslations: null,
      failedTranslations: null,
      batchManager: null,
      engine: null,
      customTagDialogVisible: false,
      customTagEditIndex: -1,
      customTagForm: {
        description: "",
        tagSymbol: "",
        type: "withNumericParameter",
        requiredConsistency: false,
        bracket: "<",
        maskValue: false,
      },
    };
  },

  created() {
    this.runtime = ensureTranslationRuntime();
    this.syncRuntimeRefs();

    this.stateUnsubscribe = TranslateOnTheFlyState.subscribe((enabled) => {
      if (this.runtime) {
        this.runtime.enabled = enabled;
      }
      this.syncRuntimeRefs();
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
    ...runtimeStateProxyComputed,

    cachedCount() {
      return this.translationCache ? this.translationCache.size : 0;
    },
  },

  methods: {
    syncRuntimeRefs() {
      if (!this.runtime) {
        return;
      }

      this.translationCache = this.runtime.translationCache;
      this.lastSeenByCacheKey = this.runtime.lastSeenByCacheKey;
      this.pendingTranslations = this.runtime.pendingTranslations;
      this.failedTranslations = this.runtime.failedTranslations;
      this.batchManager = this.runtime.batchManager;
      this.engine = this.runtime.engine;
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
        return result.finally(() => {
          this.syncRuntimeRefs();
        });
      }

      this.syncRuntimeRefs();
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

    openAddCustomTagDialog() {
      this.customTagEditIndex = -1;
      this.customTagForm = {
        description: "",
        tagSymbol: "",
        type: "withNumericParameter",
        requiredConsistency: false,
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
      };

      if (payload.type === "withCustomParameter") {
        payload.bracket = String(this.customTagForm.bracket || "<");
        payload.maskValue = !!this.customTagForm.maskValue;
      }

      if (this.customTagEditIndex >= 0) {
        this.callRuntime("updateAiCustomTag", this.customTagEditIndex, payload);
      } else {
        this.callRuntime("addAiCustomTag", payload);
      }

      this.callRuntime("bindEngineConfigTo", this.runtime);

      this.closeCustomTagDialog();
    },

    removeCustomTag(index) {
      this.callRuntime("removeAiCustomTag", index);
      this.callRuntime("bindEngineConfigTo", this.runtime);
    },
  },
};
