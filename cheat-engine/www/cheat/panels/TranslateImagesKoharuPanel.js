import { Alert } from '../js/AlertHelper.js';
import { ensureTranslationRuntime } from '../js/translation-runtime/TranslationRuntime.js';
import {
    ensureKoharuIntegrationRuntime,
    onKoharuRuntimeUpdated,
    PIPELINE_STEPS,
    CHEAT_ENGINE_TRANSLATOR_ID,
} from '../js/KoharuIntegrationRuntime.js';

export default {
    name: 'TranslateImagesKoharuPanel',

    template: `
<v-card flat class="ma-0 pa-0 fill-height d-flex flex-column">
    <v-card-title class="subtitle-1 font-weight-bold pb-1">Koharu Integration</v-card-title>

    <v-card-text class="pt-0 pb-2">
        <div class="caption mb-2">
            Translate game images using Koharu automated image translation pipeline.
        </div>

        <!-- API URL + Refresh -->
        <div class="d-flex align-center mb-2" style="gap: 8px;">
            <v-text-field
                v-model="apiUrl"
                label="Koharu API URL"
                dense
                outlined
                hide-details
                style="max-width: 340px;"
                @keydown.stop
                @change="onApiUrlChange">
            </v-text-field>

            <v-btn small outlined @click="onRefresh" :loading="isRefreshing">
                <v-icon small left>mdi-refresh</v-icon>Refresh
            </v-btn>

            <v-icon small :color="connected ? 'green' : 'red'">
                {{ connected ? 'mdi-circle' : 'mdi-circle-outline' }}
            </v-icon>
        </div>

        <div v-if="lastError" class="caption red--text mb-2">{{ lastError }}</div>

        <!-- Target language -->
        <v-select
            v-model="targetLanguage"
            :items="languageOptions"
            label="Target language"
            item-text="text"
            item-value="value"
            dense
            outlined
            hide-details
            style="max-width: 240px;"
            class="mb-2"
            :disabled="!connected"
            @keydown.stop
            @change="onSettingChange('targetLanguage', $event)">
        </v-select>
    </v-card-text>

    <v-divider></v-divider>

    <!-- Engine selection -->
    <v-card-text v-if="connected" class="pt-2 pb-1">
        <div class="caption font-weight-bold mb-1">Pipeline Engines</div>
        <div class="d-flex flex-wrap" style="gap: 8px;">
            <v-select
                v-for="dropdown in engineDropdowns"
                :key="dropdown.settingKey"
                v-model="engineSelections[dropdown.settingKey]"
                :items="dropdown.items"
                :label="dropdown.label"
                item-text="name"
                item-value="id"
                dense
                outlined
                hide-details
                style="max-width: 220px;"
                @keydown.stop
                @change="onEngineChange(dropdown.settingKey, $event)">
            </v-select>
        </div>
    </v-card-text>

    <v-divider v-if="connected"></v-divider>

    <!-- Project section -->
    <v-card-text v-if="connected" class="pt-2 pb-1">
        <div class="caption font-weight-bold mb-1">Project</div>

        <div v-if="!hasSourceImages" class="caption orange--text">
            No exported images found for language "{{ targetLanguage }}".
            Use the Images Exporter panel to export decoded images first.
        </div>

        <div v-else-if="!hasProject">
            <v-btn
                small
                color="primary"
                :loading="isCreatingProject"
                :disabled="isStepRunning"
                @click="onCreateProject">
                Create project with {{ sourceImageCount }} images
            </v-btn>
        </div>

        <div v-else class="caption">
            Project: <strong>{{ projectName }}</strong>
            &nbsp;({{ Object.keys(pageIdMappings).length }} pages)
        </div>
    </v-card-text>

    <v-divider v-if="connected && hasProject"></v-divider>

    <!-- Pipeline steps -->
    <v-card-text
        v-if="connected && hasProject"
        class="pt-2 pb-2 flex-grow-1"
        style="min-height: 0; overflow-y: auto;">
        <div class="caption font-weight-bold mb-1">Pipeline Steps</div>

        <div v-for="step in pipelineSteps" :key="step.id" class="d-flex align-center mb-1">
            <v-checkbox
                v-model="checkedStepIds"
                :value="step.id"
                :label="step.label"
                dense
                hide-details
                class="mt-0 pt-0"
                :disabled="isStepRunning">
            </v-checkbox>

            <v-spacer></v-spacer>

            <span
                v-if="runningStepId === step.id && stepProgress.total > 0"
                class="caption grey--text mr-2">
                {{ stepProgress.processed }} / {{ stepProgress.total }}
            </span>

            <v-btn
                v-if="runningStepId === step.id"
                x-small
                color="red"
                outlined
                @click="onCancelStep">
                Cancel
            </v-btn>
            <v-btn
                v-else
                x-small
                outlined
                :disabled="isStepRunning"
                @click="onRunSingleStep(step.id)">
                GO
            </v-btn>
        </div>

        <div class="mt-2">
            <v-btn
                small
                color="primary"
                :disabled="isStepRunning || checkedStepIds.length === 0"
                :loading="isStepRunning"
                @click="onRunCheckedSteps">
                Perform checked steps
            </v-btn>
        </div>
    </v-card-text>
</v-card>
    `,

    data() {
        return {
            // Connection
            apiUrl: 'http://localhost:4000/api/v1',
            connected: false,
            lastError: '',
            isRefreshing: false,

            // Language
            languageOptions: [],
            targetLanguage: 'en',

            // Engines
            engineDropdowns: [],
            engineSelections: {},

            // Project
            hasProject: false,
            projectName: '',
            pageIdMappings: {},
            hasSourceImages: false,
            sourceImageCount: 0,
            isCreatingProject: false,

            // Pipeline
            pipelineSteps: PIPELINE_STEPS,
            checkedStepIds: PIPELINE_STEPS.map((step) => step.id),
            runningStepId: '',
            stepProgress: { processed: 0, total: 0 },
            isStepRunning: false,

            // Internal — not exposed to Vue
            _pollTimerId: 0,
            _unsubscribe: null,
        };
    },

    created() {
        // Hold runtime reference outside Vue reactivity
        this._koharuRuntime = ensureKoharuIntegrationRuntime();

        const translationRuntime = ensureTranslationRuntime();
        const runtimeOptions = Array.isArray(translationRuntime?.languageOptions)
            ? translationRuntime.languageOptions
            : [];
        this.languageOptions = runtimeOptions.map((item) => ({ ...item }));

        // Sync initial state from runtime snapshot
        this._syncFromSnapshot();

        // Use target lang from translation runtime if koharu has none
        if (!this.targetLanguage && translationRuntime?.targetLang) {
            this.targetLanguage = translationRuntime.targetLang;
            this._koharuRuntime.setSetting('targetLanguage', this.targetLanguage);
        }

        if (!this.languageOptions.some((item) => item.value === this.targetLanguage)) {
            this.languageOptions.unshift({
                text: this.targetLanguage,
                value: this.targetLanguage,
            });
        }

        // Poll snapshot every second for progress updates
        this._pollTimerId = setInterval(() => {
            this._syncFromSnapshot();
        }, 1000);

        // Also subscribe to root events for immediate updates
        this._unsubscribe = onKoharuRuntimeUpdated(() => {
            this._syncFromSnapshot();
        });

        // Auto-refresh on first load
        this.onRefresh();
    },

    beforeDestroy() {
        if (this._pollTimerId) {
            clearInterval(this._pollTimerId);
            this._pollTimerId = 0;
        }
        if (typeof this._unsubscribe === 'function') {
            this._unsubscribe();
            this._unsubscribe = null;
        }
    },

    methods: {
        _syncFromSnapshot() {
            const snapshot = this._koharuRuntime.getSnapshot();
            this.connected = snapshot.connected;
            this.lastError = snapshot.lastError;
            this.runningStepId = snapshot.runningStepId;
            this.stepProgress = { ...snapshot.stepProgress };
            this.isStepRunning = !!snapshot.runningStepId;

            // Settings
            this.apiUrl = snapshot.settings.apiUrl || 'http://localhost:4000/api/v1';
            this.targetLanguage = snapshot.settings.targetLanguage || 'en';
            this.projectName = snapshot.settings.projectName || '';
            this.pageIdMappings = snapshot.settings.pageIdMappings || {};

            // Project status
            this.hasProject = this._koharuRuntime.hasValidProject();

            // Source images availability
            const targetPath = this._koharuRuntime.getTargetImagePath();
            if (targetPath) {
                const count = this._koharuRuntime.countImagesInPath(targetPath);
                this.hasSourceImages = count > 0;
                this.sourceImageCount = count;
            } else {
                this.hasSourceImages = false;
                this.sourceImageCount = 0;
            }

            // Engine dropdowns
            this._rebuildEngineDropdowns(snapshot.engines, snapshot.settings);
        },

        _rebuildEngineDropdowns(engines, settings) {
            if (!engines) {
                this.engineDropdowns = [];
                this.engineSelections = {};
                return;
            }

            const translatorItems = [
                { id: CHEAT_ENGINE_TRANSLATOR_ID, name: 'Cheat Engine' },
                ...(Array.isArray(engines.translators) ? engines.translators : []),
            ];

            const dropdownDefs = [
                { label: 'Detector', settingKey: 'selectedDetector', items: engines.detectors },
                {
                    label: 'Font Detector',
                    settingKey: 'selectedFontDetector',
                    items: engines.fontDetectors,
                },
                {
                    label: 'Segmenter',
                    settingKey: 'selectedSegmenter',
                    items: engines.segmenters,
                },
                {
                    label: 'Bubble Seg.',
                    settingKey: 'selectedBubbleSegmenter',
                    items: engines.bubbleSegmenters,
                },
                { label: 'OCR', settingKey: 'selectedOcr', items: engines.ocr },
                { label: 'Translator', settingKey: 'selectedTranslator', items: translatorItems },
                {
                    label: 'Inpainter',
                    settingKey: 'selectedInpainter',
                    items: engines.inpainters,
                },
                { label: 'Renderer', settingKey: 'selectedRenderer', items: engines.renderers },
            ];

            this.engineDropdowns = dropdownDefs.map((def) => ({
                ...def,
                items: Array.isArray(def.items) ? def.items : [],
            }));

            const nextSelections = {};
            for (const def of dropdownDefs) {
                nextSelections[def.settingKey] = settings[def.settingKey] || '';
            }
            this.engineSelections = nextSelections;
        },

        // -------------------------------------------------------------------
        // UI Event Handlers
        // -------------------------------------------------------------------

        onApiUrlChange(value) {
            this._koharuRuntime.setSetting('apiUrl', value);
        },

        onSettingChange(key, value) {
            this._koharuRuntime.setSetting(key, value);
        },

        onEngineChange(settingKey, value) {
            this._koharuRuntime.setSetting(settingKey, value);
        },

        async onRefresh() {
            this.isRefreshing = true;
            try {
                await this._koharuRuntime.refresh();
            } catch (error) {
                console.warn('[KoharuPanel] Refresh failed', error);
            }
            this._syncFromSnapshot();
            this.isRefreshing = false;
        },

        async onCreateProject() {
            this.isCreatingProject = true;
            try {
                const targetPath = this._koharuRuntime.getTargetImagePath();
                if (!targetPath) {
                    Alert.error('Target image path not available');
                    return;
                }

                const projectName = `rpgmaker-${this.targetLanguage}-${Date.now()}`;
                await this._koharuRuntime.createProject(projectName);
                await this._koharuRuntime.openCurrentProject();
                await this._koharuRuntime.uploadAllImages(targetPath);

                this._syncFromSnapshot();
                Alert.info(
                    `Project created and ${this.sourceImageCount} images uploaded`,
                    null,
                    2200
                );
            } catch (error) {
                Alert.error(String(error?.message || error));
            } finally {
                this.isCreatingProject = false;
                this._syncFromSnapshot();
            }
        },

        async onRunSingleStep(stepId) {
            try {
                await this._koharuRuntime.openCurrentProject();
                await this._koharuRuntime.runSteps([stepId], this._buildStepCallbacks());
                this._syncFromSnapshot();
                Alert.info(`Step "${stepId}" completed`, null, 1500);
            } catch (error) {
                Alert.error(String(error?.message || error));
                this._syncFromSnapshot();
            }
        },

        async onRunCheckedSteps() {
            try {
                await this._koharuRuntime.openCurrentProject();
                await this._koharuRuntime.runSteps(
                    this.checkedStepIds,
                    this._buildStepCallbacks()
                );
                this._syncFromSnapshot();
                Alert.info('All checked steps completed', null, 2200);
            } catch (error) {
                Alert.error(String(error?.message || error));
                this._syncFromSnapshot();
            }
        },

        async onCancelStep() {
            try {
                await this._koharuRuntime.cancelCurrentOperation();
                this._syncFromSnapshot();
                Alert.info('Operation cancelled', null, 1500);
            } catch (error) {
                Alert.error(String(error?.message || error));
            }
        },

        _buildStepCallbacks() {
            return {
                getTranslationsForKeys: (keys) => {
                    const runtime = ensureTranslationRuntime();
                    if (
                        !runtime ||
                        !runtime.translationCache ||
                        typeof runtime.getCacheKey !== 'function'
                    ) {
                        return {};
                    }

                    const result = {};
                    for (const key of keys) {
                        const cacheKey = runtime.getCacheKey(key, 'koharu');
                        const translation = runtime.translationCache.get(cacheKey);
                        if (translation) {
                            result[key] = translation;
                        }
                    }
                    return result;
                },

                runCheatEngineTranslation: async () => {
                    const runtime = ensureTranslationRuntime();
                    if (
                        !runtime ||
                        typeof runtime.getCacheKey !== 'function' ||
                        !runtime.translationCache
                    ) {
                        throw new Error('Translation runtime unavailable');
                    }

                    if (runtime.isNonOtfTranslationProcessActive()) {
                        const activeLabel = runtime.getActiveNonOtfTranslationProcessLabel();
                        Alert.warn(
                            `Another translation is already in progress (${activeLabel}).`,
                            null,
                            2200
                        );
                        throw new Error('Another translation queue is already running');
                    }

                    // Ensure latest scene text is materialized into koharu cache before translating.
                    const textEntries = await this._koharuRuntime.gatherKeys();

                    Alert.info(
                        `${textEntries.length} Koharu keys queued for translation`,
                        null,
                        2200
                    );

                    await runtime.runObjectTranslationJob(['koharu']);
                },
            };
        },
    },
};
