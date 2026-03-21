import { Alert } from '../js/AlertHelper.js';
import { MessageCheat, GeneralCheat } from '../js/CheatHelper.js';
import { KeyValueStorage } from '../js/KeyValueStorage.js';
import { TranslateOnTheFlyState } from '../js/TranslateOnTheFlyState.js';
import { ensureTranslateCacheRuntime, notifyTranslateCacheRuntimeChanged } from '../js/TranslateCacheRuntime.js';
import { AIEngine, createEngine, getAvailableEngines } from '../translate-engines/index.js';

export default {
    name: 'TranslateOnTheFlyPanel',

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
            </v-card-text>
            <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn text color="grey" @click="closeObjectTranslationModal">Cancel</v-btn>
                <v-btn text color="primary" @click="startObjectTranslationFromModal">Start</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</v-card>
    `,

    data() {
        const engineOptions = getAvailableEngines();
        return {
            enabled: false,
            sourceLang: 'ja',
            targetLang: 'en',
            translationCount: 0,
            enableTextWrapping: true,
            maxLineWidth: 60,
            descriptionMaxLineWidth: 59,
            translationEngine: 'mymemory',
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
                { text: 'English', value: 'en' },
                { text: 'Japanese (日本語)', value: 'ja' },
                { text: 'Spanish (Español)', value: 'es' },
                { text: 'French (Français)', value: 'fr' },
                { text: 'German (Deutsch)', value: 'de' },
                { text: 'Italian (Italiano)', value: 'it' },
                { text: 'Portuguese (Português)', value: 'pt' },
                { text: 'Russian (Русский)', value: 'ru' },
                { text: 'Korean (한국어)', value: 'ko' },
                { text: 'Chinese Simplified (简体中文)', value: 'zh-CN' },
                { text: 'Chinese Traditional (繁體中文)', value: 'zh-TW' },
                { text: 'Polish (Polski)', value: 'pl' }
            ],
            // Engine-specific UI defaults to avoid runtime reactivity warnings
            // LibreTranslate
            libreTranslateHost: 'http://127.0.0.1:5000',
            libreTranslateApiKey: '',
            // AI Engine (OpenAPI compatible / Open WebUI)
            aiProvider: 'openApi',
            aiProviderOptions: [
                { text: 'OpenAPI compatible', value: 'openApi' },
                { text: 'Open WebUI', value: 'openwebui' }
            ],
            aiHost: 'http://localhost:4891',
            aiApiKey: '',
            aiSelectedModel: '',
            aiModels: [],
            aiLoadingModels: false,
            aiModelsError: '',
            aiAllowNewlineMismatch: false,
            aiAskIfTextTranslated: true,
            aiInvalidJsonHandlingStrategy: 'resendFirstHalf',
            aiInvalidJsonHandlingStrategyOptions: [
                { text: 'Split into two half-batches', value: 'resendFirstHalf' },
                { text: 'Ask AI to fix it', value: 'askAIToFix' },
                { text: 'Use JsonFixer', value: 'useJsonFixer' },
                { text: 'None', value: 'none' }
            ],
            aiSystemPrompt: 'You are translating scripts that contain [[tags]]. Altering contents or order of any such tags, removing or adding tags will break the script. DO NOT REMOVE OR ADD ANY TAGS. Only translate the text, do not comment or add anything else. Do not bold, DO NOT FORMAT THE RESPONSE, RETURN IT ALL IN ONE LINE',
            // Track the current message window and $gameMessage for live refresh
            currentMessageWindow: null,
            currentGameMessage: null,
            useJsonFixer: true,
            aiFixRecursionMaxDepth: 0,
            objectTranslationDialogVisible: false,
            objectTranslationModalStats: [],
            objectTranslationSelection: {},
            objectTranslationJob: {
                active: false,
                currentTypeLabel: '',
                currentDone: 0,
                currentTotal: 0,
                totalDone: 0,
                totalTarget: 0,
                runErrors: 0
            }
        };
    },

    created() {
        this.kvStorage = new KeyValueStorage('./www/cheat-settings/translate-on-the-fly.json');
        this.cacheStorage = new KeyValueStorage('./www/cheat-settings/translate-cache.json');
        const runtime = ensureTranslateCacheRuntime(window.__TranslateOnTheFlyCache || new Map());
        this.translationCache = runtime.cache;
        this.lastSeenByCacheKey = runtime.lastSeenByCacheKey;
        this.pendingTranslations = new Map();
        this.failedTranslations = new Map(); // Track failed translation attempts to prevent retry spam
        this.translationInProgress = false;
        this._foregroundDialogBatchState = {
            active: false,
            operationKey: '',
            sourceTrigger: '',
            startedAt: 0,
            promise: null
        };
        this._foregroundBatchWatchdogMs = 60000;
        this._foregroundPreemptedOperationKey = '';
        this.loadSettings(); // Load settings first so 'enabled' is set
        this.loadCacheFromDisk();
        
        // Create engine instance after settings are loaded
        this.engine = createEngine(this.translationEngine, this);
        
        // Restore engine-specific settings if available
        if (this.engineSettings && this.engineSettings[this.translationEngine]) {
            const engineConfig = this.engineSettings[this.translationEngine];
            Object.assign(this.engine, engineConfig);
        }
        
        // Bind engine config data to panel for reactivity (always sync)
        const engineConfigData = this.engine.getConfigData();
        Object.keys(engineConfigData).forEach(key => {
            this.$set(this, key, engineConfigData[key]);
        });
        
        // Bind engine config methods to panel
        const engineConfigMethods = this.engine.getConfigMethods();
        Object.keys(engineConfigMethods).forEach(methodName => {
            if (!this[methodName]) {
                this[methodName] = engineConfigMethods[methodName].bind(this.engine);
            }
        });
        
        this.deferHookInitialization();

        console.log('[TranslateOnTheFly] init created enabled=', this.enabled, 'state=', TranslateOnTheFlyState.isEnabled());

        this.stateUnsubscribe = TranslateOnTheFlyState.subscribe((enabled) => {
            this.enabled = enabled;
        });

        window.__TranslateOnTheFlyPanel = this;
        console.log('[TOF-DEBUG][TranslateOnTheFlyPanel] created and exposed on window', {
            deferredOpenFlag: !!window.__TOF_OPEN_OBJECT_TRANSLATION_MODAL__
        });

        if (window.__TOF_OPEN_OBJECT_TRANSLATION_MODAL__) {
            window.__TOF_OPEN_OBJECT_TRANSLATION_MODAL__ = false;
            setTimeout(() => {
                console.log('[TOF-DEBUG][TranslateOnTheFlyPanel] deferred open flag consumed -> opening object translation modal');
                this.openObjectTranslationModal();
            }, 0);
        }
        
        if (this.translateCacheWhenDisabled) {
            console.log('[TranslateOnTheFly] Applying cached translations to data objects');
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

        if (this._objectTranslationModalEl && this._objectTranslationModalEl.parentNode) {
            this._objectTranslationModalEl.parentNode.removeChild(this._objectTranslationModalEl);
            this._objectTranslationModalEl = null;
        }

        if (this._objectTranslationModalStyle && this._objectTranslationModalStyle.parentNode) {
            this._objectTranslationModalStyle.parentNode.removeChild(this._objectTranslationModalStyle);
            this._objectTranslationModalStyle = null;
        }
    },

    computed: {
        cachedCount() {
            return this.translationCache ? this.translationCache.size : 0;
        }
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
                console.log('[TranslateOnTheFly] Hook initialized (delayed)');
            }, 1000);
        },

        loadSettings() {
            const json = this.kvStorage.getItem('data');
            
            if (!json) {
                // Use defaults
                this.enabled = false;
                this.sourceLang = 'ja';
                this.enableTextWrapping = true;
                this.maxLineWidth = 60;
                this.translateCacheWhenDisabled = false;
                this.tryTranslateAhead = false;
                TranslateOnTheFlyState.setEnabled(this.enabled, { notify: false });
                return;
            }
            
            const data = JSON.parse(json);
            this.enabled = data.enabled || false;
            this.sourceLang = data.sourceLang || 'ja';
            this.targetLang = data.targetLang || 'en';
            this.translationCount = data.translationCount || 0;
            this.enableTextWrapping = data.enableTextWrapping !== undefined ? data.enableTextWrapping : true;
            this.maxLineWidth = data.maxLineWidth || 60;
                this.descriptionMaxLineWidth = data.descriptionMaxLineWidth || 59;
            this.charLimit = data.charLimit || 1000;
            this.batchItemsLimit = data.batchItemsLimit || 20;
            const savedEngine = data.translationEngine || 'mymemory';
            this.translationEngine = savedEngine === 'gpt4all' ? 'openApi' : savedEngine;
            this.translateCacheWhenDisabled = data.translateCacheWhenDisabled || false;
            this.tryTranslateAhead = data.tryTranslateAhead || false;
            this.translateGameObjects = data.translateGameObjects !== undefined ? data.translateGameObjects : true;
            this.cancelBackgroundForOnTheFly = data.cancelBackgroundForOnTheFly !== undefined ? data.cancelBackgroundForOnTheFly : false;
            
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
                engineSettings: this.engineSettings || {}
            };
            this.kvStorage.setItem('data', JSON.stringify(data));
        },

        onChangeCacheOnly() {
            // When real-time is enabled, this flag is ignored; still persist for when disabled later
            this.saveSettings();
            this.notifyCacheRuntime('settings-cache-only');
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
                { id: 'items', label: 'items', kind: 'data', getContainer: () => window.$dataItems, fields: ['name', 'description', 'note'], cachePrefix: 'item' },
                { id: 'skills', label: 'skills', kind: 'data', getContainer: () => window.$dataSkills, fields: ['name', 'description', 'message1', 'message2'], cachePrefix: 'skill' },
                { id: 'classes', label: 'classes', kind: 'data', getContainer: () => window.$dataClasses, fields: ['name'], cachePrefix: 'class' },
                { id: 'enemies', label: 'enemies', kind: 'data', getContainer: () => window.$dataEnemies, fields: ['name'], cachePrefix: 'enemy' },
                { id: 'armors', label: 'armors', kind: 'data', getContainer: () => window.$dataArmors, fields: ['name', 'description'], cachePrefix: 'armor' },
                { id: 'weapons', label: 'weapons', kind: 'data', getContainer: () => window.$dataWeapons, fields: ['name', 'description'], cachePrefix: 'weapon' },
                { id: 'maps', label: 'maps', kind: 'data', getContainer: () => window.$dataMapInfos, fields: ['name'], cachePrefix: 'map' },
                { id: 'actors', label: 'actors', kind: 'data', getContainer: () => window.$dataActors, fields: ['name', 'nickname', 'profile'], cachePrefix: 'actor' },
                { id: 'systemMessages', label: 'system messages', kind: 'systemMessages' }
            ];
        },

        getObjectTranslationStats() {
            const defs = this.getObjectTranslationTypeDefs();
            return defs.map(def => {
                if (def.kind === 'systemMessages') {
                    const stats = this.countSystemMessagesStats();
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
                        if(!item._translateOriginal[field] && item[field]) {
                            item._translateOriginal[field] = item[field];
                        }
                    }

                    let hasUntranslated = false;
                    for (const field of def.fields) {
                        const originalValue = item._translateOriginal[field];
                        if (!originalValue || typeof originalValue !== 'string' || originalValue.trim() === '') {
                            continue;
                        }

                        totalStrings++;
                        const cacheKey = this.getCacheKey(originalValue, `${def.cachePrefix}_${field}`);
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

        countSystemMessagesStats() {
            if (!window.$dataSystem || !$dataSystem.terms || !$dataSystem.terms.messages || typeof $dataSystem.terms.messages !== 'object') {
                return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
            }

            const source = $dataSystem.terms.messagesOriginal || $dataSystem.terms.messages;
            const keys = Object.keys(source || {});

            let total = 0;
            let left = 0;
            for (const key of keys) {
                const value = source[key];
                if (typeof value !== 'string' || value.trim() === '') {
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
                leftStrings: left
            };
        },

        ensureObjectTranslationModalElements() {
            const currentDoc = (typeof document !== 'undefined') ? document : null;
            const parentDoc = this.getSpinnerHostDocument();

            let hostDoc = currentDoc;
            if (window.__CHEAT_EXTERNAL_WINDOW__ && window.opener && !window.opener.closed && window.opener.document) {
                hostDoc = window.opener.document;
            } else if (!hostDoc) {
                hostDoc = parentDoc;
            }

            if (!hostDoc) {
                console.warn('[TOF-DEBUG][TranslateOnTheFlyPanel] ensureObjectTranslationModalElements: no host document');
                return null;
            }

            console.log('[TOF-DEBUG][TranslateOnTheFlyPanel] ensureObjectTranslationModalElements', {
                hostHref: hostDoc.location ? hostDoc.location.href : null,
                isExternalWindow: !!window.__CHEAT_EXTERNAL_WINDOW__
            });

            if (this._objectTranslationModalEl && this._objectTranslationModalEl.ownerDocument !== hostDoc) {
                if (this._objectTranslationModalEl.parentNode) {
                    this._objectTranslationModalEl.parentNode.removeChild(this._objectTranslationModalEl);
                }
                this._objectTranslationModalEl = null;
            }

            if (this._objectTranslationModalStyle && this._objectTranslationModalStyle.ownerDocument !== hostDoc) {
                if (this._objectTranslationModalStyle.parentNode) {
                    this._objectTranslationModalStyle.parentNode.removeChild(this._objectTranslationModalStyle);
                }
                this._objectTranslationModalStyle = null;
            }

            if (!this._objectTranslationModalStyle) {
                const existingStyle = hostDoc.getElementById('tof-object-translation-modal-style');
                const style = existingStyle || hostDoc.createElement('style');
                style.id = 'tof-object-translation-modal-style';
                style.textContent = [
                    '#tof-object-translation-modal { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; z-index: 10000; background: rgba(0, 0, 0, 0.55); }',
                    '#tof-object-translation-modal .tof-modal-card { width: 540px; max-width: calc(100vw - 24px); max-height: calc(100vh - 24px); overflow: auto; background: #1f1f1f; color: #f2f2f2; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.45); }',
                    '#tof-object-translation-modal .tof-modal-header { padding: 14px 16px 8px 16px; font-size: 16px; font-weight: 700; }',
                    '#tof-object-translation-modal .tof-modal-sub { padding: 0 16px 8px 16px; color: #bdbdbd; font-size: 12px; }',
                    '#tof-object-translation-modal .tof-modal-list { padding: 0 16px 10px 16px; }',
                    '#tof-object-translation-modal .tof-modal-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }',
                    '#tof-object-translation-modal .tof-modal-item:last-child { border-bottom: none; }',
                    '#tof-object-translation-modal .tof-modal-item label { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }',
                    '#tof-object-translation-modal .tof-modal-meta { color: #9e9e9e; font-size: 12px; white-space: nowrap; }',
                    '#tof-object-translation-modal .tof-modal-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 10px 16px 16px 16px; }',
                    '#tof-object-translation-modal .tof-btn { border: none; border-radius: 4px; padding: 6px 12px; cursor: pointer; font-size: 12px; font-weight: 700; }',
                    '#tof-object-translation-modal .tof-btn-start { background: #42a5f5; color: #fff; }',
                    '#tof-object-translation-modal .tof-btn-cancel { background: #616161; color: #fff; }'
                ].join('');
                if (!existingStyle) {
                    hostDoc.head.appendChild(style);
                }
                this._objectTranslationModalStyle = style;
            }

            if (!this._objectTranslationModalEl) {
                const existingEl = hostDoc.getElementById('tof-object-translation-modal');
                const el = existingEl || hostDoc.createElement('div');
                el.id = 'tof-object-translation-modal';
                el.innerHTML = [
                    '<div class="tof-modal-card">',
                    '  <div class="tof-modal-header">Object Translation</div>',
                    '  <div class="tof-modal-sub">Select what to translate. Counts show remaining objects and total.</div>',
                    '  <div class="tof-modal-list" id="tof-object-translation-list"></div>',
                    '  <div class="tof-modal-actions">',
                    '    <button class="tof-btn tof-btn-cancel" id="tof-object-translation-cancel">Cancel</button>',
                    '    <button class="tof-btn tof-btn-start" id="tof-object-translation-start">Start</button>',
                    '  </div>',
                    '</div>'
                ].join('');
                if (!existingEl) {
                    hostDoc.body.appendChild(el);
                }
                this._objectTranslationModalEl = el;
            }

            return this._objectTranslationModalEl;
        },

        openObjectTranslationModal() {
            console.log('[TOF-DEBUG][TranslateOnTheFlyPanel] openObjectTranslationModal called', {
                jobActive: !!(this.objectTranslationJob && this.objectTranslationJob.active)
            });

            if (this.objectTranslationJob.active) {
                Alert.warn('Object translation is already in progress');
                return;
            }

            if (this.checkIfDataIsLOaded()) {
                console.warn('[TOF-DEBUG][TranslateOnTheFlyPanel] openObjectTranslationModal aborted: data not loaded');
                Alert.warn('Game data is not fully loaded yet');
                return;
            }

            const stats = this.getObjectTranslationStats();
            this.objectTranslationModalStats = stats;
            for (const item of stats) {
                if (this.objectTranslationSelection[item.id] === undefined) {
                    this.$set(this.objectTranslationSelection, item.id, item.left > 0);
                }
            }
            this.objectTranslationDialogVisible = true;
        },

        closeObjectTranslationModal() {
            this.objectTranslationDialogVisible = false;
        },

        async startObjectTranslationFromModal() {
            const selected = [];
            const stats = this.objectTranslationModalStats || [];
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
                Alert.warn('Select at least one type to translate');
                return;
            }

            this.closeObjectTranslationModal();
            await this.runObjectTranslationJob(selected);
        },

        hasPendingDialogTranslation() {
            if (this.isForegroundDialogBatchActive()) {
                return true;
            }

            if (!this.pendingTranslations || this.pendingTranslations.size === 0) {
                return false;
            }

            for (const key of this.pendingTranslations.keys()) {
                if (typeof key !== 'string') continue;
                if (key.startsWith('text:') || key.startsWith('speaker:') || key.startsWith('choice:')) {
                    return true;
                }
            }

            return false;
        },

        isForegroundDialogBatchActive() {
            return !!(this._foregroundDialogBatchState && this._foregroundDialogBatchState.active);
        },

        async waitForForegroundDialogBatch() {
            const state = this._foregroundDialogBatchState;
            if (state && state.active && state.promise) {
                try {
                    await state.promise;
                } catch (e) {
                    // Foreground errors are handled by the caller pipeline.
                }
            }
        },

        async waitForBackgroundTranslationSlot() {
            const hasBackgroundJob = () => {
                return !!(
                    this.objectTranslationJob && this.objectTranslationJob.active
                    || this._backgroundTranslationInProgress
                );
            };

            while (hasBackgroundJob() && this.hasPendingDialogTranslation()) {
                await new Promise(resolve => setTimeout(resolve, 75));
            }
        },

        isBackgroundPreemptedResult(result) {
            if (!result || typeof result !== 'object') {
                return false;
            }

            if (Array.isArray(result.successes) && result.successes.length > 0) {
                return false;
            }

            if (!Array.isArray(result.failures) || result.failures.length === 0) {
                return false;
            }

            return result.failures.every(failure => {
                return !!(failure && (failure.preempted || failure.cancelReason === 'background_preempted'));
            });
        },

        async batchTranslateWithBackgroundRetry(items, label = 'background batch') {
            const safeItems = Array.isArray(items) ? items : [];
            if (safeItems.length === 0) {
                return { successes: [], failures: [] };
            }

            const maxPreemptedRetries = 5;
            let attempts = 0;

            while (attempts <= maxPreemptedRetries) {
                await this.waitForBackgroundTranslationSlot();
                const result = await this.engine.batchTranslate(safeItems, { backgroundJob: true });

                if (!this.isBackgroundPreemptedResult(result)) {
                    return result;
                }

                attempts += 1;
                if (attempts > maxPreemptedRetries) {
                    return result;
                }

                console.log(`[TranslateOnTheFly] Background batch preempted (${label}), instant retry ${attempts}/${maxPreemptedRetries}`);
                await this.waitForForegroundDialogBatch();
            }

            return { successes: [], failures: [] };
        },

        buildForegroundOperationKey({ currentText, currentSpeakerName, maxDepth }) {
            const interpreter = this.findMessageInterpreter();
            const normalized = this.resolveOriginalMessageContext(currentText, currentSpeakerName, interpreter);
            const normalizedText = normalized.text || currentText || '';
            const normalizedSpeaker = normalized.speaker || currentSpeakerName || '';

            const choices = ($gameMessage && typeof $gameMessage.choices === 'function')
                ? ($gameMessage._translateOriginalChoices || $gameMessage.choices() || [])
                : [];

            const choiceKeyPart = Array.isArray(choices)
                ? choices.map(choice => this.getCacheKey(choice, 'choice')).join('|')
                : '';

            const mapId = (window.$gameMap && typeof $gameMap.mapId === 'function') ? $gameMap.mapId() : 0;
            const eventId = interpreter && typeof interpreter._eventId === 'number' ? interpreter._eventId : 0;
            const index = interpreter && typeof interpreter._index === 'number' ? interpreter._index : 0;
            const depth = Number(maxDepth) || 0;

            return [
                mapId,
                eventId,
                index,
                depth,
                this.getCacheKey(normalizedText, 'text'),
                this.getCacheKey(normalizedSpeaker, 'speaker'),
                choiceKeyPart
            ].join('::');
        },

        preemptBackgroundForForeground(operationKey, sourceTrigger = 'unknown') {
            if (!this.cancelBackgroundForOnTheFly) {
                return false;
            }

            if (!this.engine || typeof this.engine.cancelActiveBackgroundRequest !== 'function') {
                return false;
            }

            if (this._foregroundPreemptedOperationKey === operationKey) {
                return false;
            }

            if (typeof this.engine.hasActiveBackgroundRequest === 'function' && !this.engine.hasActiveBackgroundRequest()) {
                return false;
            }

            const cancelled = this.engine.cancelActiveBackgroundRequest();
            if (cancelled) {
                this._foregroundPreemptedOperationKey = operationKey;
                console.log(`[TranslateOnTheFly] Foreground preempted active background request (trigger: ${sourceTrigger})`);
            }

            return cancelled;
        },

        requestForegroundDialogBatch({ currentText, currentSpeakerName, cacheKey, maxDepth, sourceTrigger = 'unknown' }) {
            if (!this._foregroundDialogBatchState) {
                this._foregroundDialogBatchState = {
                    active: false,
                    operationKey: '',
                    sourceTrigger: '',
                    startedAt: 0,
                    promise: null
                };
            }

            const state = this._foregroundDialogBatchState;
            const operationKey = this.buildForegroundOperationKey({ currentText, currentSpeakerName, maxDepth });

            if (state.active && state.promise) {
                return state.promise;
            }

            this.preemptBackgroundForForeground(operationKey, sourceTrigger);

            const promise = Promise.resolve().then(() => this.startAheadTranslation({
                currentText,
                currentSpeakerName,
                cacheKey,
                maxDepth
            }));

            state.active = true;
            state.operationKey = operationKey;
            state.sourceTrigger = sourceTrigger;
            state.startedAt = Date.now();
            state.promise = promise;

            const watchdogMs = this._foregroundBatchWatchdogMs || 60000;
            setTimeout(() => {
                if (!state.active || state.promise !== promise) {
                    return;
                }

                console.warn(`[TranslateOnTheFly] Foreground batch watchdog released lock after ${watchdogMs}ms`);
                state.active = false;
                state.operationKey = '';
                state.sourceTrigger = '';
                state.startedAt = 0;
                state.promise = null;
            }, watchdogMs);

            return promise.finally(() => {
                if (state.promise !== promise) {
                    return;
                }

                state.active = false;
                state.operationKey = '';
                state.sourceTrigger = '';
                state.startedAt = 0;
                state.promise = null;
                this._foregroundPreemptedOperationKey = '';
            });
        },

        updateObjectTranslationProgress() {
            const job = this.objectTranslationJob;
            const currentLine = `${job.currentDone}/${job.currentTotal} ${job.currentTypeLabel} translated`;
            const totalLine = `${job.totalDone}/${job.totalTarget} total strings translated (run errors: ${job.runErrors}, total errors: ${this.failedTranslations.size})`;
            this.updateProgressBox(currentLine, totalLine);
        },

        async runObjectTranslationJob(selectedTypeIds) {
            if (this.objectTranslationJob.active) {
                Alert.warn('Object translation is already in progress');
                return;
            }

            if (!this.engine || typeof this.engine.batchTranslate !== 'function') {
                Alert.error('Translation engine not initialized');
                return;
            }

            if (!this.isEngineFullyConfigured()) {
                Alert.warn('Translation engine is not fully configured');
                return;
            }

            const allStats = this.getObjectTranslationStats();
            const selectedStats = allStats.filter(stat => selectedTypeIds.includes(stat.id));
            const defsById = new Map(this.getObjectTranslationTypeDefs().map(def => [def.id, def]));

            const totalTarget = selectedStats.reduce((sum, stat) => sum + (stat.leftStrings || 0), 0);

            this.objectTranslationJob = {
                active: true,
                currentTypeLabel: '',
                currentDone: 0,
                currentTotal: 0,
                totalDone: 0,
                totalTarget,
                runErrors: 0
            };

            try {
                this.applyCachedTranslationsToData();

                for (const stat of selectedStats) {
                    const def = defsById.get(stat.id);
                    if (!def || stat.left <= 0) {
                        continue;
                    }

                    this.objectTranslationJob.currentTypeLabel = stat.label;
                    this.objectTranslationJob.currentDone = 0;
                    this.objectTranslationJob.currentTotal = stat.left;
                    this.updateObjectTranslationProgress();

                    if (def.kind === 'systemMessages') {
                        const batchResult = await this.translateSystemMessagesBatch(true);
                        this.objectTranslationJob.currentDone = stat.left;
                        this.objectTranslationJob.totalDone += batchResult.successes;
                        this.objectTranslationJob.runErrors += batchResult.failures;
                        this.updateObjectTranslationProgress();
                        continue;
                    }

                    const container = def.getContainer && def.getContainer();
                    if (!Array.isArray(container)) {
                        continue;
                    }

                    const pendingObjects = [];
                    for (let i = 1; i < container.length; i++) {
                        const item = container[i];
                        if (!item) continue;
                        const hasUntranslated = this.hasUntranslatedFields(item, def.fields, def.cachePrefix);
                        if (hasUntranslated) {
                            pendingObjects.push(item);
                        }
                    }

                    const BATCH_SIZE = 10;
                    for (let i = 0; i < pendingObjects.length; i += BATCH_SIZE) {
                        const batch = pendingObjects.slice(i, i + BATCH_SIZE);
                        const batchResult = await this.translateDataBatch(batch, def.fields, def.cachePrefix, { backgroundJob: true });
                        this.objectTranslationJob.currentDone += batch.length;
                        this.objectTranslationJob.totalDone += batchResult.successes;
                        this.objectTranslationJob.runErrors += batchResult.failures;
                        this.updateObjectTranslationProgress();
                    }
                }

                Alert.success(`Object translation finished. ${this.objectTranslationJob.totalDone}/${this.objectTranslationJob.totalTarget} strings translated`);
            } catch (error) {
                console.error('[TranslateOnTheFly] Object translation job failed:', error);
                Alert.error(`Object translation failed: ${error.message || error}`);
            } finally {
                this.objectTranslationJob.active = false;
                this.hideProgressBox();
            }
        },

        async translateSystemMessagesBatch(backgroundJob = false) {
            if (!(window.$dataSystem && $dataSystem.terms && $dataSystem.terms.messages && typeof $dataSystem.terms.messages === 'object')) {
                return { successes: 0, failures: 0 };
            }

            const hasMessagesOriginal = !!$dataSystem.terms.messagesOriginal;
            const sourceMessages = hasMessagesOriginal ? $dataSystem.terms.messagesOriginal : $dataSystem.terms.messages;
            if (!hasMessagesOriginal) {
                $dataSystem.terms.messagesOriginal = Object.assign({}, $dataSystem.terms.messages || {});
            }

            const pending = [];
            for (const key of Object.keys(sourceMessages || {})) {
                const val = sourceMessages[key];
                if (typeof val !== 'string' || val.trim() === '') {
                    continue;
                }
                if (!this.hasUsableCacheValue(key)) {
                    pending.push({ type: 'system_message', id: `msg_${key}`, value: val, cacheKey: key });
                }
            }

            if (!pending.length) {
                return { successes: 0, failures: 0 };
            }

            let successes = 0;
            let failures = 0;
            const batches = [];
            let cur = [];
            let curChars = 0;
            for (const item of pending) {
                const len = (item.value || '').length;
                if (cur.length >= (this.batchItemsLimit || 20) || (curChars + len) > (this.charLimit || 1000)) {
                    if (cur.length) batches.push(cur);
                    cur = [];
                    curChars = 0;
                }
                cur.push(item);
                curChars += len;
            }
            if (cur.length) batches.push(cur);

            for (const batch of batches) {
                this.showSpinner();
                const batchItems = batch.map(x => ({ type: x.type, id: x.id, value: x.value, cacheKey: x.cacheKey }));
                const res = backgroundJob
                    ? await this.batchTranslateWithBackgroundRetry(batchItems, 'system messages')
                    : await this.engine.batchTranslate(batchItems, { backgroundJob: false });
                this.hideSpinner();

                for (const s of res.successes) {
                    if (s.cacheKey) {
                        this.setCacheValue(s.cacheKey, s.translated);
                        if ($dataSystem.terms.messages && Object.prototype.hasOwnProperty.call($dataSystem.terms.messages, s.cacheKey)) {
                            $dataSystem.terms.messages[s.cacheKey] = s.translated;
                        }
                    }
                }

                this.markBatchFailuresAsUntranslated(res.failures, true);

                successes += res.successes.length;
                failures += res.failures.length;
            }

            return { successes, failures };
        },

        findMessageInterpreter() {
            const candidates = [];

            if (window.$gameMap) {
                if ($gameMap._interpreter) {
                    candidates.push($gameMap._interpreter);
                }

                if (typeof $gameMap.events === 'function') {
                    for (const ev of $gameMap.events()) {
                        if (ev && ev._interpreter) {
                            candidates.push(ev._interpreter);
                        }
                    }
                }

                if (Array.isArray($gameMap._commonEvents)) {
                    for (const ce of $gameMap._commonEvents) {
                        if (ce && ce._interpreter) {
                            candidates.push(ce._interpreter);
                        }
                    }
                }
            }

            if (window.$gameTroop && $gameTroop._interpreter) {
                candidates.push($gameTroop._interpreter);
            }

            // Helper to recursively find deepest child interpreter
            const getDeepestChild = (interp) => {
                if (!interp) return null;
                if (interp._childInterpreter) {
                    const child = getDeepestChild(interp._childInterpreter);
                    return child || interp;
                }
                return interp;
            };

            // Expand candidates to include all child interpreters recursively
            const expandedCandidates = [];
            for (const candidate of candidates) {
                expandedCandidates.push(candidate);
                let child = candidate._childInterpreter;
                while (child) {
                    expandedCandidates.push(child);
                    child = child._childInterpreter;
                }
            }

            console.log('[findMessageInterpreter] Found candidates:', expandedCandidates.length, expandedCandidates.map(it => ({
                isRunning: it && typeof it.isRunning === 'function' && it.isRunning(),
                waitMode: it && it._waitMode,
                haslist: it && Array.isArray(it._list),
                listLength: it && it._list && it._list.length,
                index: it && it._index
            })));

            // First: look for interpreter waiting on message
            const found = expandedCandidates.find((it) => it && typeof it.isRunning === 'function' && it.isRunning() && it._waitMode === 'message');
            
            if (found) {
                return found;
            }

            // Fallback: try to find any running interpreter with a list
            const fallback = expandedCandidates.find((it) => it && typeof it.isRunning === 'function' && it.isRunning() && it._list && it._list.length > 0);
            if (fallback) {
                console.log('[findMessageInterpreter] Using fallback interpreter (not waiting for message but has list)');
                return fallback;
            }
            
            return null;
        },

        getInterpreterCurrentMessageEntry(interpreter) {
            if (!interpreter || !Array.isArray(interpreter._list) || interpreter._list.length === 0) {
                return null;
            }

            const list = interpreter._list;
            const start = Math.max(0, Math.min(list.length - 1, Number(interpreter._index) || 0));

            const extractAt = (messageCmdIndex) => {
                if (messageCmdIndex < 0 || messageCmdIndex >= list.length) {
                    return null;
                }
                const cmd = list[messageCmdIndex];
                if (!cmd || cmd.code !== 101) {
                    return null;
                }

                const speaker = (cmd.parameters && cmd.parameters[4]) || '';
                const lines = [];
                let j = messageCmdIndex + 1;
                while (j < list.length && list[j] && list[j].code === 401) {
                    lines.push(list[j].parameters && list[j].parameters[0]);
                    j++;
                }

                if (lines.length === 0) {
                    return null;
                }

                return {
                    text: lines.join('\n'),
                    speaker
                };
            };

            for (let i = start; i >= 0; i--) {
                const found = extractAt(i);
                if (found) {
                    return found;
                }
            }

            for (let i = start + 1; i < list.length; i++) {
                const found = extractAt(i);
                if (found) {
                    return found;
                }
            }

            return null;
        },

        resolveOriginalMessageContext(currentText, currentSpeaker, interpreter) {
            let resolvedText = currentText || '';
            let resolvedSpeaker = currentSpeaker || '';

            if (window.$gameMessage) {
                if (typeof $gameMessage._translateOriginalText === 'string' && $gameMessage._translateOriginalText.length > 0) {
                    resolvedText = $gameMessage._translateOriginalText;
                }
                if (typeof $gameMessage._translateOriginalSpeaker === 'string' && $gameMessage._translateOriginalSpeaker.length > 0) {
                    resolvedSpeaker = $gameMessage._translateOriginalSpeaker;
                }
            }

            const entry = this.getInterpreterCurrentMessageEntry(interpreter);
            if (entry) {
                const displayedText = (window.$gameMessage && typeof $gameMessage.allText === 'function') ? ($gameMessage.allText() || '') : '';
                const seemsDisplayedText = !!(resolvedText && displayedText && resolvedText === displayedText);

                if (!resolvedText || seemsDisplayedText) {
                    resolvedText = entry.text || resolvedText;
                }
                if (!resolvedSpeaker) {
                    resolvedSpeaker = entry.speaker || resolvedSpeaker;
                }
            }

            return {
                text: resolvedText || '',
                speaker: resolvedSpeaker || ''
            };
        },

        collectAheadItems(currentText, currentSpeaker, interpreter, options = {}) {
            const charLimit = options.charLimit || this.charLimit;
            const maxItems = options.maxItems || this.batchItemsLimit || 20;
            const maxDepth = options.maxDepth !== undefined ? options.maxDepth : 999;
            
            console.log('[Lookahead] Starting collection', { charLimit, maxItems, maxDepth, currentText, currentSpeaker });
            
            const NL = '\n';
            const items = []; // Unified list: { type: 'text'|'speaker'|'choice', id: string, value: string }
            let totalChars = 0;
            let itemIdCounter = 0;
            let stopReason = '';
            const seenCacheKeys = new Set();

            const pushItem = (type, value, force = false) => {
                // Skip empty strings, null, undefined (but continue scanning)
                if (value == null || typeof value !== 'string' || value.trim() === '') {
                    return true; // Skip empty, continue
                }
                
                // Check cache first - skip cached items (don't add to translation)
                const cacheKey = this.getCacheKey(value, type);
                if (!force && this.hasUsableCacheValue(cacheKey)) {
                    return true; // Skip cached, continue
                }

                // Avoid duplicates in one batch
                if (seenCacheKeys.has(cacheKey)) {
                    return true; // Skip cached, continue
                }
                
                if (!force && items.length >= maxItems) {
                    stopReason = 'items limit reached';
                    return false;
                }

                if (!force && (totalChars + value.length) > charLimit) {
                    stopReason = 'charLimit reached';
                    return false;
                }

                const id = `${type}_${itemIdCounter++}`;
                items.push({ type, id, value, cacheKey });
                totalChars += value.length;
                seenCacheKeys.add(cacheKey);
                
                return true; // Continue
            };

            // Always include current text and speaker first (forced)
            if (currentText) pushItem('text', currentText, true);
            if (currentSpeaker) pushItem('speaker', currentSpeaker, true);

            // If maxDepth is 0, only return current message
            if (maxDepth === 0 || !interpreter || !Array.isArray(interpreter._list)) {
                console.log('[Lookahead] Stopped: early return', { 
                    reason: maxDepth === 0 ? 'maxDepth is 0' : !interpreter ? 'no interpreter' : 'interpreter._list not array',
                    maxDepth, 
                    hasInterpreter: !!interpreter, 
                    isListArray: interpreter && Array.isArray(interpreter._list),
                    totalItems: items.length 
                });
                return items;
            }

            const list = interpreter._list;
            const entries = [];
            for (let i = 0; i < list.length; i++) {
                const cmd = list[i];
                if (!cmd || typeof cmd.code !== 'number') {
                    continue;
                }

                if (cmd.code === 101) {
                    const speaker = (cmd.parameters && cmd.parameters[4]) || '';
                    const lines = [];
                    let j = i + 1;
                    while (j < list.length && list[j] && list[j].code === 401) {
                        lines.push(list[j].parameters && list[j].parameters[0]);
                        j++;
                    }

                    const joined = lines.join(NL);
                    entries.push({ cmdIndex: i, type: 'text', value: joined });
                    if (speaker) {
                        entries.push({ cmdIndex: i, type: 'speaker', value: speaker });
                    }
                    i = j - 1;
                    continue;
                }

                if (cmd.code === 102) {
                    const choices = cmd.parameters && cmd.parameters[0];
                    if (Array.isArray(choices)) {
                        for (const choice of choices) {
                            entries.push({ cmdIndex: i, type: 'choice', value: choice });
                        }
                    }
                }
            }

            if (!entries.length) {
                return items;
            }

            const startCmdIndex = Math.max(0, Number(interpreter._index) || 0);
            let pivot = entries.findIndex(e => e.cmdIndex >= startCmdIndex && e.type === 'text' && e.value === currentText);
            if (pivot < 0) {
                pivot = entries.findIndex(e => e.type === 'text' && e.value === currentText);
            }
            if (pivot < 0) {
                pivot = entries.findIndex(e => e.cmdIndex >= startCmdIndex);
            }
            if (pivot < 0) {
                pivot = 0;
            }

            for (let k = 0; k < entries.length; k++) {
                const idx = (pivot + k) % entries.length;
                const entry = entries[idx];
                if (!pushItem(entry.type, entry.value)) {
                    break;
                }
            }

            // Log completion info
            console.log('[Lookahead] Scan completed', { 
                totalCandidates: entries.length,
                listLength: list.length,
                totalItems: items.length, 
                totalChars,
                reason: stopReason || 'loop ended'
            });

            return items;
        },

        async startAheadTranslation({ currentText, currentSpeakerName, cacheKey, maxDepth }) {
            let pendingKeys = null;
            try {
                const interpreter = this.findMessageInterpreter();
                const normalized = this.resolveOriginalMessageContext(currentText, currentSpeakerName, interpreter);
                const normalizedCurrentText = normalized.text || currentText || '';
                const normalizedCurrentSpeaker = normalized.speaker || currentSpeakerName || '';

                const items = this.collectAheadItems(normalizedCurrentText, normalizedCurrentSpeaker, interpreter, {
                    charLimit: this.charLimit,
                    maxItems: this.batchItemsLimit,
                    maxDepth
                });

                // Add current choices from $gameMessage if present
                if ($gameMessage && $gameMessage.isChoice && $gameMessage.isChoice()) {
                    const currentChoices = $gameMessage._translateOriginalChoices || $gameMessage.choices();
                    if (Array.isArray(currentChoices)) {
                        for (let i = 0; i < currentChoices.length; i++) {
                            const choice = currentChoices[i];
                            const choiceCacheKey = this.getCacheKey(choice, 'choice');
                            if (!this.hasUsableCacheValue(choiceCacheKey)) {
                                if (!items.some(item => item.cacheKey === choiceCacheKey)) {
                                    items.push({
                                        type: 'choice',
                                        id: `current_choice_${i}`,
                                        value: choice,
                                        cacheKey: choiceCacheKey,
                                        mandatory: true
                                    });
                                }
                            }
                        }
                    }
                }

                if (!items.length) {
                    return;
                }

                // Filter out items already in cache
                const uncached = items.filter(item => !this.hasUsableCacheValue(item.cacheKey));
                
                if (uncached.length === 0) {
                    // All items cached, apply current text immediately
                    const firstTextItem = items.find(item => item.type === 'text');
                    if (firstTextItem) {
                        const cached = this.translationCache.get(firstTextItem.cacheKey);
                        if (cached) {
                            this.replaceMessageText(cached);
                            this._translationApplied = true;
                        }
                    }
                    return;
                }

                // Deduplicate by cacheKey - only send unique items to translator
                const uniqueMap = new Map();
                for (const item of uncached) {
                    if (!uniqueMap.has(item.cacheKey)) {
                        uniqueMap.set(item.cacheKey, item);
                    }
                }
                const uniqueItemsRaw = Array.from(uniqueMap.values());

                const mandatoryCacheKeys = new Set();
                if (normalizedCurrentText) {
                    mandatoryCacheKeys.add(this.getCacheKey(normalizedCurrentText, 'text'));
                }
                if (normalizedCurrentSpeaker) {
                    mandatoryCacheKeys.add(this.getCacheKey(normalizedCurrentSpeaker, 'speaker'));
                }
                if ($gameMessage && $gameMessage.isChoice && $gameMessage.isChoice()) {
                    const currentChoices = $gameMessage._translateOriginalChoices || $gameMessage.choices();
                    if (Array.isArray(currentChoices)) {
                        for (const choice of currentChoices) {
                            mandatoryCacheKeys.add(this.getCacheKey(choice, 'choice'));
                        }
                    }
                }

                const mandatoryItems = [];
                const optionalItems = [];
                for (const item of uniqueItemsRaw) {
                    if (item.mandatory || mandatoryCacheKeys.has(item.cacheKey)) {
                        mandatoryItems.push(item);
                    } else {
                        optionalItems.push(item);
                    }
                }

                const maxItems = this.batchItemsLimit || 20;
                const maxChars = this.charLimit || 1000;
                const uniqueItems = [];
                let charsUsed = 0;

                for (const item of mandatoryItems) {
                    uniqueItems.push(item);
                    charsUsed += (item.value || '').length;
                }

                for (const item of optionalItems) {
                    if (uniqueItems.length >= maxItems) {
                        break;
                    }

                    const nextLen = (item.value || '').length;
                    if ((charsUsed + nextLen) > maxChars) {
                        break;
                    }

                    uniqueItems.push(item);
                    charsUsed += nextLen;
                }

                // Mark as pending (all uncached, including duplicates)
                pendingKeys = new Set();
                for (const item of uniqueItems) {
                    this.pendingTranslations.set(item.cacheKey, true);
                    pendingKeys.add(item.cacheKey);
                }

                console.log(`[TranslateOnTheFly] Batch translating ${uniqueItems.length} items (${uniqueItems.filter(i => i.type === 'text').length} texts, ${uniqueItems.filter(i => i.type === 'speaker').length} speakers, ${uniqueItems.filter(i => i.type === 'choice').length} choices)`);

                // Batch translate via engine (only unique items)
                this.showSpinner();
                const result = await this.engine.batchTranslate(uniqueItems, { backgroundJob: false });
                this.hideSpinner();

                // Apply successes to cache
                for (const success of result.successes) {
                    this.setCacheValue(success.cacheKey, success.translated);
                }

                // Log failures
                for (const failure of result.failures) {
                    console.warn(`[TranslateOnTheFly] Failed to translate ${failure.type}:`, failure.value, '→', failure.rejectReason);
                }
                this.markBatchFailuresAsUntranslated(result.failures, true);

                // Apply the current text (now hopefully cached)
                const firstTextItem = items.find(item => item.type === 'text');
                if (firstTextItem) {
                    const translated = this.translationCache.get(firstTextItem.cacheKey);
                    if (translated) {
                        this.replaceMessageText(translated);
                        this._translationApplied = true;

                        this.translationCount += result.successes.filter(s => s.type === 'text').length;
                        this.saveSettings();
                    } else {
                        // Translation failed, show original
                        this.replaceMessageText(normalizedCurrentText || currentText || '');
                        this._translationApplied = true;
                    }
                }

                // Apply translated choices if present (per-choice cache only)
                if ($gameMessage && $gameMessage.isChoice && $gameMessage.isChoice()) {
                    const originalChoices = $gameMessage._translateOriginalChoices || $gameMessage.choices();
                    const translatedChoices = originalChoices.map(choice => {
                        const choiceCacheKey = this.getCacheKey(choice, 'choice');
                        return this.translationCache.get(choiceCacheKey) || choice;
                    });

                    this.replaceChoiceText(translatedChoices);
                }

                console.log(`[TranslateOnTheFly] Batch complete: ${result.successes.length} successes, ${result.failures.length} failures`);

            } catch (error) {
                console.error('[TranslateOnTheFly] Ahead translation error:', error);
                if (pendingKeys) {
                    for (const key of pendingKeys) {
                        this.failedTranslations.set(key, Date.now());
                        if (!this.hasUsableCacheValue(key)) {
                            this.setCacheValue(key, '');
                        }
                    }
                }
                this.replaceMessageText(currentText || '');
                this._translationApplied = true;
            } finally {
                this.hideSpinner();
                // Clear pending flags
                if (pendingKeys) {
                    for (const key of pendingKeys) {
                        this.pendingTranslations.delete(key);
                    }
                }
            }
        },

        onChangeEnabled() {
            TranslateOnTheFlyState.setEnabled(this.enabled);
            this.saveSettings();
            this.notifyCacheRuntime('settings-enabled');
            if (this.enabled) {
                console.log('[TranslateOnTheFly] Translation enabled');
            } else {
                console.log('[TranslateOnTheFly] Translation disabled');
            }
        },

        onChangeSourceLang() {
            // Don't clear cache - keys contain source/target lang, so they don't conflict
            this.saveSettings();
            this.notifyCacheRuntime('settings-language');
        },

        onChangeTargetLang() {
            // Don't clear cache - keys contain source/target lang, so they don't conflict
            this.saveSettings();
            this.notifyCacheRuntime('settings-language');
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
            Object.keys(engineConfigData).forEach(key => {
                this.$set(this, key, engineConfigData[key]);
            });
            
            // Bind new engine config methods to panel
            const engineConfigMethods = this.engine.getConfigMethods();
            Object.keys(engineConfigMethods).forEach(methodName => {
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
            if (!this.batchItemsLimit || this.batchItemsLimit < 1) this.batchItemsLimit = 1;
            this.saveSettings();
        },

        clearCache() {
            const count = this.translationCache.size;
            const seenCount = this.lastSeenByCacheKey ? this.lastSeenByCacheKey.size : 0;
            this.translationCache.clear();
            if (this.lastSeenByCacheKey) {
                this.lastSeenByCacheKey.clear();
            }
            this.persistCache();
            this.notifyCacheRuntime('cache-cleared');
            console.log(`[TranslateOnTheFly] Cleared ${count} cached translations and ${seenCount} seen timestamps`);
        },

        shouldTrackRealtimeCacheUsage() {
            return this.isTranslationEnabled() || !!this.translateCacheWhenDisabled;
        },

        isRealtimeTrackableType(type) {
            return type === 'text' || type === 'choice';
        },

        isTranslatedCacheValue(value) {
            if (typeof value !== 'string') {
                return value !== null && value !== undefined;
            }

            return value !== '';
        },

        hasUsableCacheValue(cacheKey) {
            if (!cacheKey || !this.translationCache || !this.translationCache.has(cacheKey)) {
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

                if (!this.hasUsableCacheValue(failure.cacheKey)) {
                    this.setCacheValue(failure.cacheKey, '');
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

                if (!this.hasUsableCacheValue(item.cacheKey)) {
                    this.setCacheValue(item.cacheKey, '');
                }
            }
        },

        getCacheKeyType(cacheKey) {
            if (typeof cacheKey !== 'string') {
                return '';
            }

            const idx = cacheKey.indexOf(':');
            if (idx <= 0) {
                return '';
            }

            return cacheKey.slice(0, idx);
        },

        ensureRealtimeTrackedCacheEntry(value, type) {
            if (!this.shouldTrackRealtimeCacheUsage() || !this.isRealtimeTrackableType(type)) {
                return null;
            }

            if (typeof value !== 'string' || value.trim() === '') {
                return null;
            }

            const cacheKey = this.getCacheKey(value, type);
            if (!this.translationCache.has(cacheKey)) {
                this.setCacheValue(cacheKey, '');
            }

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
            this.notifyCacheRuntime('seen-updated', cacheKey);
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
                this.notifyCacheRuntime('cache-delete', cacheKey);
            }
        },

        notifyCacheRuntime(reason = 'unknown', key = null) {
            notifyTranslateCacheRuntimeChanged(reason, key);
        },

        isTranslationEnabled() {
            // Prefer global state; fall back to local flag to survive any desync on startup
            const stateEnabled = TranslateOnTheFlyState.isEnabled();
            const localEnabled = this.enabled;
            const enabled = stateEnabled || localEnabled;
            if (enabled && !this._loggedEnabledOnce) {
                console.log('[TranslateOnTheFly] isTranslationEnabled true (state/local):', stateEnabled, localEnabled);
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
            this.notifyCacheRuntime('settings-enabled');

            if (notify) {
                Alert.success(`Real-time translation: ${enabled ? 'enabled' : 'disabled'}`);
            }
        },

        toggleEnabledExternal(notify = true) {
            const enabled = TranslateOnTheFlyState.toggleEnabled();
            this.applyExternalToggle(enabled, notify);
            return enabled;
        },

        setupTranslationHook() {
            const self = this;
            
            // Store original canStart if not already stored
            if (!Window_Message.prototype._originalCanStart) {
                Window_Message.prototype._originalCanStart = Window_Message.prototype.canStart;
            }

            // Override canStart to block until translation is ready
            Window_Message.prototype.canStart = function() {
                // Store reference to this message window and $gameMessage for Alt+R refresh
                self.currentMessageWindow = this;
                self.currentGameMessage = $gameMessage;
                
                const originalCanStart = Window_Message.prototype._originalCanStart.call(this);
                const translationEnabled = self.isTranslationEnabled();
                const skipping = self.isSkippingMessages();
                const allowTranslation = translationEnabled && !skipping;
                const useCacheOnly = (translationEnabled && skipping) || (!translationEnabled && self.translateCacheWhenDisabled);

                if (translationEnabled && allowTranslation && !$gameMessage._translateOriginalText) {
                    // Lightweight trace to confirm hook runs after restart
                    // console.log('[TranslateOnTheFly] canStart hook engaged, allowTranslation');
                }
                
                if (!originalCanStart || (!translationEnabled && !useCacheOnly) || !!BattleManager._phase) {
                    return originalCanStart;
                }
                
                const originalText = $gameMessage._translateOriginalText || $gameMessage.allText();
                const hasText = !!(originalText && originalText.trim().length > 0);

                // Remember original text (even empty) for later key lookups (startInput)
                if ($gameMessage._translateOriginalText === undefined) {
                    $gameMessage._translateOriginalText = originalText || '';
                }

                const cacheKey = hasText ? self.getCacheKey(originalText, 'text') : null;
                const choices = ($gameMessage.choices && $gameMessage.choices()) || [];
                const originalChoices = $gameMessage._translateOriginalChoices || choices;
                const hasChoices = Array.isArray(originalChoices) && originalChoices.length > 0;
                const choiceCacheKeys = hasChoices ? originalChoices.map(choice => self.getCacheKey(choice, 'choice')) : [];

                const originalSpeakerName = $gameMessage._translateOriginalSpeaker || $gameMessage._speakerName || '';
                const hasSpeakerName = !!(originalSpeakerName && originalSpeakerName.trim().length > 0);
                const speakerKey = hasSpeakerName ? self.getCacheKey(originalSpeakerName, 'speaker') : null;
                const legacySpeakerKey = hasSpeakerName ? self.getLegacySpeakerCacheKey(originalSpeakerName) : null;
                if (hasSpeakerName) {
                    $gameMessage._translateOriginalSpeaker = originalSpeakerName;
                }
                
                if (hasSpeakerName && legacySpeakerKey && self.translationCache.has(legacySpeakerKey) && !self.translationCache.has(speakerKey)) {
                    const legacyValue = self.translationCache.get(legacySpeakerKey);
                    self.setCacheValue(speakerKey, legacyValue);
                }

                if (self.shouldTrackRealtimeCacheUsage()) {
                    if (hasText) {
                        self.touchRealtimeEntry(originalText, 'text');
                    }
                    if (hasChoices) {
                        for (const choice of originalChoices) {
                            self.touchRealtimeEntry(choice, 'choice');
                        }
                    }
                }

                const textReady = !hasText || (cacheKey && self.hasUsableCacheValue(cacheKey));
                const choicesReady = !hasChoices || choiceCacheKeys.every(key => self.hasUsableCacheValue(key));
                const speakerReady = !hasSpeakerName || self.hasUsableCacheValue(speakerKey);

                if (useCacheOnly) {
                    if (!this._translationApplied && hasText && textReady) {
                        const translatedText = self.translationCache.get(cacheKey);
                        if (translatedText !== undefined) {
                            self.replaceMessageText(translatedText);
                            this._translationApplied = true;
                        }
                    }

                    if (hasChoices && choicesReady) {
                        const translatedChoices = originalChoices.map((choice, idx) => {
                            const key = choiceCacheKeys[idx];
                            return self.translationCache.get(key) || choice;
                        });
                        self.replaceChoiceText(translatedChoices);
                    }

                    if (hasSpeakerName && speakerReady) {
                        const cachedSpeaker = self.translationCache.get(speakerKey) || self.translationCache.get(legacySpeakerKey);
                        self.replaceSpeakerName(cachedSpeaker);
                    }

                    return originalCanStart;
                }
                
                // Check if this message was already translated
                if (!this._translationApplied) {
                    // If we have cached translation, apply it now (text + choices + speaker)
                    if (allowTranslation && textReady && choicesReady && speakerReady) {
                        if (hasText) {
                            const translatedText = cacheKey ? self.translationCache.get(cacheKey) : null;
                            if (translatedText !== undefined && translatedText !== null) {
                                self.replaceMessageText(translatedText);
                            }
                        }

                        if (hasChoices) {
                            const translatedChoices = originalChoices.map((choice, idx) => {
                                const key = choiceCacheKeys[idx];
                                return self.translationCache.get(key) || choice;
                            });
                            self.replaceChoiceText(translatedChoices);
                        }

                        if (hasSpeakerName && speakerReady) {
                            const cachedSpeaker = self.translationCache.get(speakerKey) || self.translationCache.get(legacySpeakerKey);
                            self.replaceSpeakerName(cachedSpeaker);
                        }

                        this._translationApplied = true;
                        console.log('[TranslateOnTheFly] Applied cached translation');
                        return originalCanStart;
                    }
                    
                    // If translation is pending, keep blocking
                    if (allowTranslation && (
                        self.isForegroundDialogBatchActive() ||
                        (cacheKey && self.pendingTranslations.has(cacheKey)) ||
                        (hasChoices && choiceCacheKeys.some(key => self.pendingTranslations.has(key)))
                    )) {
                        return false;
                    }
                    
                    // If main text translation failed and is in cooldown, don't retry yet (show original)
                    if (allowTranslation && cacheKey && self.failedTranslations.has(cacheKey)) {
                        const failedTime = self.failedTranslations.get(cacheKey);
                        const cooldownMs = 5000; // Wait 5 seconds before retrying failed translation
                        if (Date.now() - failedTime < cooldownMs) {
                            // Show original, don't try to translate again
                            if (!this._translationApplied) {
                                this._translationApplied = true;
                            }
                            return originalCanStart;
                        } else {
                            // Cooldown expired, remove from failed and allow retry
                            self.failedTranslations.delete(cacheKey);
                        }
                    }
                    
                    // Start translation with unified batch approach (maxDepth=0 for single, >0 for lookahead)
                    if (allowTranslation && hasText && !textReady) {
                        const maxDepth = self.tryTranslateAhead ? 999 : 0; // 0 = only current message, 999 = scan ahead
                        const logPrefix = maxDepth > 0 ? 'ahead translation batch' : 'translation';
                        console.log(`[TranslateOnTheFly] Starting 01 ${logPrefix} for:`, originalText.substring(0, 50));

                        self.requestForegroundDialogBatch({
                            currentText: originalText,
                            currentSpeakerName: originalSpeakerName,
                            cacheKey,
                            maxDepth,
                            sourceTrigger: 'Starting 01'
                        });
                    }

                    // Choices: respect cooldown on failures to avoid loops
                    if (allowTranslation && hasChoices && !choicesReady && choiceCacheKeys.some(key => self.failedTranslations.has(key))) {
                        const failedTime = Math.max(...choiceCacheKeys.map(key => self.failedTranslations.get(key) || 0));
                        const cooldownMs = 5000;
                        if (Date.now() - failedTime < cooldownMs) {
                            // Use original choices during cooldown and skip retry
                            self.replaceChoiceText(originalChoices);
                            // Still apply cached text/speaker if available so dialog is translated
                            if (!this._translationApplied) {
                                if (hasText && textReady) {
                                    const translatedText = cacheKey ? self.translationCache.get(cacheKey) : null;
                                    if (translatedText !== undefined && translatedText !== null) {
                                        self.replaceMessageText(translatedText);
                                    }
                                }
                                if (hasSpeakerName && speakerReady) {
                                    const cachedSpeaker = self.translationCache.get(speakerKey) || self.translationCache.get(legacySpeakerKey);
                                    if (cachedSpeaker) {
                                        self.replaceSpeakerName(cachedSpeaker);
                                    }
                                }
                                this._translationApplied = true;
                            }
                            return originalCanStart;
                        } else {
                            for (const key of choiceCacheKeys) {
                                self.failedTranslations.delete(key);
                            }
                            // fall through to start translation below
                        }
                    }

                    // If no text or text already cached, but choices are missing, trigger batch translation as well
                    if (allowTranslation && hasChoices && !choicesReady && !choiceCacheKeys.some(key => self.pendingTranslations.has(key))) {
                        const maxDepth = self.tryTranslateAhead ? 999 : 0;
                        const logPrefix = maxDepth > 0 ? 'ahead translation batch for choices' : 'translation for choices';
                        console.log(`[TranslateOnTheFly] Starting 02 ${logPrefix}`);

                        self.requestForegroundDialogBatch({
                            currentText: originalText || '',
                            currentSpeakerName: originalSpeakerName,
                            cacheKey: cacheKey || self.getCacheKey(originalText || '', 'text'),
                            maxDepth,
                            sourceTrigger: 'Starting 02'
                        });
                    }

                    // Choices are now translated together with text in startAheadTranslation batch
                    // Just apply them if cached
                    if (choicesReady) {
                        const cachedChoices = originalChoices.map((choice, idx) => {
                            const key = choiceCacheKeys[idx];
                            return self.translationCache.get(key) || choice;
                        });
                        self.replaceChoiceText(cachedChoices);
                    }

                    // Speaker: respect cooldown on failures to avoid loops
                    if (allowTranslation && hasSpeakerName && !speakerReady && self.failedTranslations.has(speakerKey)) {
                        const failedTime = self.failedTranslations.get(speakerKey);
                        const cooldownMs = 5000;
                        if (Date.now() - failedTime < cooldownMs) {
                            // Keep original speaker during cooldown
                            self.replaceSpeakerName(originalSpeakerName);
                            // Do not start translation now
                            return false; // still block start until text is handled above
                        } else {
                            self.failedTranslations.delete(speakerKey);
                        }
                    }

                    // Start translation for speaker via unified foreground batch path.
                    if (allowTranslation && hasSpeakerName && !speakerReady) {
                        const maxDepth = self.tryTranslateAhead ? 999 : 0;
                        self.requestForegroundDialogBatch({
                            currentText: originalText || '',
                            currentSpeakerName: originalSpeakerName,
                            cacheKey: cacheKey || self.getCacheKey(originalText || '', 'text'),
                            maxDepth,
                            sourceTrigger: 'speaker'
                        });
                    }
                    
                    // Block start until all translations are done
                    if (allowTranslation && (!speakerReady && hasSpeakerName)) {
                        return false;
                    }

                    if (allowTranslation) {
                        return false;
                    }
                }
                
                // Translation already applied, allow start
                return originalCanStart;
            };
            
            // Reset translation flag when message terminates
            if (!Window_Message.prototype._originalTerminateMessage) {
                Window_Message.prototype._originalTerminateMessage = Window_Message.prototype.terminateMessage;
            }
            
            Window_Message.prototype.terminateMessage = function() {
                this._translationApplied = false;
                if ($gameMessage) {
                    // Clear stored original choices to avoid stale keys
                    delete $gameMessage._translateOriginalChoices;
                    delete $gameMessage._translateOriginalText;
                    delete $gameMessage._translateOriginalSpeaker;
                }
                Window_Message.prototype._originalTerminateMessage.call(this);
            };

            // Hook Game_Message.setChoices to translate choices as soon as they are set
            if (!Game_Message.prototype._originalSetChoices) {
                Game_Message.prototype._originalSetChoices = Game_Message.prototype.setChoices;
            }

            Game_Message.prototype.setChoices = function(choices, defaultType, cancelType) {
                Game_Message.prototype._originalSetChoices.call(this, choices, defaultType, cancelType);

                // Store original choices for stable cache keys (they may be mutated later)
                this._translateOriginalChoices = (choices || []).slice();

                const translationEnabled = self.isTranslationEnabled();
                const skipping = self.isSkippingMessages();

                if (!translationEnabled) {
                    return;
                }

                const choiceKeys = this._translateOriginalChoices.map(choice => self.getCacheKey(choice, 'choice'));

                // If all choices already cached, replace immediately
                if (choiceKeys.length > 0 && choiceKeys.every(key => self.hasUsableCacheValue(key))) {
                    const translated = this._translateOriginalChoices.map((choice, idx) => {
                        const key = choiceKeys[idx];
                        return self.translationCache.get(key) || choice;
                    });
                    self.replaceChoiceText(translated);
                    return;
                }

                if (skipping) {
                    return;
                }

                // Don't translate here - choices will be translated together with text in startAheadTranslation
            };

            // Block entering choice input until choices are translated
            if (!Window_Message.prototype._originalStartInput) {
                Window_Message.prototype._originalStartInput = Window_Message.prototype.startInput;
            }

            Window_Message.prototype.startInput = function() {
                const translationEnabled = self.isTranslationEnabled();
                const skipping = self.isSkippingMessages();
                const allowTranslation = translationEnabled && !skipping;
                const useCacheOnly = (translationEnabled && skipping) || (!translationEnabled && self.translateCacheWhenDisabled);

                const originalText = $gameMessage._translateOriginalText || $gameMessage.allText();
                const hasText = !!(originalText && originalText.trim().length > 0);
                const textKey = hasText ? self.getCacheKey(originalText, 'text') : null;
                const originalSpeakerName = $gameMessage._translateOriginalSpeaker || $gameMessage._speakerName || '';

                if (allowTranslation) {
                    if (self.isForegroundDialogBatchActive()) {
                        return false;
                    }

                    // Block input if main text translation is still pending or missing
                    if (hasText && textKey) {
                        if (self.pendingTranslations.has(textKey)) {
                            return false; // wait for text translation
                        }

                        // If translation already applied on this window, allow
                        if (!this._translationApplied && !self.hasUsableCacheValue(textKey)) {
                            return false; // text not translated/applied yet
                        }
                    }
                }

                if ((translationEnabled || useCacheOnly) && $gameMessage.isChoice()) {
                    const choices = $gameMessage.choices();
                    const originalChoices = $gameMessage._translateOriginalChoices || choices;
                    const choiceKeys = originalChoices.map(choice => self.getCacheKey(choice, 'choice'));

                    if (useCacheOnly) {
                        const translatedChoices = originalChoices.map((choice, idx) => {
                            const key = choiceKeys[idx];
                            return self.translationCache.get(key) || choice;
                        });
                        self.replaceChoiceText(translatedChoices);
                        return Window_Message.prototype._originalStartInput.call(this);
                    }

                    // If choices translation is pending, wait
                    if (allowTranslation && choiceKeys.some(key => self.pendingTranslations.has(key))) {
                        return false; // keep waiting
                    }

                    // If previous choice translation failed and in cooldown, proceed with originals
                    if (allowTranslation && choiceKeys.some(key => self.failedTranslations.has(key))) {
                        const failedTime = Math.max(...choiceKeys.map(key => self.failedTranslations.get(key) || 0));
                        const cooldownMs = 5000;
                        if (Date.now() - failedTime < cooldownMs) {
                            self.replaceChoiceText(originalChoices);
                            return Window_Message.prototype._originalStartInput.call(this);
                        }
                        // cooldown expired -> retry below and clear flag
                        for (const key of choiceKeys) {
                            self.failedTranslations.delete(key);
                        }
                    }

                    // Choices should already be translated from main batch
                    // If not cached by now, something went wrong - use originals
                    const choicesReady = choiceKeys.length === 0 || choiceKeys.every(key => self.hasUsableCacheValue(key));
                    if (!choicesReady && allowTranslation) {
                        console.warn('[TranslateOnTheFly] Choices not in cache (should have been translated with text)');
                        self.replaceChoiceText(originalChoices);

                        // Kick off a batch translate for the event (unless already pending) and block until ready
                        if (!choiceKeys.some(key => self.pendingTranslations.has(key))) {
                            const maxDepth = self.tryTranslateAhead ? 999 : 0;
                            const logPrefix = maxDepth > 0 ? 'ahead translation batch for choices (startInput fallback)' : 'translation for choices (startInput fallback)';
                            console.log(`[TranslateOnTheFly] Starting 03 ${logPrefix}`);

                            self.requestForegroundDialogBatch({
                                currentText: originalText || '',
                                currentSpeakerName: originalSpeakerName,
                                cacheKey: textKey || self.getCacheKey(originalText || '', 'text'),
                                maxDepth,
                                sourceTrigger: 'Starting 03'
                            });
                        }

                        return false; // wait for batch to complete
                    }

                    // Cached -> ensure applied then proceed
                    if (choicesReady) {
                        const cachedChoices = originalChoices.map((choice, idx) => {
                            const key = choiceKeys[idx];
                            return self.translationCache.get(key) || choice;
                        });
                        self.replaceChoiceText(cachedChoices);
                    }
                }

                return Window_Message.prototype._originalStartInput.call(this);
            };

            if (!DataManager._extractSaveContents) {
                DataManager._extractSaveContents = DataManager.extractSaveContents;
            }

            DataManager.extractSaveContents = function(contents) { 
                DataManager._extractSaveContents(contents);;
                console.log('[TranslateOnTheFly] Extracted save contents, applying cached translations if any');

                window.__TranslateOnTheFlyPanel.applyCachedTranslations($dataActors, ['name', 'nickname', 'profile'], 'actor', $gameActors, 'actor');
                window.__TranslateOnTheFlyPanel.applyCachedTranslations($dataClasses, ['name'], 'class');
                window.__TranslateOnTheFlyPanel.applyCachedTranslations($dataEnemies, ['name'], 'enemy');
                console.log('[TranslateOnTheFly] Applied cached translations to $dataActors, $dataClasses, $dataEnemies and their game objects');
            }

            if(!DataManager._createGameObjects) {
                DataManager._createGameObjects = DataManager.createGameObjects;
            }

            DataManager.createGameObjects = function() {
                DataManager._createGameObjects();
                console.log('[TranslateOnTheFly] Created game objects, applying cached translations if any');
                window.__TranslateOnTheFlyPanel.applyCachedTranslations($dataActors, ['name', 'nickname', 'profile'], 'actor', $gameActors, 'actor');
                window.__TranslateOnTheFlyPanel.applyCachedTranslations($dataClasses, ['name'], 'class');
                window.__TranslateOnTheFlyPanel.applyCachedTranslations($dataEnemies, ['name'], 'enemy');
                console.log('[TranslateOnTheFly] Applied cached translations to $dataActors, $dataClasses, $dataEnemies and their game objects');   
            }

            // Hook Window_Command.prototype.refresh to translate commands before rendering
            if (!Window_Command.prototype._originalRefresh) {
                Window_Command.prototype._originalRefresh = Window_Command.prototype.refresh;
            }

            Window_Command.prototype.refresh = async function() {
                const translationEnabled = self.isTranslationEnabled();
                const useCacheOnly = (!translationEnabled && self.translateCacheWhenDisabled);

                // If translation is completely disabled, use original
                if (!translationEnabled && !useCacheOnly) {
                    return Window_Command.prototype._originalRefresh.call(this);
                }

                // Mark that we're in refresh - addCommand will collect names
                this._collectingCommands = true;
                this._collectedCommands = [];
                
                console.log('[TranslateOnTheFly] Refreshing command window, collecting commands for translation', $dataSystem);
                // First time only: collect system command terms for translation
                if (!self._systemCommandsCollected && $dataSystem && $dataSystem.terms && $dataSystem.terms.commands && !$dataSystem.terms.commandsOriginal) {
                    const systemCommands = $dataSystem.terms.commands.filter(cmd => !!cmd);
                    for (const cmdName of systemCommands) {
                        this._collectedCommands.push({ 
                            name: cmdName, 
                            symbol: 'dummy', 
                            enabled: true, 
                            ext: null,
                            isAdditional: true
                        });
                    }
                    self._systemCommandsCollected = true;
                    console.log(`[TranslateOnTheFly] Collected ${systemCommands.length} system commands for translation`);
                }
                           
                // Call original makeCommandList to collect all command names
                this.clearCommandList();
                this.makeCommandList();

                // Restore normal mode
                this._collectingCommands = false;

                const commandsToTranslate = this._collectedCommands.filter(cmd => {
                    // Skip choices - they are already translated during event processing
                    if (cmd.symbol === 'choice') {
                        return false;
                    }
                    
                    if (!cmd.name || typeof cmd.name !== 'string' || cmd.name.trim() === '') {
                        return false;
                    }

                    if($dataSystem?.terms?.commandsOriginal && $dataSystem.terms.commands.includes(cmd.name)) {
                        // This is a system command already translated once - skip
                        return false;
                    };

                    const commandKey = self.getCacheKey(cmd.name, 'command');
                    // Only translate if not cached
                    return !self.hasUsableCacheValue(commandKey);
                });

                // Batch translate all uncached commands
                if (commandsToTranslate.length > 0 && translationEnabled && !useCacheOnly) {
                    console.log(`[TranslateOnTheFly] Batch translating ${commandsToTranslate.length} commands`);
                    
                    const items = commandsToTranslate.map((cmd, i) => ({
                        type: 'command',
                        id: `cmd_${i}`,
                        value: cmd.name,
                        cacheKey: self.getCacheKey(cmd.name, 'command')
                    }));

                    try {
                        self.showSpinner();
                        const result = await self.engine.batchTranslate(items);
                        self.hideSpinner();

                        // Cache successes
                        for (const success of result.successes) {
                            self.setCacheValue(success.cacheKey, success.translated);
                            console.log(`[TranslateOnTheFly] Cached command: "${items.find(i => i.cacheKey === success.cacheKey).value}" → "${success.translated}"`);
                        }

                        // Mark failures
                        for (const failure of result.failures) {
                            console.warn(`[TranslateOnTheFly] Failed to translate command:`, failure.value, '→', failure.rejectReason);
                        }
                        self.markBatchFailuresAsUntranslated(result.failures, true);
                    } catch (error) {
                        console.error('[TranslateOnTheFly] Batch command translation error:', error);
                        self.hideSpinner();
                        self.markBatchItemsAsUntranslated(items, true);
                    }
                }
                this._collectedCommands = this._collectedCommands.filter(cmd => cmd && !cmd.isAdditional);

                // Now add all commands with translations (from cache or original)
                this.clearCommandList();
                for (const cmd of this._collectedCommands) {
                    let finalName = cmd.name;
                    
                    if (cmd.name && typeof cmd.name === 'string' && cmd.name.trim() !== '') {
                        const commandKey = self.getCacheKey(cmd.name, 'command');
                        if (self.hasUsableCacheValue(commandKey)) {
                            finalName = self.translationCache.get(commandKey);
                        }
                    }
                    
                    this._list.push({ 
                        name: finalName, 
                        symbol: cmd.symbol, 
                        enabled: cmd.enabled, 
                        ext: cmd.ext 
                    });
                }

                // Continue with original refresh logic (after makeCommandList)
                delete this._collectedCommands;
                this.createContents();
                Window_Selectable.prototype.refresh.call(this);
            };

            // Hook addCommand to collect command names during makeCommandList
            if (!Window_Command.prototype._originalAddCommand) {
                Window_Command.prototype._originalAddCommand = Window_Command.prototype.addCommand;
            }

            Window_Command.prototype.addCommand = function(name, symbol, enabled = true, ext = null) {
                if (this._collectingCommands) {
                    console.log('[TranslateOnTheFly] Collected command for translation:', name, symbol);
                    this._collectedCommands.push({ name, symbol, enabled, ext });
                    return;
                }

                // Normal mode - use original
                return Window_Command.prototype._originalAddCommand.call(this, name, symbol, enabled, ext);
            };
        },
        
        replaceMessageText(translatedText) {
            // Do NOT extract \n<...> as speaker - these are RPG Maker script elements/plugin commands
            // Speaker name comes from $gameMessage._speakerName, not from text
            
            // Split translated text into lines
            const lines = translatedText.split('\n');
            
            // Clear current message texts
            $gameMessage._texts.length = 0;
            
            // Add translated lines (preserving all RPG Maker tags)
            for (const line of lines) {
                if (line || lines.length === 1) { // Keep empty lines if they're intentional
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
            const safeSpeaker = this.normalizeSpeakerNameCase((translatedSpeaker || '').trim());
            if (!safeSpeaker) {
                return;
            }

            $gameMessage._speakerName = safeSpeaker;
        },

        getCacheKey(text, type = 'text') {
            const keyText = type === 'speaker' ? this.ensureSpeakerKeyPrefix(text) : text;
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

            return text.startsWith('name_') ? text : `name_${text}`;
        },

        setCacheValue(key, value) {
            const normalizedValue = typeof value === 'string' ? value : (value === null || value === undefined ? '' : String(value));
            this.translationCache.set(key, normalizedValue);
            this.persistCache();
            this.notifyCacheRuntime('cache-set', key);
        },

        loadCacheFromDisk() {
            try {
                const json = this.cacheStorage.getItem('data');
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
                        const normalizedValue = typeof v === 'string' ? v : (v === null || v === undefined ? '' : String(v));
                        this.translationCache.set(k, normalizedValue);
                    }
                    this.notifyCacheRuntime('cache-loaded');
                }
            } catch (error) {
                console.warn('[TranslateOnTheFly] Failed to load cache, starting fresh', error);
                const runtime = ensureTranslateCacheRuntime(new Map());
                this.translationCache = runtime.cache;
                this.lastSeenByCacheKey = runtime.lastSeenByCacheKey;
                this.notifyCacheRuntime('cache-load-failed-reset');
            }
        },

        persistCache() {
            try {
                const payload = JSON.stringify(Array.from(this.translationCache.entries()));
                this.cacheStorage.setItem('data', payload);
            } catch (error) {
                console.warn('[TranslateOnTheFly] Failed to persist cache', error);
            }
        },

        getSpinnerHostDocument() {
            // Always prefer the main game window as the host for spinner UI
            const parentDoc = (window.__CHEAT_EXTERNAL_WINDOW__ && window.opener && !window.opener.closed)
                ? window.opener.document
                : null;
            return parentDoc || (typeof document !== 'undefined' ? document : null);
        },

        ensureSpinnerElements() {
            const hostDoc = this.getSpinnerHostDocument();
            if (!hostDoc) {
                return null;
            }

            if (!this._spinnerStyle) {
                const existingStyle = hostDoc.getElementById('tof-translate-spinner-style');
                const style = existingStyle || hostDoc.createElement('style');
                style.id = 'tof-translate-spinner-style';
                style.textContent = [
                    '#tof-translate-spinner { position: fixed; right: 12px; bottom: 12px; width: 48px; height: 48px; display: none; align-items: center; justify-content: center; pointer-events: none; z-index: 9999; }',
                    '#tof-translate-spinner .tof-spinner-ring { width: 32px; height: 32px; border: 3px solid rgba(255,255,255,0.35); border-top: 3px solid #4fc3f7; border-radius: 50%; animation: tof-translate-spin 0.9s linear infinite; box-shadow: 0 0 10px rgba(0,0,0,0.35); background: rgba(0,0,0,0.25); }',
                    '@keyframes tof-translate-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }'
                ].join('');
                if (!existingStyle) {
                    hostDoc.head.appendChild(style);
                }
                this._spinnerStyle = style;
            }

            if (!this._spinnerEl) {
                const existingEl = hostDoc.getElementById('tof-translate-spinner');
                const el = existingEl || hostDoc.createElement('div');
                el.id = 'tof-translate-spinner';
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
                const existingStyle = hostDoc.getElementById('tof-progress-box-style');
                const style = existingStyle || hostDoc.createElement('style');
                style.id = 'tof-progress-box-style';
                style.textContent = [
                    '#tof-progress-box { position: fixed; right: 12px; bottom: 72px; padding: 8px 12px; display: none; background: rgba(50, 50, 50, 0.75); border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.3); pointer-events: none; z-index: 9998; font-family: Arial, sans-serif; text-align: right; }',
                    '#tof-progress-box .tof-progress-line { color: #fff; font-size: 12px; line-height: 1.5; margin: 1px 0; white-space: nowrap; }',
                    '#tof-progress-box .tof-progress-line.map-progress { font-weight: bold; color: #82d4f8; }',
                    '#tof-progress-box .tof-progress-line.message-progress { color: #ccc; }'
                ].join('');
                if (!existingStyle) {
                    hostDoc.head.appendChild(style);
                }
                this._progressBoxStyle = style;
            }

            if (!this._progressBoxEl) {
                const existingEl = hostDoc.getElementById('tof-progress-box');
                const el = existingEl || hostDoc.createElement('div');
                el.id = 'tof-progress-box';
                el.innerHTML = '<div class="tof-progress-line map-progress" id="tof-map-progress"></div><div class="tof-progress-line message-progress" id="tof-message-progress"></div>';
                if (!existingEl) {
                    hostDoc.body.appendChild(el);
                }
                this._progressBoxEl = el;
            }

            return this._progressBoxEl;
        },

        updateProgressBox(mapProgress = null, messageProgress = null, successes = null, failures = null) {
            const el = this.ensureProgressBoxElements();
            if (!el) {
                return;
            }

            const mapProgressEl = el.querySelector('#tof-map-progress');
            const messageProgressEl = el.querySelector('#tof-message-progress');

            if (mapProgress !== null && mapProgressEl) {
                mapProgressEl.textContent = mapProgress;
                mapProgressEl.style.display = mapProgress ? 'block' : 'none';
            }

            if (messageProgress !== null && messageProgressEl) {
                let progressText = messageProgress;
                // Add error info if provided and there are failures
                if (successes !== null && failures !== null && failures > 0) {
                    progressText += ` (${successes} OK, ${failures} errors)`;
                }
                messageProgressEl.textContent = progressText;
                messageProgressEl.style.display = messageProgress ? 'block' : 'none';
            }

            // Show box if any progress is set
            const hasContent = (mapProgress && mapProgress.length > 0) || (messageProgress && messageProgress.length > 0);
            el.style.display = hasContent ? 'block' : 'none';
        },

        hideProgressBox() {
            const el = this.ensureProgressBoxElements();
            if (el) {
                el.style.display = 'none';
            }
        },

        updateSpinnerVisibility() {
            const el = this.ensureSpinnerElements();
            if (!el) {
                return;
            }
            el.style.display = this.spinnerActiveCount > 0 ? 'flex' : 'none';
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
                /\\[nNpPgGcCiI]\[(\d+)\]/g,  // \n[1], \p[2], etc.
                /\\[vV]\[(\d+)\]/g,           // \v[1] - variables
                /\\[cC]\[(\d+)\]/g,           // \c[1] - colors
                /\\[gG]/g,                    // \g - gold
                /\\[.!><\|^$]/g,              // \., \!, \>, \<, \|, \^, \$
                /\n/g,                        // newlines
                /\\n/g,                       // literal \n
                /\\\\/g                       // escaped backslashes
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
                    new RegExp(placeholder, 'g'),
                    new RegExp(placeholder.replace(/X/g, 'X\\s*'), 'g'),
                    new RegExp('X\\s*PROT\\s*X\\s*' + index + '\\s*X\\s*PROT\\s*X', 'g'),
                    new RegExp('XPROT X' + index + 'X PROTX', 'g'),
                    new RegExp('X PROT X' + index + 'X PROT X', 'g')
                ];
                
                patterns.forEach(pattern => {
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
            cleaned = cleaned.replace(/>\s+「/g, '>「');
            cleaned = cleaned.replace(/>\s+『/g, '>『');
            
            // Fix common API spacing issues in escape sequences
            cleaned = cleaned.replace(/\\\s+n/g, '\\n');
            cleaned = cleaned.replace(/\\\s+c/g, '\\c');
            cleaned = cleaned.replace(/\\\s+v/g, '\\v');
            cleaned = cleaned.replace(/\\\s+p/g, '\\p');
            cleaned = cleaned.replace(/\\\s+g/g, '\\g');
            
            return cleaned;
        },

        wrapText(text, maxWidth) {
            if (!this.enableTextWrapping || !maxWidth || maxWidth <= 0) {
                return text;
            }

            // Function to calculate visible length (excluding escape sequences)
            const getVisibleLength = (str) => {
                // Remove all RPG Maker escape sequences: \n[N], \v[N], \c[N], \p[N], \g, etc.
                const withoutEscapes = str.replace(/\\[nvcpgif]\[\d+\]/gi, '')
                                           .replace(/\\[nvcpgif]/gi, '')
                                           .replace(/\\[!.^<>]/g, '');
                return withoutEscapes.length;
            };

            const lines = text.split('\n');
            const wrappedLines = [];

            for (const line of lines) {
                const visibleLength = getVisibleLength(line);
                
                if (visibleLength <= maxWidth) {
                    wrappedLines.push(line);
                    continue;
                }

                // Line is too long, need to wrap
                const words = line.split(' ');
                let currentLine = '';

                for (const word of words) {
                    const wordVisibleLength = getVisibleLength(word);
                    
                    // If word itself is longer than maxWidth, split it
                    if (wordVisibleLength > maxWidth) {
                        if (currentLine) {
                            wrappedLines.push(currentLine.trim());
                            currentLine = '';
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
                    const testLine = currentLine ? currentLine + ' ' + word : word;
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

            return wrappedLines.join('\n');
        },

        async translateCommandName(commandName) {
            try {
                const cleanName = (commandName || '').trim();
                if (!cleanName) {
                    return commandName;
                }

                const commandKey = this.getCacheKey(cleanName, 'command');

                // Check cache first
                if (this.hasUsableCacheValue(commandKey)) {
                    return this.translationCache.get(commandKey);
                }

                // If translation is in progress, return original for now
                if (this.pendingTranslations.has(commandKey)) {
                    return commandName;
                }

                this.showSpinner();
                const result = await this.engine.batchTranslate([{
                    type: 'command',
                    id: 'cmd_0',
                    value: cleanName,
                    cacheKey: commandKey
                }]);
                this.hideSpinner();

                if (result.successes.length > 0) {
                    const translated = result.successes[0].translated;
                    this.setCacheValue(commandKey, translated);
                    return translated;
                }

                if (result.failures.length > 0) {
                    console.warn('[TranslateOnTheFly] Failed to translate command:', cleanName, '→', result.failures[0].rejectReason);
                    this.markBatchFailuresAsUntranslated(result.failures, true);
                }

                return commandName;
            } catch (error) {
                console.error('[TranslateOnTheFly] Command translation error:', error);
                return commandName;
            }
        },

        async translateChoiceText(text) {
            try {
                const cleanText = (text || '').trim();
                if (!cleanText) {
                    return text;
                }

                const { protectedText, protectedSequences } = this.protectSpecialSequences(cleanText);
                const translatedRaw = await this.translateWithSelectedEngine(protectedText);

                if (translatedRaw) {
                    let translated = this.restoreSpecialSequences(translatedRaw, protectedSequences);
                    translated = this.cleanTranslatedText(translated);
                    translated = this.wrapText(translated, this.maxLineWidth);
                    return translated;
                }

                return text;
            } catch (error) {
                console.error('[TranslateOnTheFly] Choice translation API error:', error);
                return text;
            }
        },

        async translateChoices(choices) {
            if (!Array.isArray(choices) || !choices.length) {
                return { choices: choices || [], complete: true };
            }

            // Build items for uncached choices
            const items = choices.map((choice, i) => {
                const cacheKey = this.getCacheKey(choice, 'choice');
                return {
                    type: 'choice',
                    id: `choice_${i}`,
                    value: choice,
                    cacheKey
                };
            }).filter(item => !this.hasUsableCacheValue(item.cacheKey));

            if (items.length === 0) {
                // All individual choices cached, build result
                const translatedChoices = choices.map(choice => {
                    const cacheKey = this.getCacheKey(choice, 'choice');
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
            const translatedChoices = choices.map(choice => {
                const cacheKey = this.getCacheKey(choice, 'choice');
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
                const cleanName = (speakerName || '').trim();
                if (!cleanName) {
                    return speakerName;
                }

                const translated = await this.translateWithSelectedEngine(cleanName, { skipWrap: true });
                return this.normalizeSpeakerNameCase(translated || speakerName);
            } catch (error) {
                console.error('[TranslateOnTheFly] Speaker name translation API error:', error);
                return speakerName;
            }
        },

        normalizeSpeakerNameCase(name) {
            if (!name || typeof name !== 'string') {
                return name;
            }

            // Capitalize first latin letter if present (helps translators that lowercase names)
            return name.replace(/^([a-z])/, (match) => match.toUpperCase());
        },

        async translateWithSelectedEngine(text, options = {}) {
            const sourceLang = this.sourceLang || 'auto';
            const targetLang = this.targetLang || 'en';
            const payload = (text || '').trim();

            if (!payload) {
                return text;
            }

            // Delegate to engine
            return await this.engine.translate(payload, sourceLang, targetLang, options);
        },

        startBackgroundTranslation() {
            // Defer to allow game data to load
            setTimeout(() => {
                this.translateGameObjectsInBackground();
            }, 2000);
        },

        isEngineFullyConfigured() {
            if (!this.engine) {
                return false;
            }

            // Check if engine has isFullyConfigured method
            if (typeof this.engine.isFullyConfigured === 'function') {
                return this.engine.isFullyConfigured();
            }

            // Fallback: assume fully configured if method doesn't exist
            return true;
        },

        applyCachedTranslations(dataContainer, fields, cacheKeyPrefix, instanceContainer, instanceFunctionName) {
            let appliedCount = 0;
            for (let i = 1; i < dataContainer.length; i++) {
                const item = dataContainer[i];
                if (!item) continue;

                let itemInstance;
                if(instanceContainer && instanceFunctionName && typeof instanceContainer[instanceFunctionName] === 'function') {
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
                    if (originalValue && typeof originalValue === 'string' && originalValue.trim() !== '') {
                        const cacheKey = this.getCacheKey(originalValue, `${cacheKeyPrefix}_${field}`);
                        if (this.hasUsableCacheValue(cacheKey)) {
                            try {
                                item[field] = this.translationCache.get(cacheKey);
                                if(itemInstance) {
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

        checkIfDataIsLOaded() {
            return !window.$dataItems || !window.$dataSkills || !window.$dataArmors || !window.$dataWeapons || !window.$dataMapInfos || !window.$dataClasses || !window.$dataEnemies;
        },

        applyCachedTranslationsToData() {
            if (this.checkIfDataIsLOaded()) {
                console.log('[TranslateOnTheFly] Game data not fully loaded, cannot apply cached translations');
                setTimeout(() => {
                    this.applyCachedTranslationsToData();
                }, 2000);
                return;
            }

            let appliedCount = 0;

            // Apply cached translations
            appliedCount += this.applyCachedTranslations($dataItems, ['name', 'description'], 'item');
            appliedCount += this.applyCachedTranslations($dataClasses, ['name'], 'class');
            appliedCount += this.applyCachedTranslations($dataEnemies, ['name'], 'enemy');
            appliedCount += this.applyCachedTranslations($dataSkills, ['name', 'description', 'message1', 'message2'], 'skill');
            appliedCount += this.applyCachedTranslations($dataArmors, ['name', 'description'], 'armor');
            appliedCount += this.applyCachedTranslations($dataWeapons, ['name', 'description'], 'weapon');
            appliedCount += this.applyCachedTranslations($dataMapInfos, ['name'], 'map');
            appliedCount += this.applyCachedTranslations($dataActors, ['name', 'nickname', 'profile'], 'actor', $gameActors, 'actor');

            if (appliedCount > 0) {
                console.log(`[TranslateOnTheFly] Applied ${appliedCount} cached translations to objects`);
            }
        },

        async translateGameArrays(options = {}) {
            const isBackgroundJob = !!options.backgroundJob;
            console.log('[TranslateOnTheFly] Starting translation of game data arrays');

            if (!this.isEngineFullyConfigured()) {
                console.log('[TranslateOnTheFly] Engine not fully configured, skipping game arrays');
                return;
            }

            // Define list of arrays to process. To add new arrays later, add an entry here.
            const arrays = [
                { parent: () => ($dataSystem && $dataSystem.terms) || null, prop: 'basic', type: 'terms_basic' },
                { parent: () => ($dataSystem && $dataSystem.terms) || null, prop: 'params', type: 'terms_params' },
                { parent: () => ($dataSystem && $dataSystem.terms) || null, prop: 'commands', type: 'command' },
                { parent: () => $dataSystem || null, prop: 'weaponTypes', type: 'weaponType' },
                { parent: () => $dataSystem || null, prop: 'variables', type: 'variable' },
                { parent: () => $dataSystem || null, prop: 'switches', type: 'switch' },
                { parent: () => $dataSystem || null, prop: 'skillTypes', type: 'skillType' },
                { parent: () => $dataSystem || null, prop: 'equipTypes', type: 'equipType' },
                { parent: () => $dataSystem || null, prop: 'elements', type: 'element' },
                { parent: () => $dataSystem || null, prop: 'armorTypes', type: 'armorType' }
            ];

            // Collect unique non-empty strings from all arrays
            const uniqueValues = new Map(); // value -> { value, types: Set }

            for (const entry of arrays) {
                const parentObj = entry.parent();
                if (!parentObj) {
                    continue;
                }

                // If an Original copy exists, use it for collecting keys (avoid collecting already translated values)
                const sourceArr = Array.isArray(parentObj[`${entry.prop}Original`]) ? parentObj[`${entry.prop}Original`] : parentObj[entry.prop];
                if (!Array.isArray(sourceArr)) {
                    continue;
                }

                const arr = sourceArr;
                for (let i = 0; i < arr.length; i++) {
                    const v = arr[i];
                    if (v == null) continue;
                    if (typeof v !== 'string') continue;
                    const trimmed = v.trim();
                    if (!trimmed) continue;

                    // Use original string as key in map to keep ordering irrelevant and dedupe
                    if (!uniqueValues.has(trimmed)) {
                        uniqueValues.set(trimmed, { value: trimmed, types: new Set([entry.type]) });
                    } else {
                        uniqueValues.get(trimmed).types.add(entry.type);
                    }
                }
            }

            if (uniqueValues.size === 0) {
                console.log('[TranslateOnTheFly] No candidate strings found in game arrays');
                return;
            }

            // Remove values already in cache
            const pendingValues = [];
            for (const { value, types } of uniqueValues.values()) {
                // choose first type to build cacheKey (cache is per-type); if multiple types exist, we will translate once per distinct type later
                // But to avoid duplicate API calls for same text across types, we will translate the text once and store translated value under each relevant cache key.
                // Build a representative cacheKey using the first type
                const firstType = Array.from(types)[0];
                const cacheKey = this.getCacheKey(value, firstType);
                if (!this.hasUsableCacheValue(cacheKey)) {
                    pendingValues.push({ value, types: Array.from(types) });
                }
            }

            if (pendingValues.length === 0) {
                console.log('[TranslateOnTheFly] All array strings already cached');
            } else {
                // Build translation items and batch them respecting batchItemsLimit and charLimit
                const items = [];
                let idCounter = 0;
                for (const pv of pendingValues) {
                    items.push({ type: pv.types[0], id: `sys_${idCounter++}`, value: pv.value, cacheKey: this.getCacheKey(pv.value, pv.types[0]), meta: pv });
                }

                const batches = [];
                let current = [];
                let currentChars = 0;
                for (const it of items) {
                    const itemLen = (it.value || '').length;
                    if (current.length >= (this.batchItemsLimit || 20) || (currentChars + itemLen) > (this.charLimit || 1000)) {
                        if (current.length) batches.push(current);
                        current = [];
                        currentChars = 0;
                    }
                    current.push(it);
                    currentChars += itemLen;
                }
                if (current.length) batches.push(current);

                console.log(`[TranslateOnTheFly] Translating ${items.length} unique strings in ${batches.length} batches`);

                for (const batch of batches) {
                    try {
                        this.showSpinner();
                        const batchItems = batch.map(b => ({ type: b.type, id: b.id, value: b.value, cacheKey: b.cacheKey }));
                        const result = isBackgroundJob
                            ? await this.batchTranslateWithBackgroundRetry(batchItems, 'game arrays')
                            : await this.engine.batchTranslate(batchItems, { backgroundJob: false });
                        this.hideSpinner();

                        // For each success, store translation under all associated types (create keys per type)
                        for (const success of result.successes) {
                            const originalValue = success.value || (batch.find(b => b.cacheKey === success.cacheKey) || {}).value;
                            // find original meta
                            const meta = batch.find(b => b.cacheKey === success.cacheKey) && batch.find(b => b.cacheKey === success.cacheKey).meta;
                            const types = meta ? meta.types : [success.type];
                            for (const t of types) {
                                const keyForType = this.getCacheKey(success.value ? success.value : originalValue, t);
                                // Note: `success.translated` contains translated text
                                this.setCacheValue(this.getCacheKey(originalValue, t), success.translated);
                            }
                        }

                        for (const failure of result.failures) {
                            console.warn('[TranslateOnTheFly] Failed to translate array value:', failure.value, '→', failure.rejectReason);
                        }
                        this.markBatchFailuresAsUntranslated(result.failures, true);
                    } catch (error) {
                        this.hideSpinner();
                        console.error('[TranslateOnTheFly] Error translating game arrays batch:', error);
                        this.markBatchItemsAsUntranslated(batch, true);
                    }
                }
            }

            // Finally, for each array make Original copy and apply cached translations (if any)
            for (const entry of arrays) {
                const parentObj = entry.parent();
                if (!parentObj || !Array.isArray(parentObj[entry.prop])) continue;

                try {
                    const liveArr = parentObj[entry.prop];
                    // If Original doesn't exist yet, create it from current live array
                    const hasOriginal = Array.isArray(parentObj[`${entry.prop}Original`]);
                    const originalCopy = hasOriginal ? parentObj[`${entry.prop}Original`] : (Array.isArray(liveArr) ? liveArr.slice() : []);
                    if (!hasOriginal) {
                        parentObj[`${entry.prop}Original`] = originalCopy.slice();
                    }

                    // Overwrite main array entries with cached translations when available
                    for (let i = 0; i < originalCopy.length; i++) {
                        const v = originalCopy[i];
                        if (v == null) {
                            parentObj[entry.prop][i] = v;
                            continue;
                        }
                        if (typeof v !== 'string') {
                            parentObj[entry.prop][i] = v;
                            continue;
                        }
                        const trimmed = v.trim();
                        if (!trimmed) {
                            parentObj[entry.prop][i] = v;
                            continue;
                        }

                        // Try all possible types for this value; prefer the entry.type first
                        const candidateTypes = [entry.type];
                        const cacheKeyPrimary = this.getCacheKey(trimmed, entry.type);
                        if (this.hasUsableCacheValue(cacheKeyPrimary)) {
                            parentObj[entry.prop][i] = this.translationCache.get(cacheKeyPrimary);
                            continue;
                        }

                        // If not found under primary type, attempt to find under any other type (fallback)
                        let applied = false;
                        for (const e of arrays) {
                            const fallbackKey = this.getCacheKey(trimmed, e.type);
                            if (this.hasUsableCacheValue(fallbackKey)) {
                                parentObj[entry.prop][i] = this.translationCache.get(fallbackKey);
                                applied = true;
                                break;
                            }
                        }

                        if (!applied) {
                            // keep original
                            parentObj[entry.prop][i] = v;
                        }
                    }
                } catch (error) {
                    console.error('[TranslateOnTheFly] Failed applying translations to array', entry.prop, error);
                }
            }

            // Persist cache after modifications
            this.persistCache();
            console.log('[TranslateOnTheFly] Completed translation of game data arrays');
        },

        async translateGameObjectsInBackground() {
            console.log('[TranslateOnTheFly] Initiating background translation of game objects');
            // Prevent multiple simultaneous background translations
            if (this._backgroundTranslationInProgress) {
                return;
            }

            // Check if background translation is enabled
            if (!this.translateGameObjects) {
                console.log('[TranslateOnTheFly] Background translation disabled by user');
                return;
            }

            // Check if engine is fully configured
            if (!this.isEngineFullyConfigured()) {
                console.log('[TranslateOnTheFly] Engine not fully configured, skipping background translation');
                return;
            }

            if (this.checkIfDataIsLOaded()) {
                console.log('[TranslateOnTheFly] Game data not loaded yet, skipping background translation');
                return;
            }

            this._backgroundTranslationInProgress = true;

            try {
                console.log('[TranslateOnTheFly] Starting background translation of items, skills, armors and weapons');

                // First, apply all cached translations immediately
                this.applyCachedTranslationsToData();

                // Collect all items, skills, armors and weapons that need translation
                const itemsToTranslate = [];
                const skillsToTranslate = [];
                const classesToTranslate = [];
                const enemiesToTranslate = [];
                const armorsToTranslate = [];
                const weaponsToTranslate = [];
                const mapsToTranslate = [];
                const actorsToTranslate = [];

                // Process items (skip index 0 which is null)
                for (let i = 1; i < $dataItems.length; i++) {
                    const item = $dataItems[i];
                    if (!item) continue;

                    const hasUntranslated = this.hasUntranslatedFields(item, ['name', 'description', 'note'], 'item');
                    if (hasUntranslated) {
                        itemsToTranslate.push(item);
                    }
                }

                // Process classes (skip index 0 which is null)
                for (let i = 1; i < $dataClasses.length; i++) {
                    const actorClass = $dataClasses[i];
                    if (!actorClass) continue;

                    const hasUntranslated = this.hasUntranslatedFields(actorClass, ['name'], 'class');
                    if (hasUntranslated) {
                        classesToTranslate.push(actorClass);
                    }       
                }

                // Process enemies (skip index 0 which is null)
                for (let i = 1; i < $dataEnemies.length; i++) {
                    const enemy = $dataEnemies[i];
                    if (!enemy) continue;

                    const hasUntranslated = this.hasUntranslatedFields(enemy, ['name'], 'enemy');
                    if (hasUntranslated) {
                        enemiesToTranslate.push(enemy);
                    }       
                }

                // Process skills (skip index 0 which is null)
                for (let i = 1; i < $dataSkills.length; i++) {
                    const skill = $dataSkills[i];
                    if (!skill) continue;

                    const hasUntranslated = this.hasUntranslatedFields(skill, ['name', 'description', 'message1', 'message2'], 'skill');
                    if (hasUntranslated) {
                        skillsToTranslate.push(skill);
                    }
                }

                // Process armors (skip index 0 which is null)
                for (let i = 1; i < $dataArmors.length; i++) {
                    const armor = $dataArmors[i];
                    if (!armor) continue;

                    const hasUntranslated = this.hasUntranslatedFields(armor, ['name', 'description'], 'armor');
                    if (hasUntranslated) {
                        armorsToTranslate.push(armor);
                    }
                }

                // Process weapons (skip index 0 which is null)
                for (let i = 1; i < $dataWeapons.length; i++) {
                    const weapon = $dataWeapons[i];
                    if (!weapon) continue;

                    const hasUntranslated = this.hasUntranslatedFields(weapon, ['name', 'description'], 'weapon');
                    if (hasUntranslated) {
                        weaponsToTranslate.push(weapon);
                    }
                }

                // Process maps (skip index 0 which is null)
                for (let i = 1; i < $dataMapInfos.length; i++) {
                    const map = $dataMapInfos[i];
                    if (!map) continue;

                    const hasUntranslated = this.hasUntranslatedFields(map, ['name'], 'map');
                    if (hasUntranslated) {
                        mapsToTranslate.push(map);
                    }
                }

                // Process actors (skip index 0 which is null)
                for (let i = 1; i < $dataActors.length; i++) {
                    const actor = $dataActors[i];
                    if (!actor) continue;

                    const hasUntranslated = this.hasUntranslatedFields(actor, ['name', 'nickname', 'profile'], 'actor');
                    if (hasUntranslated) {
                        actorsToTranslate.push(actor);
                    }
                }

                console.log(`[TranslateOnTheFly] Found ${itemsToTranslate.length} items, ${skillsToTranslate.length} skills, ${armorsToTranslate.length} armors, ${weaponsToTranslate.length} weapons, ${mapsToTranslate.length} maps, ${actorsToTranslate.length} actors, ${classesToTranslate.length} classes and ${enemiesToTranslate.length} enemies to translate`);
                // Translate in batches of 10
                const BATCH_SIZE = 10;
                
                // Translate items
                for (let i = 0; i < itemsToTranslate.length; i += BATCH_SIZE) {
                    const batch = itemsToTranslate.slice(i, i + BATCH_SIZE);
                    await this.translateDataBatch(batch, ['name', 'description', 'note'], 'item', { backgroundJob: true });
                    console.log(`[TranslateOnTheFly] Translated items batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(itemsToTranslate.length / BATCH_SIZE)}`);
                }

                // Translate classes
                for (let i = 0; i < classesToTranslate.length; i += BATCH_SIZE) {
                    const batch = classesToTranslate.slice(i, i + BATCH_SIZE);
                    await this.translateDataBatch(batch, ['name'], 'class', { backgroundJob: true });
                    console.log(`[TranslateOnTheFly] Translated classes batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(classesToTranslate.length / BATCH_SIZE)}`);
                }

                // Translate enemies
                for (let i = 0; i < enemiesToTranslate.length; i += BATCH_SIZE) {
                    const batch = enemiesToTranslate.slice(i, i + BATCH_SIZE);
                    await this.translateDataBatch(batch, ['name'], 'enemy', { backgroundJob: true });
                    console.log(`[TranslateOnTheFly] Translated enemies batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(enemiesToTranslate.length / BATCH_SIZE)}`);
                }

                // Translate skills
                for (let i = 0; i < skillsToTranslate.length; i += BATCH_SIZE) {
                    const batch = skillsToTranslate.slice(i, i + BATCH_SIZE);
                    await this.translateDataBatch(batch, ['name', 'description', 'message1', 'message2'], 'skill', { backgroundJob: true });
                    console.log(`[TranslateOnTheFly] Translated skills batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(skillsToTranslate.length / BATCH_SIZE)}`);
                }

                // Translate armors
                for (let i = 0; i < armorsToTranslate.length; i += BATCH_SIZE) {
                    const batch = armorsToTranslate.slice(i, i + BATCH_SIZE);
                    await this.translateDataBatch(batch, ['name', 'description'], 'armor', { backgroundJob: true });
                    console.log(`[TranslateOnTheFly] Translated armors batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(armorsToTranslate.length / BATCH_SIZE)}`);
                }

                // Translate weapons
                for (let i = 0; i < weaponsToTranslate.length; i += BATCH_SIZE) {
                    const batch = weaponsToTranslate.slice(i, i + BATCH_SIZE);
                    await this.translateDataBatch(batch, ['name', 'description'], 'weapon', { backgroundJob: true });
                    console.log(`[TranslateOnTheFly] Translated weapons batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(weaponsToTranslate.length / BATCH_SIZE)}`);
                }

                // Translate maps
                for (let i = 0; i < mapsToTranslate.length; i += BATCH_SIZE) {
                    const batch = mapsToTranslate.slice(i, i + BATCH_SIZE);
                    await this.translateDataBatch(batch, ['name'], 'map', { backgroundJob: true });
                    console.log(`[TranslateOnTheFly] Translated maps batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(mapsToTranslate.length / BATCH_SIZE)}`);
                }

                // Translate actors
                for (let i = 0; i < actorsToTranslate.length; i += BATCH_SIZE) {
                    const batch = actorsToTranslate.slice(i, i + BATCH_SIZE);
                    await this.translateDataBatch(batch, ['name', 'nickname', 'profile'], 'actor', { backgroundJob: true });
                    console.log(`[TranslateOnTheFly] Translated actors batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(actorsToTranslate.length / BATCH_SIZE)}`);
                }

                // Translate $dataSystem.gameTitle (string) — create Original once and skip if exists
                try {
                    if (window.$dataSystem) {
                        if (!($dataSystem.gameTitleOriginal)) {
                            const originalTitle = $dataSystem.gameTitle || '';
                            $dataSystem.gameTitleOriginal = originalTitle;

                            if (originalTitle && originalTitle.trim() !== '') {
                                const gtKey = 'gameTitle';
                                if (!this.hasUsableCacheValue(gtKey)) {
                                    try {
                                        this.showSpinner();
                                        const res = await this.batchTranslateWithBackgroundRetry([{ type: 'gameTitle', id: 'sys_gameTitle', value: originalTitle, cacheKey: gtKey }], 'gameTitle');
                                        this.hideSpinner();
                                        if (res.successes && res.successes.length > 0) {
                                            this.setCacheValue(gtKey, res.successes[0].translated);
                                            $dataSystem.gameTitle = res.successes[0].translated;
                                        } else if (res.failures && res.failures.length > 0) {
                                            this.markBatchFailuresAsUntranslated(res.failures, true);
                                        } else if (this.hasUsableCacheValue(gtKey)) {
                                            $dataSystem.gameTitle = this.translationCache.get(gtKey);
                                        }
                                    } catch (err) {
                                        this.hideSpinner();
                                        console.error('[TranslateOnTheFly] Failed to translate gameTitle', err);
                                        this.failedTranslations.set(gtKey, Date.now());
                                    }
                                } else {
                                    $dataSystem.gameTitle = this.translationCache.get(gtKey);
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.error('[TranslateOnTheFly] gameTitle handling error', err);
                }

                // Translate $dataSystem.terms.messages (object of key->string)
                try {
                    if (window.$dataSystem && $dataSystem.terms && $dataSystem.terms.messages && typeof $dataSystem.terms.messages === 'object') {
                        // If Original doesn't exist, create and translate; if exists, skip translation
                        const hasMessagesOriginal = Array.isArray($dataSystem.terms.messagesOriginal) || (typeof $dataSystem.terms.messagesOriginal === 'object' && $dataSystem.terms.messagesOriginal !== null);
                        const sourceMessages = hasMessagesOriginal ? $dataSystem.terms.messagesOriginal : $dataSystem.terms.messages;

                        // Build pending items for keys that are not yet cached (cache key is plain key name)
                        const pending = [];
                        for (const key of Object.keys(sourceMessages)) {
                            const val = sourceMessages[key];
                            if (val == null) continue;
                            if (typeof val !== 'string') continue;
                            const trimmed = val.trim();
                            if (!trimmed) continue;

                            const cacheKey = key; // plain key as requested
                            if (!this.hasUsableCacheValue(cacheKey)) {
                                pending.push({ type: 'system_message', id: `msg_${key}`, value: val, cacheKey });
                            }
                        }

                        // Create Original copy only once
                        if (!hasMessagesOriginal) {
                            try {
                                $dataSystem.terms.messagesOriginal = Object.assign({}, $dataSystem.terms.messages);
                            } catch (e) {
                                $dataSystem.terms.messagesOriginal = {};
                            }
                        }

                        // Apply cached translations to live messages (so cache is applied on subsequent runs)
                        try {
                            const keysToApply = Object.keys($dataSystem.terms.messagesOriginal || $dataSystem.terms.messages || {});
                            for (const k of keysToApply) {
                                if (this.hasUsableCacheValue(k)) {
                                    $dataSystem.terms.messages[k] = this.translationCache.get(k);
                                }
                            }
                        } catch (e) {
                            // ignore
                        }

                        if (pending.length > 0) {
                            // Batch translate pending messages
                            const messageBatches = [];
                            let cur = [];
                            let curChars = 0;
                            for (const it of pending) {
                                const len = (it.value || '').length;
                                if (cur.length >= (this.batchItemsLimit || 20) || (curChars + len) > (this.charLimit || 1000)) {
                                    if (cur.length) messageBatches.push(cur);
                                    cur = [];
                                    curChars = 0;
                                }
                                cur.push(it);
                                curChars += len;
                            }
                            if (cur.length) messageBatches.push(cur);

                            for (const b of messageBatches) {
                                try {
                                    this.showSpinner();
                                    const res = await this.batchTranslateWithBackgroundRetry(b.map(x => ({ type: x.type, id: x.id, value: x.value, cacheKey: x.cacheKey })), 'system messages background');
                                    this.hideSpinner();

                                    for (const s of res.successes) {
                                        const key = s.cacheKey || (b.find(x => x.cacheKey === s.cacheKey) || {}).cacheKey;
                                        const translated = s.translated;
                                        if (key) {
                                            this.setCacheValue(key, translated);
                                            // apply to live messages if present
                                            if ($dataSystem.terms && $dataSystem.terms.messages && Object.prototype.hasOwnProperty.call($dataSystem.terms.messages, key)) {
                                                $dataSystem.terms.messages[key] = translated;
                                            }
                                        }
                                    }

                                    for (const f of res.failures) {
                                        console.warn('[TranslateOnTheFly] Failed to translate system message:', f.value, '→', f.rejectReason);
                                    }
                                    this.markBatchFailuresAsUntranslated(res.failures, true);
                                } catch (err) {
                                    this.hideSpinner();
                                    console.error('[TranslateOnTheFly] Error translating system messages batch:', err);
                                    this.markBatchItemsAsUntranslated(b, true);
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.error('[TranslateOnTheFly] system messages handling error', err);
                }

                await this.translateGameArrays({ backgroundJob: true });

                console.log('[TranslateOnTheFly] Background translation completed', $dataSystem);
            } catch (error) {
                console.error('[TranslateOnTheFly] Background translation error:', error);
            } finally {
                this._backgroundTranslationInProgress = false;
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
                if (value && typeof value === 'string' && value.trim() !== '') {
                    const cacheKey = this.getCacheKey(value, `${type}_${field}`);
                    if (!this.hasUsableCacheValue(cacheKey)) {
                        return true; // At least one field needs translation
                    }
                }
            }

            return false; // All fields are cached or empty
        },

        async translateDataBatch(dataObjects, fields, type, options = {}) {
            const items = [];

            // Collect all fields that need translation
            for (const dataObject of dataObjects) {
                for (const field of fields) {
                    const originalValue = dataObject._translateOriginal[field];
                    if (originalValue && typeof originalValue === 'string' && originalValue.trim() !== '') {
                        const cacheKey = this.getCacheKey(originalValue, `${type}_${field}`);
                        
                        // Skip if already cached
                        if (this.hasUsableCacheValue(cacheKey)) {
                            continue;
                        }

                        items.push({
                            type: `${type}_${field}`,
                            id: `${type}_${dataObject.id}_${field}`,
                            value: originalValue,
                            cacheKey: cacheKey,
                            dataObject: dataObject,
                            field: field
                        });
                    }
                }
            }

            if (items.length === 0) {
                return { successes: 0, failures: 0 }; // Nothing to translate
            }

            // Batch translate
            try {
                const result = options.backgroundJob
                    ? await this.batchTranslateWithBackgroundRetry(items, `${type} data batch`)
                    : await this.engine.batchTranslate(items, { backgroundJob: false });

                // Apply translations to cache and data objects
                for (const success of result.successes) {
                    this.setCacheValue(success.cacheKey, success.translated);
                }

                // Log failures
                for (const failure of result.failures) {
                    console.warn(`[TranslateOnTheFly] Failed to translate ${failure.type}:`, failure.value.substring(0, 50), '→', failure.rejectReason);
                }
                this.markBatchFailuresAsUntranslated(result.failures, true);

                // Apply cached translations to all data objects in this batch
                for (const dataObject of dataObjects) {
                    for (const field of fields) {
                        const originalValue = dataObject._translateOriginal[field];
                        if (originalValue && typeof originalValue === 'string' && originalValue.trim() !== '') {
                            const cacheKey = this.getCacheKey(originalValue, `${type}_${field}`);
                            if (this.hasUsableCacheValue(cacheKey)) {
                                try {
                                    dataObject[field] = this.translationCache.get(cacheKey);
                                }  catch (error) {
                                    console.log(error);
                                }
                            }
                        }
                    }
                }

                return {
                    successes: result.successes.length,
                    failures: result.failures.length
                };
            } catch (error) {
                console.error('[TranslateOnTheFly] Data batch translation error:', error);
                this.markBatchItemsAsUntranslated(items, true);
                return {
                    successes: 0,
                    failures: items.length
                };
            }
        },

        async translateAndApplyCurrentMessage() {
            try {
                // Use stored $gameMessage reference instead of global one
                const gameMessage = this.currentGameMessage || $gameMessage;
                
                if (!gameMessage || typeof gameMessage.allText !== 'function') {
                    console.warn('[TranslateOnTheFly] No gameMessage available');
                    return;
                }
                
                // Verify engine exists
                if (!this.engine || typeof this.engine.batchTranslate !== 'function') {
                    console.error('[TranslateOnTheFly] No engine available or batchTranslate not found', {
                        hasEngine: !!this.engine,
                        engineType: this.engine ? this.engine.constructor.name : 'null',
                        hasBatchTranslate: this.engine && typeof this.engine.batchTranslate === 'function'
                    });
                    Alert.error('Translation engine not initialized');
                    return;
                }

                // Get original text (before translation) or current text
                const originalText = gameMessage._translateOriginalText || gameMessage.allText();
                
                // Get original speaker (before translation) or current speaker
                const originalSpeakerName = gameMessage._translateOriginalSpeaker || gameMessage._speakerName || '';
                
                // Get original choices (before translation) or current choices
                const choices = gameMessage.choices ? gameMessage.choices() : [];
                const originalChoices = gameMessage._translateOriginalChoices || choices;
                const hasChoices = Array.isArray(originalChoices) && originalChoices.length > 0;
                
                // Validate that we have something to translate (text, speaker, or choices)
                const hasText = originalText && originalText.trim().length > 0;
                const hasSpeaker = originalSpeakerName && originalSpeakerName.trim().length > 0;
                
                if (!hasText && !hasSpeaker && !hasChoices) {
                    console.warn('[TranslateOnTheFly] Message text is empty and no choices or speaker');
                    return;
                }

                console.log('[TranslateOnTheFly] Translating current message:', {
                    text: hasText ? originalText.substring(0, 50) : '(no text)',
                    speaker: originalSpeakerName,
                    choices: originalChoices
                });

                // Build items array
                const items = [];
                let itemIdCounter = 0;

                // Add text
                const textKey = this.getCacheKey(originalText, 'text');
                items.push({ 
                    type: 'text', 
                    id: `text_${itemIdCounter++}`, 
                    value: originalText,
                    cacheKey: textKey
                });

                // Add speaker
                if (originalSpeakerName && originalSpeakerName.trim().length > 0) {
                    const speakerKey = this.getCacheKey(originalSpeakerName, 'speaker');
                    items.push({ 
                        type: 'speaker', 
                        id: `speaker_${itemIdCounter++}`, 
                        value: originalSpeakerName,
                        cacheKey: speakerKey
                    });
                }

                // Add choices
                if (hasChoices) {
                    for (let i = 0; i < originalChoices.length; i++) {
                        const choice = originalChoices[i];
                        const choiceKey = this.getCacheKey(choice, 'choice');
                        items.push({ 
                            type: 'choice', 
                            id: `choice_${itemIdCounter++}`, 
                            value: choice,
                            cacheKey: choiceKey
                        });
                    }
                }

                // Clear cache for these items to force re-translation
                for (const item of items) {
                    this.deleteCacheValue(item.cacheKey, { persist: false, notify: false, deleteSeen: false });
                }
                this.persistCache();
                this.notifyCacheRuntime('cache-force-retranslate');

                // Translate using batch
                this.showSpinner();
                const result = await this.engine.batchTranslate(items);
                this.hideSpinner();

                console.log('[TranslateOnTheFly] Translation result:', {
                    successes: result.successes.length,
                    failures: result.failures.length
                });

                // Cache successes
                for (const success of result.successes) {
                    this.setCacheValue(success.cacheKey, success.translated);
                }

                // Log failures
                for (const failure of result.failures) {
                    console.warn(`[TranslateOnTheFly] Failed to translate ${failure.type}:`, failure.value, '→', failure.rejectReason);
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
                    const speakerKey = this.getCacheKey(originalSpeakerName, 'speaker');
                    const translatedSpeaker = this.translationCache.get(speakerKey);
                    if (translatedSpeaker) {
                        this.replaceSpeakerName(translatedSpeaker);
                    }
                }

                // Apply choices
                if (hasChoices) {
                    const translatedChoices = originalChoices.map(choice => {
                        const choiceKey = this.getCacheKey(choice, 'choice');
                        return this.translationCache.get(choiceKey) || choice;
                    });
                    this.replaceChoiceText(translatedChoices);
                }

                // Force refresh the currently displayed message window
                if (this.currentMessageWindow && this.currentMessageWindow.isOpen()) {
                    const msgWindow = this.currentMessageWindow;
                    
                    console.log('[TranslateOnTheFly] Refreshing message window by close/open cycle');
                    
                    // Save current state
                    const wasOpen = msgWindow.isOpen();
                    const currentOpenness = msgWindow.openness;
                    
                    if (wasOpen) {
                        if(translatedText) {
                            msgWindow.contents.clear();
                            const tState = msgWindow.createTextState(translatedText, 0, 0, 5);
                            msgWindow._textState = tState;
                            msgWindow.pause = false;
                        }
                    }
                    
                    // If choices are displayed, refresh them too
                    if (hasChoices && SceneManager._scene && SceneManager._scene._choiceListWindow) {
                        const choiceWindow = SceneManager._scene._choiceListWindow;
                        if (choiceWindow.isOpen()) {
                            choiceWindow.refresh();
                        }
                    }
                }

                console.log('[TranslateOnTheFly] Translation applied and window refreshed');
            } catch (error) {
                console.error('[TranslateOnTheFly] Translation error:', error);
                this.hideSpinner();
            }
        },

        async translateAllMaps() {
            try {
                // Check if engine is configured
                if (!this.engine || !this.isEngineFullyConfigured()) {
                    Alert.error('Translation engine not fully configured');
                    return;
                }

                // Check if map data is loaded
                if (!$dataMapInfos || !Array.isArray($dataMapInfos)) {
                    Alert.error('Map info not loaded');
                    return;
                }

                console.log('[TranslateOnTheFly] Starting translation of all maps');

                // Collect all valid map IDs
                const validMaps = [];
                for (let i = 0; i < $dataMapInfos.length; i++) {
                    const mapInfo = $dataMapInfos[i];
                    if (mapInfo && mapInfo.id) {
                        validMaps.push({ id: mapInfo.id, name: mapInfo.name || `Map ${mapInfo.id}` });
                    }
                }

                if (validMaps.length === 0) {
                    Alert.warn('No valid maps found');
                    return;
                }

                console.log(`[TranslateOnTheFly] Found ${validMaps.length} maps to translate`);

                let totalTranslated = 0;
                let totalFailed = 0;

                
                console.log('[TranslateOnTheFly] Translating common events first');
                try {
                    const result = await this.translateMapEvents({
                    events: [{
                        pages: $dataCommonEvents
                    }],
                    displayName: 'Common Events'
                }, -1, null);
                        if (result) {
                            totalTranslated += result.successCount || 0;
                            totalFailed += result.failureCount || 0;
                        }
                } catch (error) {
                    console.error('[TranslateOnTheFly] Failed to translate common events:', error);
                }

                // Process each map
                for (let i = 0; i < validMaps.length; i++) {
                    const mapInfo = validMaps[i];
                    const mapId = mapInfo.id;
                    const mapName = mapInfo.name;
                    const mapNumber = i + 1;

                    console.log(`[TranslateOnTheFly] Processing map ${mapNumber}/${validMaps.length}: ${mapName} (ID: ${mapId})`);

                    try {
                        // Load map data
                        const filename = "Map%1.json".format(mapId.padZero(3));
                        const mapData = await new Promise((resolve, reject) => {
                            const xhr = new XMLHttpRequest();
                            xhr.open('GET', `data/${filename}`, true);
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
                            xhr.onerror = () => reject(new Error('Network error'));
                            xhr.send();
                        });

                        // Translate map events with progress info
                        const result = await this.translateMapEvents(mapData, mapNumber, validMaps.length);
                        if (result) {
                            totalTranslated += result.successCount || 0;
                            totalFailed += result.failureCount || 0;
                        }
                    } catch (error) {
                        console.error(`[TranslateOnTheFly] Failed to load or translate map ${mapId}:`, error);
                    }
                }

                this.hideProgressBox();
                console.log(`[TranslateOnTheFly] All maps translation completed: ${totalTranslated} successes, ${totalFailed} failures`);
                Alert.success(`All maps translated! ${totalTranslated} messages translated, ${totalFailed} failures`);
            } catch (error) {
                this.hideProgressBox();
                console.error('[TranslateOnTheFly] translateAllMaps error:', error);
                Alert.error('Failed to translate all maps: ' + error.message);
            }
        },

        async translateMapEvents(mapData = null, mapNumber = null, totalMaps = null) {
            try {
                // Use provided mapData or fall back to $dataMap
                const dataMap = mapData || $dataMap;
                console.log('[TranslateOnTheFly] translateMapEvents called for map:', mapNumber, dataMap);

                // Check if map is loaded
                if (!dataMap) {
                    console.warn('[TranslateOnTheFly] No map loaded');
                    Alert.warn('No map to translate');
                    return;
                }

                // Check if engine is configured
                if (!this.engine || !this.isEngineFullyConfigured()) {
                    Alert.error('Translation engine not fully configured');
                    return;
                }

                const mapName = dataMap.displayName || 'Map';
                const mapProgressPrefix = (mapNumber !== null && totalMaps !== null) 
                    ? `Map ${mapNumber}/${totalMaps} - ` 
                    : '';

                console.log('[TranslateOnTheFly] Starting map translation:', mapName);
                this.showSpinner();

                let totalMessages = 0;
                let translatedMessages = 0;

                // Iterate through all events on the map
                const events = dataMap.events;
                if (!Array.isArray(events)) {
                    this.hideSpinner();
                    Alert.warn('Invalid map event data');
                    return;
                }

                // Collect all items to translate from all events
                const itemsToTranslate = [];

                const pushMapTextItem = (rawText, eventIdx, pageIdx, cmdIdx) => {
                    if (typeof rawText !== 'string') {
                        return;
                    }

                    // Keep original spacing intact for cache key and translation payload.
                    if (rawText.trim() === '') {
                        return;
                    }

                    const cacheKey = this.getCacheKey(rawText, 'text');
                    if (this.hasUsableCacheValue(cacheKey)) {
                        return;
                    }

                    itemsToTranslate.push({
                        type: 'text',
                        id: `map_${eventIdx}_${pageIdx}_text_${totalMessages}`,
                        value: rawText,
                        cacheKey: cacheKey,
                        eventIdx: eventIdx,
                        pageIdx: pageIdx,
                        cmdIdx: cmdIdx
                    });
                    totalMessages++;
                };

                for (let eventIdx = 0; eventIdx < events.length; eventIdx++) {
                    const event = events[eventIdx];
                    if (!event) continue;

                    // Check if event has pages
                    const pages = event.pages;
                    if (!Array.isArray(pages)) continue;

                    // Scan each page's command list
                    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
                        const page = pages[pageIdx];
                        if (!page) continue;

                        // Get the command list for this page
                        const list = page.list;
                        if (!Array.isArray(list)) continue;

                        // Scan the list for messages and choices (reuse collectAheadItems scanner logic)
                        let i = 0;
                        while (i < list.length) {
                            const cmd = list[i];
                            if (!cmd || typeof cmd.code !== 'number') {
                                i++;
                                continue;
                            }

                            if (cmd.code === 0) {
                                i++;
                                continue;
                            }

                            // Message block (code 101)
                            if (cmd.code === 101) {
                                const speaker = (cmd.parameters && cmd.parameters[4]) || '';
                                const lines = [];
                                let j = i + 1;

                                // Collect message continuation lines
                                while (j < list.length && list[j] && list[j].code === 401) {
                                    lines.push(list[j].parameters && list[j].parameters[0]);
                                    j++;
                                }

                                const messageText = lines.join('\n');
                                pushMapTextItem(messageText, eventIdx, pageIdx, i);

                                if (speaker) {
                                    const speakerKey = this.getCacheKey(speaker, 'speaker');
                                    if (!this.hasUsableCacheValue(speakerKey)) {
                                        itemsToTranslate.push({
                                            type: 'speaker',
                                            id: `map_${eventIdx}_${pageIdx}_speaker_${totalMessages}`,
                                            value: speaker,
                                            cacheKey: speakerKey,
                                            eventIdx: eventIdx,
                                            pageIdx: pageIdx,
                                            cmdIdx: i
                                        });
                                    }
                                }

                                i = j;
                                continue;
                            }

                            // Some projects contain standalone 401 blocks without a preceding 101.
                            // Collect them as message blocks so they are not skipped in map batch mode.
                            if (cmd.code === 401) {
                                const prevCmd = i > 0 ? list[i - 1] : null;
                                if (prevCmd && (prevCmd.code === 101 || prevCmd.code === 401)) {
                                    i++;
                                    continue;
                                }

                                const lines = [];
                                let j = i;
                                while (j < list.length && list[j] && list[j].code === 401) {
                                    lines.push(list[j].parameters && list[j].parameters[0]);
                                    j++;
                                }

                                const messageText = lines.join('\n');
                                pushMapTextItem(messageText, eventIdx, pageIdx, i);
                                i = j;
                                continue;
                            }

                            // Show Choices (code 102)
                            if (cmd.code === 102) {
                                const choices = cmd.parameters && cmd.parameters[0];
                                if (Array.isArray(choices)) {
                                    for (const choice of choices) {
                                        const choiceKey = this.getCacheKey(choice, 'choice');
                                        if (!this.hasUsableCacheValue(choiceKey)) {
                                            itemsToTranslate.push({
                                                type: 'choice',
                                                id: `map_${eventIdx}_${pageIdx}_choice_${totalMessages}`,
                                                value: choice,
                                                cacheKey: choiceKey,
                                                eventIdx: eventIdx,
                                                pageIdx: pageIdx,
                                                cmdIdx: i
                                            });
                                            totalMessages++;
                                        }
                                    }
                                }
                                i++;
                                continue;
                            }

                            i++;
                        }
                    }
                }

                console.log(`[TranslateOnTheFly] Found ${itemsToTranslate.length} items to translate on map ${mapName}`);

                if (itemsToTranslate.length === 0 && !totalMaps) {
                    this.hideSpinner();
                    if (!mapNumber) {
                        Alert.info('All map messages are already translated');
                    }
                    return { successCount: 0, failureCount: 0 };
                }

                // Deduplicate items by cacheKey across the entire map
                const uniqueItemsMap = new Map();
                for (const item of itemsToTranslate) {
                    if (!uniqueItemsMap.has(item.cacheKey)) {
                        uniqueItemsMap.set(item.cacheKey, item);
                    }
                }
                const uniqueItems = Array.from(uniqueItemsMap.values());

                console.log(`[TranslateOnTheFly] After deduplication: ${uniqueItems.length} unique items (was ${itemsToTranslate.length})`);

                // Batch translate items with char limit per batch (1000 chars)
                let batchNum = 0;
                let totalSuccesses = 0;
                let totalFailures = 0;
                let activeBatch = [];

                try {
                    let i = 0;
                    while (i < uniqueItems.length) {
                        batchNum++;
                        const batch = [];
                        let batchChars = 0;

                        // Collect items for this batch up to char limit
                        while (i < uniqueItems.length && batchChars < this.charLimit && batch.length < this.batchItemsLimit) {
                            const item = uniqueItems[i];
                            const itemLength = item.value.length;

                            // If adding this item would exceed limit and batch is not empty, send what we have
                            if (batchChars > 0 && batchChars + itemLength > this.charLimit) {
                                break;
                            }

                            batch.push(item);
                            batchChars += itemLength;
                            i++;
                        }

                        console.log(`[TranslateOnTheFly] Translating batch ${batchNum}: ${batch.length} items, ${batchChars} chars`);

                        // Show progress in UI box
                        const currentProgress = totalSuccesses + totalFailures;
                        const totalItems = uniqueItems.length;
                        const messageProgressText = `${currentProgress}/${totalItems}`;
                        
                        if (mapNumber !== null && totalMaps !== null) {
                            // Dual progress: map progress + message progress (NO MAP NAME - spoilers!)
                            const mapProgressText = `Map ${mapNumber}/${totalMaps}`;
                            this.updateProgressBox(mapProgressText, messageProgressText, totalSuccesses, totalFailures);
                        } else {
                            // Single progress: just message count
                            this.updateProgressBox(null, messageProgressText, totalSuccesses, totalFailures);
                        }

                        // Translate this batch
                        // shuffle(batch); // Shuffle to avoid patterns
                        activeBatch = batch;
                        const result = await this.engine.batchTranslate(batch);
                        activeBatch = [];
                        
                        // Cache successes
                        for (const success of result.successes) {
                            this.setCacheValue(success.cacheKey, success.translated);
                            translatedMessages++;
                            totalSuccesses++;
                        }

                        // Log failures
                        for (const failure of result.failures) {
                            console.warn(`[TranslateOnTheFly] Failed to translate ${failure.type}:`, failure.value.substring(0, 50), '→', failure.rejectReason);
                            totalFailures++;
                        }
                        this.markBatchFailuresAsUntranslated(result.failures, true);
                    }

                    this.hideSpinner();
                    if (!mapNumber) {
                        this.hideProgressBox();
                        Alert.success(`Translated ${totalSuccesses}/${uniqueItems.length} map messages in ${batchNum} batches`);
                    }
                    console.log(`[TranslateOnTheFly] Map translation completed: ${totalSuccesses} successes, ${totalFailures} failures`);
                    return { successCount: totalSuccesses, failureCount: totalFailures };
                } catch (error) {
                    this.markBatchItemsAsUntranslated(activeBatch, true);
                    this.hideSpinner();
                    if (!mapNumber) {
                        this.hideProgressBox();
                        Alert.error('Failed to translate map: ' + error.message);
                    }
                    console.error('[TranslateOnTheFly] Map batch translation error:', error);
                    return { successCount: totalSuccesses, failureCount: totalFailures };
                }
            } catch (error) {
                this.hideSpinner();
                this.hideProgressBox();
                console.error('[TranslateOnTheFly] Map translation error:', error);
                if (!mapNumber) {
                    Alert.error('Failed to translate map: ' + error.message);
                }
                return { successCount: 0, failureCount: 0 };
            }
        }
    }
};

const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}