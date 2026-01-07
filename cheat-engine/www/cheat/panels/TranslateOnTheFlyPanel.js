import { Alert } from '../js/AlertHelper.js';
import { MessageCheat } from '../js/CheatHelper.js';
import { KeyValueStorage } from '../js/KeyValueStorage.js';
import { TranslateOnTheFlyState } from '../js/TranslateOnTheFlyState.js';
import { createEngine, getAvailableEngines } from '../translate-engines/index.js';

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
            @change="onChangeCacheOnly"
            :disabled="enabled === true">
        </v-switch>

        <v-switch
            v-model="tryTranslateAhead"
            label="Try to translate ahead (batch nearby messages)"
            dense
            hide-details
            @click.self.stop
            @change="onChangeTryTranslateAhead">
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
            :disabled="!enabled"
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
            :disabled="!enabled"
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
            :disabled="!enabled"
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
                :disabled="!enabled"
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
                :disabled="!enabled"
                @keydown.stop
                @change="onChangeLibreTranslateApiKey"
            ></v-text-field>
        </div>

        <!-- AI Engine (GPT4All / Open WebUI) config -->
        <div v-if="translationEngine === 'gpt4all'" class="mt-3">
            <v-select
                v-model="aiProvider"
                :items="aiProviderOptions"
                label="Provider"
                outlined
                dense
                hide-details
                :disabled="!enabled"
                @input="onChangeAiProvider"
                @change="onChangeAiProvider"
                class="mb-2"
            ></v-select>
            <v-text-field
                v-model="aiHost"
                :label="aiProvider === 'openwebui' ? 'Open WebUI Host' : 'GPT4All Host'"
                outlined
                dense
                hide-details
                :disabled="!enabled"
                @keydown.stop
                @change="onChangeAiHost"
                class="mb-2"
            ></v-text-field>
            <v-text-field
                v-if="aiProvider === 'openwebui'"
                v-model="aiApiKey"
                label="Open WebUI API Key"
                outlined
                dense
                hide-details
                type="password"
                :disabled="!enabled"
                @keydown.stop
                @change="onChangeAiApiKey"
                class="mb-2"
            ></v-text-field>
            <div class="d-flex gap-2 mb-2 align-center">
                <v-btn
                    small
                    outlined
                    color="primary"
                    :disabled="!enabled || aiLoadingModels"
                    @click="fetchAiModels"
                    :loading="aiLoadingModels"
                >
                    <v-icon small left>mdi-refresh</v-icon>
                    Fetch Models
                </v-btn>
                <div v-if="aiModelsError" class="text-caption error--text">{{ aiModelsError }}</div>
            </div>
            <v-select
                v-model="aiSelectedModel"
                :items="aiModels"
                label="Select Model"
                outlined
                dense
                hide-details
                :disabled="!enabled || aiModels.length === 0"
                @change="onChangeAiModel"
                class="mb-2"
            ></v-select>
        </div>
    </v-card-text>

    <v-card-subtitle class="pb-0 mt-4 font-weight-bold">Text Wrapping</v-card-subtitle>
    
    <v-card-text class="py-0">
        <v-switch
            v-model="enableTextWrapping"
            label="Keep translated strings under max width"
            dense
            hide-details
            :disabled="!enabled"
            @click.self.stop
            @change="onChangeTextWrapping">
        </v-switch>
    </v-card-text>
    
    <v-card-text class="py-0">
        <v-text-field
            v-model.number="maxLineWidth"
            label="Maximum line width (characters)"
            outlined
            dense
            type="number"
            min="20"
            max="200"
            hide-details
            :disabled="!enabled || !enableTextWrapping"
            @keydown.self.stop
            @change="onChangeMaxWidth"
            @focus="$event.target.select()">
        </v-text-field>
    </v-card-text>
    
    <v-card-subtitle class="pb-0 mt-4 font-weight-bold">Translation Status</v-card-subtitle>
    <v-card-text class="py-0">
        <div class="caption">
            <div>Total Translations: {{translationCount}}</div>
            <div>Cached Texts: {{cachedCount}}</div>
            <div v-if="lastTranslation" class="mt-2">
                <strong>Last Translation:</strong>
                <div class="text--secondary">{{lastTranslation.original}}</div>
                <div class="primary--text">{{lastTranslation.translated}}</div>
            </div>
        </div>
    </v-card-text>
    
    <v-card-text class="py-2">
        <v-btn
            small
            outlined
            color="warning"
            :disabled="!enabled || cachedCount === 0"
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
            sourceLang: 'ja',
            targetLang: 'en',
            translationCount: 0,
            lastTranslation: null,
            enableTextWrapping: true,
            maxLineWidth: 60,
            translationEngine: 'mymemory',
            translateCacheWhenDisabled: false,
            tryTranslateAhead: false,
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
            // AI Engine (GPT4All / Open WebUI)
            aiProvider: 'gpt4all',
            aiProviderOptions: [
                { text: 'Gpt4All', value: 'gpt4all' },
                { text: 'Open WebUI', value: 'openwebui' }
            ],
            aiHost: 'http://localhost:4891',
            aiApiKey: '',
            aiSelectedModel: '',
            aiModels: [],
            aiLoadingModels: false,
            aiModelsError: ''
        };
    },

    created() {
        this.kvStorage = new KeyValueStorage('./www/cheat-settings/translate-on-the-fly.json');
        this.cacheStorage = new KeyValueStorage('./www/cheat-settings/translate-cache.json');
        this.translationCache = window.__TranslateOnTheFlyCache || new Map();
        window.__TranslateOnTheFlyCache = this.translationCache;
        this.pendingTranslations = new Map();
        this.failedTranslations = new Map(); // Track failed translation attempts to prevent retry spam
        this.translationInProgress = false;
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
        
        if (this.enabled) {
            console.log('[TranslateOnTheFly] Translation enabled from saved settings');
        }
    },

    beforeDestroy() {
        if (this.stateUnsubscribe) {
            this.stateUnsubscribe();
            this.stateUnsubscribe = null;
        }

        if (window.__TranslateOnTheFlyPanel === this) {
            delete window.__TranslateOnTheFlyPanel;
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
            this.translationEngine = data.translationEngine || 'mymemory';
            this.translateCacheWhenDisabled = data.translateCacheWhenDisabled || false;
            this.tryTranslateAhead = data.tryTranslateAhead || false;
            
            // Load engine-specific settings
            this.engineSettings = data.engineSettings || {};
            
            TranslateOnTheFlyState.setEnabled(this.enabled, { notify: false });
        },

        saveSettings() {
            // Collect engine-specific settings before saving
            if (this.engine) {
                const engineConfig = this.engine.getConfigData();
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
                translationEngine: this.translationEngine,
                translateCacheWhenDisabled: this.translateCacheWhenDisabled,
                tryTranslateAhead: this.tryTranslateAhead,
                engineSettings: this.engineSettings || {}
            };
            this.kvStorage.setItem('data', JSON.stringify(data));
        },

        onChangeCacheOnly() {
            // When real-time is enabled, this flag is ignored; still persist for when disabled later
            this.saveSettings();
        },

        onChangeTryTranslateAhead() {
            this.saveSettings();
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

            return candidates.find((it) => it && typeof it.isRunning === 'function' && it.isRunning() && it._waitMode === 'message');
        },

        collectAheadMessages(currentText, interpreter, options = {}) {
            const charLimit = options.charLimit || 5000;
            const maxLookahead = options.maxLookahead || 50;
            const maxDepth = options.maxDepth !== undefined ? options.maxDepth : 999; // 0 = only current, 999 = scan ahead
            const NL = '\n';
            const collected = [];

            const pushEntry = (text) => {
                if (!text || typeof text !== 'string') {
                    return false;
                }
                const nextLength = collected.reduce((acc, e) => acc + e.text.length, 0) + text.length;
                if (nextLength > charLimit) {
                    return false;
                }
                collected.push({ text, cacheKey: this.getCacheKey(text, 'text') });
                return true;
            };

            // Always include the current text first
            pushEntry(currentText);

            // If maxDepth is 0, only return current message (no lookahead)
            if (maxDepth === 0 || !interpreter || !Array.isArray(interpreter._list)) {
                return collected;
            }

            const list = interpreter._list;
            // _index in RPG Maker points to the next command to execute; start scanning from there
            const startIndex = Math.max(0, interpreter._index || 0);
            const baseIndent = interpreter.currentCommand && typeof interpreter.currentCommand === 'function'
                ? (interpreter.currentCommand() && interpreter.currentCommand().indent) || 0
                : 0;

            let i = startIndex;
            let scanned = 0;
            while (i < list.length && scanned < maxLookahead) {
                scanned++;
                const cmd = list[i];
                if (!cmd || typeof cmd.code !== 'number') {
                    break;
                }

                if (cmd.indent !== undefined && cmd.indent < baseIndent) {
                    break; // exited current branch
                }

                if (cmd.code === 0) {
                    break; // end of list
                }

                // Skip lines from other deeper-indent branches (e.g., inside if/else blocks)
                // but continue scanning for messages on the same base indent level
                if (cmd.indent !== undefined && cmd.indent > baseIndent) {
                    i++;
                    continue; // Skip this command, but keep scanning for more messages
                }

                if (cmd.code === 401) { // continuation of previous message, skip as standalone
                    i++;
                    continue;
                }

                if (cmd.code === 101) { // new message block - collect it and all its continuation lines
                    const speaker = (cmd.parameters && cmd.parameters[4]) || '';
                    const lines = [];
                    let j = i + 1;
                    
                    // Collect all 401 lines (message continuation) that follow this 101
                    while (j < list.length && list[j] && list[j].code === 401 && list[j].indent === cmd.indent) {
                        lines.push(list[j].parameters && list[j].parameters[0]);
                        j++;
                    }
                    
                    const joined = lines.join(NL);
                    if (!pushEntry(joined)) {
                        break; // Char limit reached, stop collecting
                    }
                    
                    // Attach speaker info to the last pushed entry
                    const last = collected[collected.length - 1];
                    if (last) {
                        last.speaker = speaker;
                    }
                    
                    i = j; // Move to position after all 401 lines
                    continue;
                }

                // For all other commands (show icon, play sound, etc.) at the same indent,
                // skip them but continue scanning for more messages ahead
                i++;
                continue;
            }

            return collected;
        },

        async startAheadTranslation({ currentText, currentSpeakerName, cacheKey, maxDepth }) {
            let batch = [];
            try {
                const interpreter = this.findMessageInterpreter();
                batch = this.collectAheadMessages(currentText, interpreter, { charLimit: 5000, maxDepth });

                if (!batch.length) {
                    return;
                }

                const currentEntry = batch[0];

                // If current message already cached, apply and skip API
                if (this.translationCache.has(currentEntry.cacheKey)) {
                    this.replaceMessageText(this.translationCache.get(currentEntry.cacheKey));
                    this._translationApplied = true;
                    return;
                }

                // Only translate entries that are missing in cache
                const missing = batch.filter(entry => !this.translationCache.has(entry.cacheKey));
                if (!missing.length) {
                    this.replaceMessageText(this.translationCache.get(currentEntry.cacheKey));
                    this._translationApplied = true;
                    return;
                }

                // Mark missing entries as pending
                for (const entry of missing) {
                    this.pendingTranslations.set(entry.cacheKey, true);
                }

                // Batch translate missing messages in one call using safe delimiters
                console.log('[TranslateOnTheFly] Ahead translation batch (missing only):', missing.map(m => m.text));
                // Batch translate messages + speakers in one call (skip batch for LibreTranslate due to unstable tag handling)
                const speakerSet = new Set();
                if (currentSpeakerName) {
                    speakerSet.add(currentSpeakerName);
                }
                batch.forEach(e => {
                    if (e && e.speaker) {
                        speakerSet.add(e.speaker);
                    }
                });
                // Filter out speakers that are already cached - don't re-translate them!
                const speakerList = Array.from(speakerSet).filter(speaker => {
                    if (!speaker) return false;
                    const speakerKey = this.getCacheKey(speaker, 'speaker');
                    return !this.translationCache.has(speakerKey);
                });

                // Delegate to engine for batch translation
                await this.engine.batchTranslateMessagesAndSpeakers(missing, speakerList);

                // Apply the current message (now cached)
                const applied = this.translationCache.get(currentEntry.cacheKey) || currentText;
                this.replaceMessageText(applied);
                this._translationApplied = true;

                // Do NOT cache original speaker names here; only translations are cached elsewhere

                this.translationCount += missing.length;
                this.lastTranslation = {
                    original: currentText.substring(0, 100),
                    translated: applied.substring(0, 100)
                };
                this.saveSettings();

                // Log how many actually got cached
                const cachedCount = missing.filter(e => this.translationCache.has(e.cacheKey)).length;
                console.log('[TranslateOnTheFly] Ahead translation batch cached', cachedCount, 'of', missing.length);
            } catch (error) {
                console.error('[TranslateOnTheFly] Ahead translation error:', error);
                // Never cache original on failure; mark failed and allow cooldown
                this.failedTranslations.set(cacheKey, Date.now());
                // Apply original for display this time, without caching
                this.replaceMessageText(currentText);
                this._translationApplied = true;
            } finally {
                // Clear pending flags for batch entries
                for (const entry of batch) {
                    this.pendingTranslations.delete(entry.cacheKey);
                }
            }
        },

        onChangeEnabled() {
            TranslateOnTheFlyState.setEnabled(this.enabled);
            this.saveSettings();
            if (this.enabled) {
                console.log('[TranslateOnTheFly] Translation enabled');
            } else {
                console.log('[TranslateOnTheFly] Translation disabled');
            }
        },

        onChangeSourceLang() {
            this.translationCache.clear();
            this.saveSettings();
        },

        onChangeTargetLang() {
            this.translationCache.clear();
            this.saveSettings();
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
            
            this.translationCache.clear();
            this.saveSettings();
        },

        onChangeTextWrapping() {
            this.translationCache.clear();
            this.saveSettings();
        },

        onChangeMaxWidth() {
            this.translationCache.clear();
            this.saveSettings();
        },

        clearCache() {
            const count = this.translationCache.size;
            this.translationCache.clear();
            this.persistCache();
            console.log(`[TranslateOnTheFly] Cleared ${count} cached translations`);
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
                const originalCanStart = Window_Message.prototype._originalCanStart.call(this);
                const translationEnabled = self.isTranslationEnabled();
                const skipping = self.isSkippingMessages();
                const allowTranslation = translationEnabled && !skipping;
                const useCacheOnly = (translationEnabled && skipping) || (!translationEnabled && self.translateCacheWhenDisabled);

                if (translationEnabled && allowTranslation && !$gameMessage._translateOriginalText) {
                    // Lightweight trace to confirm hook runs after restart
                    // console.log('[TranslateOnTheFly] canStart hook engaged, allowTranslation');
                }
                
                if (!originalCanStart || (!translationEnabled && !useCacheOnly)) {
                    return originalCanStart;
                }
                
                const originalText = $gameMessage._translateOriginalText || $gameMessage.allText();
                
                if (!originalText || originalText.trim().length === 0) {
                    return originalCanStart;
                }
                
                // Remember original text for later key lookups (startInput)
                if (!$gameMessage._translateOriginalText) {
                    $gameMessage._translateOriginalText = originalText;
                }

                const cacheKey = self.getCacheKey(originalText, 'text');
                const choices = ($gameMessage.choices && $gameMessage.choices()) || [];
                const originalChoices = $gameMessage._translateOriginalChoices || choices;
                const hasChoices = Array.isArray(choices) && choices.length > 0;
                const choiceKey = hasChoices ? self.getCacheKey(JSON.stringify(originalChoices), 'choices') : null;

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

                const textReady = self.translationCache.has(cacheKey);
                const choicesReady = !hasChoices || self.translationCache.has(choiceKey);
                const speakerReady = !hasSpeakerName || self.translationCache.has(speakerKey);

                if (useCacheOnly) {
                    if (!this._translationApplied && textReady) {
                        const translatedText = self.translationCache.get(cacheKey);
                        self.replaceMessageText(translatedText);
                        this._translationApplied = true;
                    }

                    if (hasChoices && choicesReady) {
                        self.replaceChoiceText(self.translationCache.get(choiceKey));
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
                        const translatedText = self.translationCache.get(cacheKey);
                        self.replaceMessageText(translatedText);

                        if (hasChoices) {
                            const translatedChoices = self.translationCache.get(choiceKey) || choices;
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
                        self.pendingTranslations.has(cacheKey) ||
                        (hasChoices && self.pendingTranslations.has(choiceKey))
                    )) {
                        return false;
                    }
                    
                    // If main text translation failed and is in cooldown, don't retry yet (show original)
                    if (allowTranslation && self.failedTranslations.has(cacheKey)) {
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
                    if (allowTranslation && !textReady) {
                        const maxDepth = self.tryTranslateAhead ? 999 : 0; // 0 = only current message, 999 = scan ahead
                        const logPrefix = maxDepth > 0 ? 'ahead translation batch' : 'translation';
                        console.log(`[TranslateOnTheFly] Starting ${logPrefix} for:`, originalText.substring(0, 50));
                        
                        self.startAheadTranslation({
                            currentText: originalText,
                            currentSpeakerName: originalSpeakerName,
                            cacheKey,
                            maxDepth
                        });
                    }
                    
                    // Choices: respect cooldown on failures to avoid loops
                    if (allowTranslation && hasChoices && !choicesReady && self.failedTranslations.has(choiceKey)) {
                        const failedTime = self.failedTranslations.get(choiceKey);
                        const cooldownMs = 5000;
                        if (Date.now() - failedTime < cooldownMs) {
                            // Use original choices during cooldown
                            self.replaceChoiceText(originalChoices);
                            // Do not start translation now
                        } else {
                            self.failedTranslations.delete(choiceKey);
                            // fall through to start translation below
                        }
                    }

                    // Start translation for choices if needed
                    if (allowTranslation && hasChoices && !choicesReady) {
                        console.log('[TranslateOnTheFly] Starting choice translation for:', choices.join(' | ').substring(0, 50));
                        self.pendingTranslations.set(choiceKey, true);

                        self.translateChoices(originalChoices)
                            .then(result => {
                                const safeChoices = (result && result.choices) || originalChoices;
                                if (result && result.complete) {
                                    self.setCacheValue(choiceKey, safeChoices);
                                }
                                self.replaceChoiceText(safeChoices);
                            })
                            .catch(error => {
                                console.error('[TranslateOnTheFly] Choice translation error:', error);
                                // Do not cache original choices on error
                                self.failedTranslations.set(choiceKey, Date.now());
                            })
                            .finally(() => {
                                self.pendingTranslations.delete(choiceKey);
                            });
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

                    // Start translation for speaker name if needed
                    if (allowTranslation && hasSpeakerName && !speakerReady) {
                        if (self.tryTranslateAhead) {
                            return false; // ahead batch will handle speaker
                        }

                        if (self.pendingTranslations.has(speakerKey)) {
                            return false; // wait for speaker translation already pending
                        }

                        console.log('[TranslateOnTheFly] Starting speaker translation for:', originalSpeakerName.substring(0, 50));
                        self.pendingTranslations.set(speakerKey, true);

                        self.translateSpeakerName(originalSpeakerName)
                            .then(translatedSpeaker => {
                                const safeSpeaker = translatedSpeaker || originalSpeakerName;
                                // Only cache if translated (different from original)
                                if (translatedSpeaker && translatedSpeaker !== originalSpeakerName) {
                                    self.setCacheValue(speakerKey, safeSpeaker);
                                } else {
                                    // Do not cache original speaker on failure/no-change
                                    self.failedTranslations.set(speakerKey, Date.now());
                                }
                                self.replaceSpeakerName(safeSpeaker);
                            })
                            .catch(error => {
                                console.error('[TranslateOnTheFly] Speaker translation error:', error);
                                // Never cache original on error; mark failed for cooldown
                                self.failedTranslations.set(speakerKey, Date.now());
                            })
                            .finally(() => {
                                self.pendingTranslations.delete(speakerKey);
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

                const choiceKey = self.getCacheKey(JSON.stringify(this._translateOriginalChoices), 'choices');

                // If already cached, replace immediately
                if (self.translationCache.has(choiceKey)) {
                    const translated = self.translationCache.get(choiceKey);
                    self.replaceChoiceText(translated);
                    return;
                }

                if (skipping) {
                    return;
                }

                // If already pending, do nothing
                if (self.pendingTranslations.has(choiceKey)) {
                    return;
                }

                // Kick off translation asynchronously (non-blocking)
                self.pendingTranslations.set(choiceKey, true);
                self.translateChoices(choices)
                    .then(result => {
                        const safeChoices = (result && result.choices) || choices;
                        if (result && result.complete) {
                            self.setCacheValue(choiceKey, safeChoices);
                        }
                        self.replaceChoiceText(safeChoices);
                    })
                    .catch(error => {
                        console.error('[TranslateOnTheFly] Choice translation error (setChoices hook):', error);
                        self.setCacheValue(choiceKey, choices);
                    })
                    .finally(() => {
                        self.pendingTranslations.delete(choiceKey);
                    });
            };

            // Block entering choice input until choices are translated
            if (!Window_Message.prototype._originalStartInput) {
                Window_Message.prototype._originalStartInput = Window_Message.prototype.startInput;
            }

            Window_Message.prototype.startInput = function() {
                const translationEnabled = self.isTranslationEnabled();
                const skipping = self.isSkippingMessages();
                const allowTranslation = translationEnabled && !skipping;

                if (allowTranslation) {
                    // Block input if main text translation is still pending or missing
                    const originalText = $gameMessage._translateOriginalText || $gameMessage.allText();
                    const textKey = self.getCacheKey(originalText, 'text');

                    if (self.pendingTranslations.has(textKey)) {
                        return false; // wait for text translation
                    }

                    // If translation already applied on this window, allow
                    if (!this._translationApplied && !self.translationCache.has(textKey)) {
                        return false; // text not translated/applied yet
                    }
                }

                if (translationEnabled && $gameMessage.isChoice()) {
                    const choices = $gameMessage.choices();
                    const originalChoices = $gameMessage._translateOriginalChoices || choices;
                    const choiceKey = self.getCacheKey(JSON.stringify(originalChoices), 'choices');

                    // If choices translation is pending, wait
                    if (allowTranslation && self.pendingTranslations.has(choiceKey)) {
                        return false; // keep waiting
                    }

                    // If previous choice translation failed and in cooldown, proceed with originals
                    if (allowTranslation && self.failedTranslations.has(choiceKey)) {
                        const failedTime = self.failedTranslations.get(choiceKey);
                        const cooldownMs = 5000;
                        if (Date.now() - failedTime < cooldownMs) {
                            self.replaceChoiceText(originalChoices);
                            return Window_Message.prototype._originalStartInput.call(this);
                        }
                        // cooldown expired -> retry below and clear flag
                        self.failedTranslations.delete(choiceKey);
                    }

                    // If not cached, start translation and wait (only when not skipping)
                    if (allowTranslation && !self.translationCache.has(choiceKey)) {
                        self.pendingTranslations.set(choiceKey, true);
                        self.translateChoices(originalChoices)
                            .then(result => {
                                const safeChoices = (result && result.choices) || originalChoices;
                                if (result && result.complete) {
                                    self.setCacheValue(choiceKey, safeChoices);
                                }
                                self.replaceChoiceText(safeChoices);
                            })
                            .catch(error => {
                                console.error('[TranslateOnTheFly] Choice translation error (startInput hook):', error);
                                // Do not cache original choices; mark failure for cooldown
                                self.failedTranslations.set(choiceKey, Date.now());
                            })
                            .finally(() => {
                                self.pendingTranslations.delete(choiceKey);
                            });

                        return false; // wait until translation done
                    }

                    // Cached -> ensure applied then proceed
                    if (self.translationCache.has(choiceKey)) {
                        const cachedChoices = self.translationCache.get(choiceKey);
                        self.replaceChoiceText(cachedChoices);
                    }
                }

                return Window_Message.prototype._originalStartInput.call(this);
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
            return `${type}:${this.translationEngine}-${this.sourceLang}-${this.targetLang}-${keyText}`;
        },

        getLegacySpeakerCacheKey(speakerName) {
            if (!speakerName) {
                return null;
            }
            return `speaker:${this.translationEngine}-${this.sourceLang}-${this.targetLang}-${speakerName}`;
        },

        ensureSpeakerKeyPrefix(text) {
            if (!text) {
                return text;
            }

            return text.startsWith('name_') ? text : `name_${text}`;
        },

        setCacheValue(key, value) {
            this.translationCache.set(key, value);
            this.persistCache();
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
                        this.translationCache = new Map();
                        window.__TranslateOnTheFlyCache = this.translationCache;
                    }
                    this.translationCache.clear();
                    for (const [k, v] of entries) {
                        this.translationCache.set(k, v);
                    }
                }
            } catch (error) {
                console.warn('[TranslateOnTheFly] Failed to load cache, starting fresh', error);
                this.translationCache = new Map();
                window.__TranslateOnTheFlyCache = this.translationCache;
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

        ensureSpinnerElements() {
            if (typeof document === 'undefined') {
                return null;
            }

            if (!this._spinnerStyle) {
                const style = document.createElement('style');
                style.id = 'tof-translate-spinner-style';
                style.textContent = [
                    '#tof-translate-spinner { position: fixed; right: 12px; bottom: 12px; width: 48px; height: 48px; display: none; align-items: center; justify-content: center; pointer-events: none; z-index: 9999; }',
                    '#tof-translate-spinner .tof-spinner-ring { width: 32px; height: 32px; border: 3px solid rgba(255,255,255,0.35); border-top: 3px solid #4fc3f7; border-radius: 50%; animation: tof-translate-spin 0.9s linear infinite; box-shadow: 0 0 10px rgba(0,0,0,0.35); background: rgba(0,0,0,0.25); }',
                    '@keyframes tof-translate-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }'
                ].join('');
                document.head.appendChild(style);
                this._spinnerStyle = style;
            }

            if (!this._spinnerEl) {
                const el = document.createElement('div');
                el.id = 'tof-translate-spinner';
                el.innerHTML = '<div class="tof-spinner-ring"></div>';
                document.body.appendChild(el);
                this._spinnerEl = el;
            }

            return this._spinnerEl;
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

        translateChoices(choices) {
            const choiceKey = this.getCacheKey(JSON.stringify(choices || []), 'choices');
            // Delegate to engine
            return this.engine.batchTranslateChoices(choices || [], choiceKey);
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
        }
    }
};
