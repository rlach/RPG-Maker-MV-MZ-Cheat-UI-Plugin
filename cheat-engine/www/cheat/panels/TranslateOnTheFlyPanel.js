import { TranslateOnTheFlyState } from '../js/TranslateOnTheFlyState.js';
import { AIEngine } from '../translate-engines/index.js';
import { ensureTranslationRuntime } from '../js/translation-runtime/TranslationRuntime.js';
import { TRANSLATION_RUNTIME_STATE_KEYS } from '../js/translation-runtime/TranslationRuntimeDefaults.js';

const runtimeStateProxyComputed = TRANSLATION_RUNTIME_STATE_KEYS.reduce((acc, key) => {
    acc[key] = {
        get() {
            void this.stateVersion;
            return this._runtime ? this._runtime[key] : undefined;
        },
        set(value) {
            if (this._runtime) {
                this._runtime[key] = value;
                this.stateVersion++;
            }
        },
    };
    return acc;
}, {});

export default {
    name: 'TranslateOnTheFlyPanel',

    template: `
<v-card flat class="ma-0 pa-0">
    <v-card-subtitle class="pb-0 font-weight-bold">Translate Messages</v-card-subtitle>
    <v-card-text class="pb-0">
        Enable this to automatically translate all in-game messages using selected engine.
    </v-card-text>

    <v-card-text class="py-0">
        <v-switch
            v-model="enableTranslation"
            label="Enable translation"
            dense
            hide-details
            @click.self.stop
            @change="onChangeEnableTranslation">
        </v-switch>

        <v-switch
            v-model="enableImageReplacement"
            label="Enable image replacement"
            dense
            hide-details
            @click.self.stop
            @change="onChangeEnableImageReplacement">
        </v-switch>

        <v-switch
            v-model="enabled"
            label="Enable real-time events translation"
            dense
            hide-details
            @click.self.stop
            @change="onChangeEnabled">
        </v-switch>
    </v-card-text>

    <v-card-subtitle class="pb-0 mt-2 font-weight-bold">Real-time options</v-card-subtitle>

    <v-card-text class="py-0">
        <v-switch
            v-model="translateFullEventInRealtime"
            label="Try to translate full event"
            dense
            hide-details
            @click.self.stop
            @change="onChangeTranslateFullEventInRealtime">
        </v-switch>

        <v-switch
            v-model="interruptQueueForRealtime"
            label="Interrupt translation queue for real-time"
            dense
            hide-details
            @click.self.stop
            @change="onChangeInterruptQueueForRealtime">
        </v-switch>
    </v-card-text>

    <v-card-subtitle class="pb-0 mt-2 font-weight-bold">General options</v-card-subtitle>

    <v-card-text class="py-0">
        <v-switch
          v-model="changeToCurrentMapInMassTranslationMidPhase"
          label="Change to current map in mass translation mid-phase"
          dense
          hide-details
          @click.self.stop
          @change="onChangeCurrentMapMidPhasePriority">
        </v-switch>

                <v-switch
                        v-model="flatProgressWindow"
                        label="Flat progress window"
                        dense
                        hide-details
                        @click.self.stop
                        @change="onChangeFlatProgressWindow">
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
        <div class="d-flex align-center" style="gap: 8px;">
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
                @focus="$event.target.select()"
                style="flex: 1 1 auto;">
            </v-text-field>
            <v-text-field
                :value="textWrapLevel1RegularWidth"
                label="size +1 \\{"
                outlined
                dense
                type="number"
                hide-details
                disabled
                readonly
                style="flex: 0 0 100px; max-width: 100px;">
            </v-text-field>
            <v-text-field
                :value="textWrapLevel2RegularWidth"
                label="size +2 \\{\\{"
                outlined
                dense
                type="number"
                hide-details
                disabled
                readonly
                style="flex: 0 0 110px; max-width: 110px;">
            </v-text-field>
        </div>

        <div
            v-if="showNoPortraitMessagesDetectedInfo"
            class="caption orange--text text--darken-2 mb-1">
            No messages with portraits detected in game.
        </div>

        <div class="d-flex align-center" style="gap: 8px;">
            <v-text-field
                v-model.number="maxLineWidthWithPortrait"
                label="Maximum line width for dialogue with portrait"
                outlined
                dense
                type="number"
                min="20"
                max="200"
                hide-details
                :disabled="!enableTextWrapping"
                @keydown.self.stop
                @change="onChangeMaxWidthWithPortrait"
                @focus="$event.target.select()"
                style="flex: 1 1 auto;">
            </v-text-field>
            <v-text-field
                :value="textWrapLevel1PortraitWidth"
                label="size +1 \\{"
                outlined
                dense
                type="number"
                hide-details
                disabled
                readonly
                style="flex: 0 0 100px; max-width: 100px;">
            </v-text-field>
            <v-text-field
                :value="textWrapLevel2PortraitWidth"
                label="size +2 \\{\\{"
                outlined
                dense
                type="number"
                hide-details
                disabled
                readonly
                style="flex: 0 0 110px; max-width: 110px;">
            </v-text-field>
        </div>

        <div class="d-flex align-center" style="gap: 8px;">
            <v-tooltip bottom>
                <template v-slot:activator="{ on, attrs }">
                    <v-btn
                        icon
                        small
                        v-bind="attrs"
                        v-on="on"
                        :color="linkDescriptionMaxWidthToDialogue ? 'primary' : 'grey lighten-1'"
                        :disabled="!enableTextWrapping"
                        @click="toggleDescriptionWidthLink">
                        <v-icon small>
                            {{
                                linkDescriptionMaxWidthToDialogue
                                    ? 'mdi-link-variant'
                                    : 'mdi-link-variant-off'
                            }}
                        </v-icon>
                    </v-btn>
                </template>
                <span>
                    {{
                        linkDescriptionMaxWidthToDialogue
                            ? 'Linked: description width follows dialogue width'
                            : 'Unlinked: description width is independent'
                    }}
                </span>
            </v-tooltip>

            <v-text-field
                v-model.number="descriptionMaxLineWidth"
                label="Maximum line width for descriptions (items, skills etc.)"
                outlined
                dense
                type="number"
                min="20"
                max="200"
                hide-details
                :disabled="!enableTextWrapping || linkDescriptionMaxWidthToDialogue"
                @keydown.self.stop
                @change="onChangeDescriptionMaxWidth"
                @focus="$event.target.select()"
                style="flex: 1 1 auto;">
            </v-text-field>
            <v-text-field
                v-model.number="descriptionMaxRows"
                label="Max rows"
                outlined
                dense
                type="number"
                min="1"
                max="20"
                hide-details
                :disabled="!enableTextWrapping"
                @keydown.self.stop
                @change="onChangeDescriptionMaxRows"
                @focus="$event.target.select()"
                style="flex: 0 0 110px; max-width: 110px;">
            </v-text-field>
        </div>

        <v-checkbox
            v-model="addBoxWidthInfoToLlmPrompt"
            label="Add box width info to LLM prompt with descriptions"
            dense
            hide-details
            class="mt-1 mb-1"
            @change="onChangeAddBoxWidthInfoToLlmPrompt">
        </v-checkbox>

        <div class="d-flex align-center mt-2" style="gap: 8px;">
            <v-text-field
                v-model.number="removeNewlinesBeforeWrappingMaxCount"
                label="Remove existing newlines before wrapping if there are"
                outlined
                dense
                type="number"
                min="0"
                max="20"
                hide-details
                :disabled="!enableTextWrapping"
                @keydown.self.stop
                @change="onChangeRemoveNewlinesBeforeWrappingMaxCount"
                @focus="$event.target.select()"
                style="flex: 0 0 auto; width: 80px;">
            </v-text-field>
            <span class="caption grey--text text--lighten-1" style="white-space: nowrap;">or less in a row</span>
        </div>

        <v-text-field
            v-model="textWrapFontScaleMultiplier"
            label="Text scale width multiplier per \\{ level"
            outlined
            dense
            type="number"
            min="0.01"
            step="0.01"
            hide-details
            :disabled="!enableTextWrapping"
            @keydown.self.stop
            @change="onChangeTextWrapFontScaleMultiplier"
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
            stateVersion: 0,
        };
    },

    created() {
        this._runtime = ensureTranslationRuntime();
        this.syncRuntimeRefs();

        this.stateUnsubscribe = TranslateOnTheFlyState.subscribe((enabled) => {
            if (this._runtime) {
                this._runtime.enabled = enabled;
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
            void this.stateVersion;
            return this._translationCache ? this._translationCache.size : 0;
        },

        hasMessagePortraitCacheEntries() {
            void this.stateVersion;

            if (!this._translationCache) {
                return false;
            }

            for (const cacheKey of this._translationCache.keys()) {
                if (cacheKey.startsWith('message_portrait:')) {
                    return true;
                }
            }

            return false;
        },

        showNoPortraitMessagesDetectedInfo() {
            return this.dryRunExecutedAtLeastOnce && !this.hasMessagePortraitCacheEntries;
        },

        normalizedTextWrapFontScaleMultiplier() {
            const parsed = Number(
                typeof this.textWrapFontScaleMultiplier === 'string'
                    ? this.textWrapFontScaleMultiplier.replace(',', '.')
                    : this.textWrapFontScaleMultiplier
            );

            return Number.isFinite(parsed) && parsed > 0 ? parsed : 0.69;
        },

        textWrapLevel1RegularWidth() {
            return Math.floor(
                (Number(this.maxLineWidth) || 0) * this.normalizedTextWrapFontScaleMultiplier
            );
        },

        textWrapLevel1PortraitWidth() {
            return Math.floor(
                (Number(this.maxLineWidthWithPortrait) || 0) *
                    this.normalizedTextWrapFontScaleMultiplier
            );
        },

        textWrapLevel2RegularWidth() {
            const multiplier = this.normalizedTextWrapFontScaleMultiplier;
            return Math.floor((Number(this.maxLineWidth) || 0) * multiplier * multiplier);
        },

        textWrapLevel2PortraitWidth() {
            const multiplier = this.normalizedTextWrapFontScaleMultiplier;
            return Math.floor(
                (Number(this.maxLineWidthWithPortrait) || 0) * multiplier * multiplier
            );
        },
    },

    methods: {
        syncRuntimeRefs() {
            if (!this._runtime) {
                return;
            }

            this._translationCache = this._runtime.translationCache;
            this._lastSeenByCacheKey = this._runtime.lastSeenByCacheKey;
            this._pendingTranslations = this._runtime.pendingTranslations;
            this._failedTranslations = this._runtime.failedTranslations;
            this._batchManager = this._runtime.batchManager;
            this._engine = this._runtime.engine;
            this.stateVersion++;
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
                return result.finally(() => {
                    this.syncRuntimeRefs();
                });
            }

            this.syncRuntimeRefs();
            return result;
        },

        onChangeEnabled() {
            return this.callRuntime('onChangeEnabled');
        },

        onChangeEnableTranslation() {
            return this.callRuntime('onChangeEnableTranslation');
        },

        onChangeEnableImageReplacement() {
            return this.callRuntime('onChangeEnableImageReplacement');
        },

        onChangeTranslateFullEventInRealtime() {
            return this.callRuntime('onChangeTranslateFullEventInRealtime');
        },

        onChangeInterruptQueueForRealtime() {
            return this.callRuntime('onChangeInterruptQueueForRealtime');
        },

        onChangeCurrentMapMidPhasePriority() {
            return this.callRuntime('onChangeCurrentMapMidPhasePriority');
        },

        onChangeFlatProgressWindow() {
            return this.callRuntime('onChangeFlatProgressWindow');
        },

        onChangeTranslationEngine() {
            return this.callRuntime('onChangeTranslationEngine');
        },

        onChangeSourceLang() {
            return this.callRuntime('onChangeSourceLang');
        },

        onChangeTargetLang() {
            return this.callRuntime('onChangeTargetLang');
        },

        fetchAiModels() {
            return this.callRuntime('fetchAiModels');
        },

        onChangeAiProvider(v) {
            return this.callRuntime('onChangeAiProvider', v);
        },

        onChangeAiHost(v) {
            return this.callRuntime('onChangeAiHost', v);
        },

        onChangeAiApiKey(v) {
            return this.callRuntime('onChangeAiApiKey', v);
        },

        onChangeAiModel(v) {
            return this.callRuntime('onChangeAiModel', v);
        },

        onChangeAiAskIfTextTranslated(v) {
            return this.callRuntime('onChangeAiAskIfTextTranslated', v);
        },

        onChangeAiInvalidJsonHandlingStrategy(v) {
            return this.callRuntime('onChangeAiInvalidJsonHandlingStrategy', v);
        },

        onChangeAiInvalidJsonResendCount(v) {
            return this.callRuntime('onChangeAiInvalidJsonResendCount', v);
        },

        onChangeAiLengthMultiplierForMaxLength(v) {
            return this.callRuntime('onChangeAiLengthMultiplierForMaxLength', v);
        },

        onChangeAiMinimumMaxLength(v) {
            return this.callRuntime('onChangeAiMinimumMaxLength', v);
        },

        onChangeAiBannedPhrases(v) {
            return this.callRuntime('onChangeAiBannedPhrases', v);
        },

        onChangeAiSystemPrompt(v) {
            return this.callRuntime('onChangeAiSystemPrompt', v);
        },

        onChangeAiFixRecursionMaxDepth(v) {
            return this.callRuntime('onChangeAiFixRecursionMaxDepth', v);
        },

        onChangeUseJsonFixer(v) {
            return this.callRuntime('onChangeUseJsonFixer', v);
        },

        onChangeTextWrapping() {
            return this.callRuntime('onChangeTextWrapping');
        },

        onChangeMaxWidth() {
            return this.callRuntime('onChangeMaxWidth');
        },

        onChangeMaxWidthWithPortrait() {
            return this.callRuntime('onChangeMaxWidthWithPortrait');
        },

        onChangeDescriptionMaxWidth() {
            return this.callRuntime('onChangeDescriptionMaxWidth');
        },

        toggleDescriptionWidthLink() {
            this.linkDescriptionMaxWidthToDialogue = !this.linkDescriptionMaxWidthToDialogue;
            return this.callRuntime('onChangeLinkDescriptionMaxWidthToDialogue');
        },

        onChangeDescriptionMaxRows() {
            return this.callRuntime('onChangeDescriptionMaxRows');
        },

        onChangeAddBoxWidthInfoToLlmPrompt() {
            return this.callRuntime('onChangeAddBoxWidthInfoToLlmPrompt');
        },

        onChangeRemoveNewlinesBeforeWrappingMaxCount() {
            return this.callRuntime('onChangeRemoveNewlinesBeforeWrappingMaxCount');
        },

        onChangeTextWrapFontScaleMultiplier() {
            return this.callRuntime('onChangeTextWrapFontScaleMultiplier');
        },

        onChangeCharLimit() {
            return this.callRuntime('onChangeCharLimit');
        },

        onChangeBatchItemsLimit() {
            return this.callRuntime('onChangeBatchItemsLimit');
        },

        clearCache() {
            return this.callRuntime('clearCache');
        },
    },
};
