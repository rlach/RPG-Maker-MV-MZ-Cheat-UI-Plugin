import BaseTranslationEngine from './BaseTranslationEngine.js';

// Tag configuration for preprocessing and postprocessing
const TAG_CONFIGS = [
    // Tags with numeric parameter
    { type: 'variable', shortTag: 'v', prePattern: /\\(V)\[(\d+)\]/gi, postPattern: /\[{1,2}v(\d+)\]{1,2}/gi, hasParam: true, defaultCase: 'V', requiredConsistency: true },
    { type: 'actor', shortTag: 'an', prePattern: /\\(N)\[(\d+)\]/gi, postPattern: /\[{1,2}an(\d+)\]{1,2}/gi, hasParam: true, defaultCase: 'N', requiredConsistency: true },
    { type: 'partyMember', shortTag: 'p', prePattern: /\\(P)\[(\d+)\]/gi, postPattern: /\[{1,2}p(\d+)\]{1,2}/gi, hasParam: true, defaultCase: 'P', requiredConsistency: true },
    { type: 'color', shortTag: 'c', prePattern: /\\(C)\[(\d+)\]/gi, postPattern: /\[{1,2}c(\d+)\]{1,2}/gi, hasParam: true, defaultCase: 'C', requiredConsistency: false },
    { type: 'icon', shortTag: 'i', prePattern: /\\(I)\[(\d+)\]/gi, postPattern: /\[{1,2}i(\d+)\]{1,2}/gi, hasParam: true, defaultCase: 'I', requiredConsistency: false },
    // Tags without parameter
    { type: 'gold', shortTag: 'gold', prePattern: /\\(\$)/gi, postPattern: /\[{1,2}gold\]{1,2}/gi, hasParam: false, defaultCase: '$', requiredConsistency: true },
    { type: 'sizeInc', shortTag: 'si', prePattern: /\\(\{)/gi, postPattern: /\[{1,2}si\]{1,2}/gi, hasParam: false, defaultCase: '{', requiredConsistency: false },
    { type: 'sizeDec', shortTag: 'sd', prePattern: /\\(\})/gi, postPattern: /\[{1,2}sd\]{1,2}/gi, hasParam: false, defaultCase: '}', requiredConsistency: false },
    { type: 'backslash', shortTag: 'bs', prePattern: /\\(\\)/gi, postPattern: /\[{1,2}bs\]{1,2}/gi, hasParam: false, defaultCase: '\\', requiredConsistency: false },
    { type: 'waitQuarter', shortTag: 'wq', prePattern: /\\(\.)/gi, postPattern: /\[{1,2}wq\]{1,2}/gi, hasParam: false, defaultCase: '.', requiredConsistency: false },
    { type: 'waitSecond', shortTag: 'ws', prePattern: /\\(\|)/gi, postPattern: /\[{1,2}ws\]{1,2}/gi, hasParam: false, defaultCase: '|', requiredConsistency: false },
    { type: 'waitInput', shortTag: 'wi', prePattern: /\\(!)/gi, postPattern: /\[{1,2}wi\]{1,2}/gi, hasParam: false, defaultCase: '!', requiredConsistency: false },
    { type: 'displayAll', shortTag: 'da', prePattern: /\\(>)/gi, postPattern: /\[{1,2}da\]{1,2}/gi, hasParam: false, defaultCase: '>', requiredConsistency: false },
    { type: 'cancelDisplayAll', shortTag: 'cda', prePattern: /\\(<)/gi, postPattern: /\[{1,2}cda\]{1,2}/gi, hasParam: false, defaultCase: '<', requiredConsistency: false },
    { type: 'noWaitInput', shortTag: 'nwi', prePattern: /\\(\^)/gi, postPattern: /\[{1,2}nwi\]{1,2}/gi, hasParam: false, defaultCase: '^', requiredConsistency: false },
    // { type: 'simpleN', shortTag: 'n', prePattern: /\\([nN])|\n|↵/gi, postPattern: /\[{1,2}n\]{1,2}/gi, hasParam: false, defaultCase: 'n', requiredConsistency: false },
    // Message core plugin parameters
    // Wait
    { type: 'wait', shortTag: 'w', prePattern: /\\(W)\[(\d+)\]/gi, postPattern: /\[{1,2}w(\d+)\]{1,2}/gi, hasParam: true, defaultCase: 'W', requiredConsistency: false },
    // NameWindow
    { type: 'nameWindowLeft', shortTag: 'nwl', prePattern: /\\(N)<([^>]+)>/gi, postPattern: /\[{1,2}nwl([^\]]+)\]{1,2}/gi, hasParam: true, defaultCase: 'N', requiredConsistency: false },
    { type: 'nameWindowCenter', shortTag: 'nwc', prePattern: /\\(NC)<([^>]+)>/gi, postPattern: /\[{1,2}nwc([^\]]+)\]{1,2}/gi, hasParam: true, defaultCase: 'NC', requiredConsistency: false },
    { type: 'nameWindowRight', shortTag: 'nwr', prePattern: /\\(NR)<([^>]+)>/gi, postPattern: /\[{1,2}nwr([^\]]+)\]{1,2}/gi, hasParam: true, defaultCase: 'NR', requiredConsistency: false },
    // Line Break
    { type: 'lineBreak', shortTag: 'br', prePattern: /<(br)>/gi, postPattern: /\[{1,2}br\]{1,2}/gi, hasParam: false, defaultCase: 'br', requiredConsistency: false },
    // Position
    { type: 'posX', shortTag: 'px', prePattern: /\\(PX)\[(\d+)\]/gi, postPattern: /\[{1,2}px(\d+)\]{1,2}/gi, hasParam: true, defaultCase: 'PX', requiredConsistency: false },
    { type: 'posY', shortTag: 'py', prePattern: /\\(PY)\[(\d+)\]/gi, postPattern: /\[{1,2}py(\d+)\]{1,2}/gi, hasParam: true, defaultCase: 'PY', requiredConsistency: false },
    // Outline
    { type: 'outlineColor', shortTag: 'oc', prePattern: /\\(OC)\[(\d+)\]/gi, postPattern: /\[{1,2}oc(\d+)\]{1,2}/gi, hasParam: true, defaultCase: 'OC', requiredConsistency: false },
    { type: 'outlineWidth', shortTag: 'ow', prePattern: /\\(OW)\[(\d+)\]/gi, postPattern: /\[{1,2}ow(\d+)\]{1,2}/gi, hasParam: true, defaultCase: 'OW', requiredConsistency: false },
    // Font
    { type: 'fontReset', shortTag: 'fr', prePattern: /\\(FR)/gi, postPattern: /\[{1,2}fr\]{1,2}/gi, hasParam: false, defaultCase: 'FR', requiredConsistency: false, addSpace: true },
    { type: 'fontSize', shortTag: 'fs', prePattern: /\\(FS)\[(\d+)\]/gi, postPattern: /\[{1,2}fs(\d+)\]{1,2}/gi, hasParam: true, defaultCase: 'FS', requiredConsistency: false },
    { type: 'fontName', shortTag: 'fn', prePattern: /\\(FN)<([^>]+)>/gi, postPattern: /\[{1,2}fn([^\]]+)\]{1,2}/gi, hasParam: true, defaultCase: 'FN', requiredConsistency: false },
    { type: 'fontBold', shortTag: 'fb', prePattern: /\\(FB)/gi, postPattern: /\[{1,2}fb\]{1,2}/gi, hasParam: false, defaultCase: 'FB', requiredConsistency: false, addSpace: true },
    { type: 'fontItalic', shortTag: 'fi', prePattern: /\\(FI)/gi, postPattern: /\[{1,2}fi\]{1,2}/gi, hasParam: false, defaultCase: 'FI', requiredConsistency: false, addSpace: true },
    // Actor
    { type: 'actorFace', shortTag: 'af', prePattern: /\\(AF)\[(\d+)\]/gi, postPattern: /\[{1,2}af(\d+)\]{1,2}/gi, hasParam: true, defaultCase: 'AF', requiredConsistency: false },
    { type: 'actorClass', shortTag: 'acl', prePattern: /\\(AC)\[(\d+)\]/gi, postPattern: /\[{1,2}acl(\d+)\]{1,2}/gi, hasParam: true, defaultCase: 'AC', requiredConsistency: false },
    { type: 'actorNickname', shortTag: 'anck', prePattern: /\\(AN)\[(\d+)\]/gi, postPattern: /\[{1,2}anck(\d+)\]{1,2}/gi, hasParam: true, defaultCase: 'AN', requiredConsistency: false },
    { type: 'justAC', shortTag: 'ac', prePattern: /\\(AC)/gi, postPattern: /\[{1,2}ac\]{1,2}/gi, hasParam: false, defaultCase: 'AC', requiredConsistency: false, addSpace: true },
    // Party
    { type: 'partyFace', shortTag: 'pf', prePattern: /\\(PF)\[(\d+)\]/gi, postPattern: /\[{1,2}pf(\d+)\]{1,2}/gi, hasParam: true, defaultCase: 'PF', requiredConsistency: false },
    { type: 'partyClass', shortTag: 'pcl', prePattern: /\\(PC)\[(\d+)\]/gi, postPattern: /\[{1,2}pcl(\d+)\]{1,2}/gi, hasParam: true, defaultCase: 'PC', requiredConsistency: false },
    { type: 'partyNickname', shortTag: 'pnck', prePattern: /\\(PN)\[(\d+)\]/gi, postPattern: /\[{1,2}pnck(\d+)\]{1,2}/gi, hasParam: true, defaultCase: 'PN', requiredConsistency: false },
    // Names
    { type: 'className', shortTag: 'ncn', prePattern: /\\(NC)\[(\d+)\]/gi, postPattern: /\[{1,2}ncn(\d+)\]{1,2}/gi, hasParam: true, defaultCase: 'NC', requiredConsistency: false },
    { type: 'itemName', shortTag: 'ni', prePattern: /\\(NI)\[(\d+)\]/gi, postPattern: /\[{1,2}ni(\d+)\]{1,2}/gi, hasParam: true, defaultCase: 'NI', requiredConsistency: false },
    { type: 'weaponName', shortTag: 'nw', prePattern: /\\(NW)\[(\d+)\]/gi, postPattern: /\[{1,2}nw(\d+)\]{1,2}/gi, hasParam: true, defaultCase: 'NW', requiredConsistency: false },
    { type: 'armorName', shortTag: 'na', prePattern: /\\(NA)\[(\d+)\]/gi, postPattern: /\[{1,2}na(\d+)\]{1,2}/gi, hasParam: true, defaultCase: 'NA', requiredConsistency: false },
    { type: 'skillName', shortTag: 'ns', prePattern: /\\(NS)\[(\d+)\]/gi, postPattern: /\[{1,2}ns(\d+)\]{1,2}/gi, hasParam: true, defaultCase: 'NS', requiredConsistency: false },
    { type: 'stateName', shortTag: 'nt', prePattern: /\\(NT)\[(\d+)\]/gi, postPattern: /\[{1,2}nt(\d+)\]{1,2}/gi, hasParam: true, defaultCase: 'NT', requiredConsistency: false },
    // Icon Names
    { type: 'itemNameIcon', shortTag: 'ii', prePattern: /\\(II)\[(\d+)\]/gi, postPattern: /\[{1,2}ii(\d+)\]{1,2}/gi, hasParam: true, defaultCase: 'II', requiredConsistency: false },
    { type: 'weaponNameIcon', shortTag: 'iw', prePattern: /\\(IW)\[(\d+)\]/gi, postPattern: /\[{1,2}iw(\d+)\]{1,2}/gi, hasParam: true, defaultCase: 'IW', requiredConsistency: false },
    { type: 'armorNameIcon', shortTag: 'ia', prePattern: /\\(IA)\[(\d+)\]/gi, postPattern: /\[{1,2}ia(\d+)\]{1,2}/gi, hasParam: true, defaultCase: 'IA', requiredConsistency: false },
    { type: 'skillNameIcon', shortTag: 'is', prePattern: /\\(IS)\[(\d+)\]/gi, postPattern: /\[{1,2}is(\d+)\]{1,2}/gi, hasParam: true, defaultCase: 'IS', requiredConsistency: false },
    { type: 'stateNameIcon', shortTag: 'it', prePattern: /\\(IT)\[(\d+)\]/gi, postPattern: /\[{1,2}it(\d+)\]{1,2}/gi, hasParam: true, defaultCase: 'IT', requiredConsistency: false }
];

const DEFAULT_SYSTEM_PROMPT = 'You are translating scripts that contain [[tags]]. Altering contents or order of any such tags, removing or adding tags will break the script. DO NOT REMOVE OR ADD ANY TAGS. DO NOT CHANGE ORDER OF THE TAGS. EVER. PRESENT TAGS EXACTLY AS THEY ARE.Only translate the text, do not comment or add anything else. Do not bold, DO NOT FORMAT THE RESPONSE, RETURN IT ALL IN ONE LINE';

const typeToTag = { text: 'message', speaker: 'message', choice: 'message' };

// Unified AI engine supporting GPT4All and Open WebUI providers
export default class AIEngine extends BaseTranslationEngine {
    constructor(panel) {
        super(panel);
        this.provider = 'openwebui'; // 'gpt4all' | 'openwebui'
        this.host = 'http://localhost:8080';
        this.apiKey = '';
        this.selectedModel = '';
        this.models = [];
        this.loadingModels = false;
        this.modelsError = '';
        this.allowNewlineMismatch = false;
        this.invalidJsonHandlingStrategy = 'resendFirstHalf'; // 'resendFirstHalf' | 'askAIToFix' | 'useJsonFixer' | 'none'
        this.systemPrompt = DEFAULT_SYSTEM_PROMPT;
        // Allow calling external JSON fixer API (user-configurable)
        this.useJsonFixer = true;
        this._aiFixRecursionMaxDepth = 0;

        // Map panel-saved keys to internal fields for seamless restore via Object.assign
        Object.defineProperties(this, {
            aiProvider: {
                get: () => this.provider,
                set: (v) => { this.provider = v; }
            },
            aiHost: {
                get: () => this.host,
                set: (v) => { this.host = v; }
            },
            aiApiKey: {
                get: () => this.apiKey,
                set: (v) => { this.apiKey = v; }
            },
            aiSelectedModel: {
                get: () => this.selectedModel,
                set: (v) => { this.selectedModel = v; }
            },
            aiModels: {
                get: () => this.models,
                set: (v) => { this.models = Array.isArray(v) ? v : []; }
            },
            aiLoadingModels: {
                get: () => this.loadingModels,
                set: (v) => { this.loadingModels = !!v; }
            },
            aiModelsError: {
                get: () => this.modelsError,
                set: (v) => { this.modelsError = v || ''; }
            },
            aiAllowNewlineMismatch: {
                get: () => this.allowNewlineMismatch,
                set: (v) => { this.allowNewlineMismatch = !!v; }
            },
            aiInvalidJsonHandlingStrategy: {
                get: () => this.invalidJsonHandlingStrategy,
                set: (v) => { this.invalidJsonHandlingStrategy = v || 'resendFirstHalf'; }
            },
            aiSystemPrompt: {
                get: () => this.systemPrompt,
                set: (v) => { this.systemPrompt = v || DEFAULT_SYSTEM_PROMPT; }
            },
            aiFixRecursionMaxDepth: {
                get: () => this._aiFixRecursionMaxDepth,
                set: (v) => { this._aiFixRecursionMaxDepth = Number(v) || 0; }
            },
            userJsonFixer: {
                get: () => this.useJsonFixer,
                set: (v) => { this.useJsonFixer = !!v; }
            }
        });
    }

    getId() {
        // Keep legacy id to preserve saved settings/selection
        return 'gpt4all';
    }

    getName() {
        return 'AI Engine';
    }

    static getConfigTemplate() {
        return `
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

                       <v-checkbox
                           v-model="aiAllowNewlineMismatch"
                           label="Allow non-essential tag mismatches"
                           :disabled="!enabled"
                           @change="onChangeAiAllowNewlineMismatch"
                           class="mt-2"
                           hide-details
                       ></v-checkbox>
           
                       <v-select
                           v-model="aiInvalidJsonHandlingStrategy"
                           :items="aiInvalidJsonHandlingStrategyOptions"
                           label="Invalid JSON Handling Strategy"
                           outlined
                           dense
                           hide-details
                           :disabled="!enabled"
                           @change="onChangeAiInvalidJsonHandlingStrategy"
                           class="mt-2"
                       ></v-select>

                       <v-text-field
                           v-if="aiInvalidJsonHandlingStrategy === 'askAIToFix'"
                           v-model.number="aiFixRecursionMaxDepth"
                           label="AI fix recursion max depth (0 = infinite)"
                           outlined
                           dense
                           type="number"
                           min="0"
                           max="100"
                           hide-details
                           :disabled="!enabled"
                           @keydown.stop
                           @change="onChangeAiFixRecursionMaxDepth"
                           class="mt-2"
                       ></v-text-field>

                       <v-checkbox
                           v-model="useJsonFixer"
                           label="Allow calls to json fixer (external API, don't send sensitive data)"
                           :disabled="!enabled"
                           @change="onChangeUseJsonFixer"
                           class="mb-2"
                           hide-details
                       ></v-checkbox>
           
                       <v-textarea
                           v-model="aiSystemPrompt"
                           label="System prompt"
                           auto-grow
                           rows="3"
                           outlined
                           dense
                           hide-details
                           :disabled="!enabled"
                           @keydown.stop
                           @change="onChangeAiSystemPrompt"
                           class="mb-2"
                       ></v-textarea>
        `;
    }

    getConfigData() {
        return {
            aiProvider: this.provider,
            aiProviderOptions: [
                { text: 'Gpt4All', value: 'gpt4all' },
                { text: 'Open WebUI', value: 'openwebui' }
            ],
            aiHost: this.host,
            aiApiKey: this.apiKey,
            aiSelectedModel: this.selectedModel,
            aiModels: this.models,
            aiLoadingModels: this.loadingModels,
            aiModelsError: this.modelsError,
            aiAllowNewlineMismatch: this.allowNewlineMismatch,
            aiInvalidJsonHandlingStrategy: this.invalidJsonHandlingStrategy,
            aiSystemPrompt: this.systemPrompt,
            aiFixRecursionMaxDepth: this.aiFixRecursionMaxDepth,
            useJsonFixer: this.useJsonFixer
        };
    }

    isFullyConfigured() {
        // AI Engine is fully configured if a model is selected
        return !!(this.selectedModel && this.selectedModel.trim().length > 0);
    }

    getConfigMethods() {
        const self = this;
        const panel = this.panel;
        return {
            async fetchAiModels() {
                panel.aiLoadingModels = true;
                self.loadingModels = true;
                panel.aiModelsError = '';
                self.modelsError = '';

                try {
                    const host = (panel.aiHost || (panel.aiProvider === 'openwebui' ? 'http://localhost:8080' : 'http://localhost:4891')).replace(/\/$/, '');
                    const url = panel.aiProvider === 'openwebui' ? `${host}/api/models` : `${host}/v1/models`;
                    const headers = panel.aiProvider === 'openwebui' && panel.aiApiKey ? { Authorization: `Bearer ${panel.aiApiKey}` } : {};
                    const response = await axios.get(url, { headers });
                    const data = response && response.data;

                    if (data && Array.isArray(data.data)) {
                        const modelList = data.data.map(m => m.id || m.name || m).filter(Boolean);
                        panel.aiModels = modelList;
                        self.models = modelList;
                        console.log('[AIEngine] Fetched models:', modelList);
                    } else {
                        throw new Error('Invalid response format');
                    }
                } catch (error) {
                    console.error('[AIEngine] Failed to fetch models:', error.message);
                    panel.aiModelsError = 'Failed to fetch models';
                    self.modelsError = 'Failed to fetch models';
                } finally {
                    panel.aiLoadingModels = false;
                    self.loadingModels = false;
                }
            },
            onChangeAiProvider() {
                self.provider = panel.aiProvider;
                // Adjust default host per provider
                if (panel.aiProvider === 'openwebui' && (!panel.aiHost || panel.aiHost.includes('4891'))) {
                    panel.aiHost = 'http://localhost:8080';
                }
                if (panel.aiProvider === 'gpt4all' && (!panel.aiHost || panel.aiHost.includes('8080'))) {
                    panel.aiHost = 'http://localhost:4891';
                }
                self.host = panel.aiHost;
                self.apiKey = panel.aiApiKey || '';
                panel.aiModels = [];
                self.models = [];
                panel.aiSelectedModel = '';
                self.selectedModel = '';
                panel.aiModelsError = '';
                self.modelsError = '';
                panel.saveSettings();
            },
            onChangeAiHost() {
                self.host = panel.aiHost;
                panel.aiModels = [];
                self.models = [];
                panel.aiSelectedModel = '';
                self.selectedModel = '';
                panel.aiModelsError = '';
                self.modelsError = '';
                panel.saveSettings();
            },
            onChangeAiApiKey() {
                self.apiKey = panel.aiApiKey || '';
                panel.saveSettings();
            },
            onChangeAiModel() {
                self.selectedModel = panel.aiSelectedModel;
                panel.saveSettings();
            },
            onChangeAiAllowNewlineMismatch() {
                self.allowNewlineMismatch = panel.aiAllowNewlineMismatch;
                panel.saveSettings();
            },
            onChangeAiInvalidJsonHandlingStrategy() {
                self.invalidJsonHandlingStrategy = panel.aiInvalidJsonHandlingStrategy;
                panel.saveSettings();
            },
            onChangeAiSystemPrompt() {
                const next = panel.aiSystemPrompt || DEFAULT_SYSTEM_PROMPT;
                self.systemPrompt = next;
                panel.saveSettings();
            }
            ,
            onChangeAiFixRecursionMaxDepth() {
                self.aiFixRecursionMaxDepth = Number(panel.aiFixRecursionMaxDepth) || 0;
                panel.saveSettings();
            }
            ,
            onChangeUseJsonFixer() {
                self.useJsonFixer = !!panel.useJsonFixer;
                panel.saveSettings();
            }
        };
    }

    getLanguageName(code) {
        const map = {
            'ja': 'Japanese',
            'en': 'English',
            'es': 'Spanish',
            'fr': 'French',
            'de': 'German',
            'it': 'Italian',
            'pt': 'Portuguese',
            'ru': 'Russian',
            'ko': 'Korean',
            'zh-CN': 'Chinese Simplified',
            'zh-TW': 'Chinese Traditional',
            'pl': 'Polish',
            'auto': 'auto'
        };
        return map[code] || code;
    }

    buildNameHints(taggedText) {
        if (!taggedText || !this.panel.translationCache) {
            return '';
        }

        const hints = [];
        const prefix = `speaker:${this.panel.sourceLang}-${this.panel.targetLang}-`;

        for (const [key, value] of this.panel.translationCache.entries()) {
            if (!key || typeof key !== 'string' || !key.startsWith(prefix)) {
                continue;
            }
            const origWithPrefix = key.substring(prefix.length);
            const orig = origWithPrefix.startsWith('name_') ? origWithPrefix.substring(5) : origWithPrefix;
            if (!orig || typeof value !== 'string') {
                continue;
            }
            if (value.trim() === '' || value === orig) {
                continue;
            }
            if (taggedText.includes(orig)) {
                hints.push(`${orig} to ${value}`);
            }
        }

        return hints.length ? `Translate ${hints.join(', ')}.` : '';
    }

    preprocessTags(text) {
        if (!text || typeof text !== 'string') {
            return { text: text || '', tagCounts: {}, caseMap: [] };
        }

        let result = text;
        const tagCounts = {};
        const caseMap = [];

        // Process configured tags (with and without parameters)
        for (const config of TAG_CONFIGS) {
            const matches = result.match(config.prePattern) || [];
            tagCounts[config.type] = matches.length;

            if (config.hasParam) {
                result = result.replace(config.prePattern, (match, letter, num) => {
                    caseMap.push({ type: config.type, num, case: letter });
                    return `[[${config.shortTag}${num}]]`;
                });
            } else {
                result = result.replace(config.prePattern, (match, letter) => {
                    // For patterns that don't capture a letter (e.g., literal newlines), letter will be undefined
                    caseMap.push({ type: config.type, case: letter });
                    return `[[${config.shortTag}]]`;
                });
            }
        }

        return { text: result, tagCounts, caseMap };
    }

    postprocessTags(text, tagCounts, caseMap) {
        if (!text || typeof text !== 'string') {
            return { text: text || '', valid: false, expectedCounts: tagCounts, actualCounts: {} };
        }

        let result = text;
        const actualCounts = {};
        const caseLookup = {};

        // Build case lookup from caseMap
        if (Array.isArray(caseMap)) {
            for (const item of caseMap) {
                if (item.type === 'simpleN') {
                    if (!caseLookup[item.type]) {
                        caseLookup[item.type] = [];
                    }
                    caseLookup[item.type].push(item.case);
                } else if (item.hasOwnProperty('num')) {
                    // Item has numeric parameter
                    if (!caseLookup[item.type]) {
                        caseLookup[item.type] = {};
                    }
                    caseLookup[item.type][item.num] = item.case;
                } else {
                    // Item without parameter - store the case directly
                    caseLookup[item.type] = item.case;
                }
            }
        }

        // Process configured tags
        for (const config of TAG_CONFIGS) {
            const matches = result.match(config.postPattern) || [];
            actualCounts[config.type] = matches.length;

            if (config.hasParam) {
                result = result.replace(config.postPattern, (match, num) => {
                    const caseLookupForType = caseLookup[config.type] || {};
                    const originalCase = caseLookupForType[num] || config.defaultCase;
                    return `\\${originalCase}[${num}]`;
                });
            } else {
                // For non-param tags, track which occurrence we're replacing
                let replaceIndex = 0;
                result = result.replace(config.postPattern, (match) => {
                    // Simple newline tag should become an actual newline, not an escaped sequence
                    if (config.type === 'simpleN') {
                        const replacement = '\n';
                        replaceIndex++;
                        return config.addSpace ? `${replacement} ` : replacement;
                    }

                    let originalCase = caseLookup[config.type] || config.defaultCase;
                    // If originalCase is array (e.g., for simpleN), take element at current index
                    if (Array.isArray(originalCase)) {
                        originalCase = originalCase[replaceIndex] || originalCase[0] || config.defaultCase;
                    }
                    replaceIndex++;
                    const replacement = `\\${originalCase}`;
                    // Add space after tag if addSpace is true
                    return config.addSpace ? `${replacement} ` : replacement;
                });
            }
        }

        // Validate based on setting: if allowing non-essential mismatches, only compare required tags; else compare all
        let valid;
        if (this.allowNewlineMismatch) {
            const requiredTypes = TAG_CONFIGS.filter(c => c.requiredConsistency).map(c => c.type);
            valid = requiredTypes.every(type => actualCounts[type] === (tagCounts[type] || 0));
        } else {
            valid = Object.keys(tagCounts).every(key => actualCounts[key] === (tagCounts[key] || 0));
        }

        if (!valid) {
            console.warn('[AIEngine] Tag count mismatch:', {
                expected: tagCounts,
                actual: actualCounts
            });
        }

        return { text: result, valid, expectedCounts: tagCounts, actualCounts };
    }

    validateUnknownTags(rawText, originalPreprocessed) {
        // Extract all double square bracket tags from response
        const tagMatches = rawText.match(/\[{1,2}([^\]]+)\]{1,2}/gi) || [];

        for (const tagMatch of tagMatches) {
            // Check if this tag matches any known postPattern
            let isKnownTag = false;

            for (const config of TAG_CONFIGS) {
                if (config.postPattern.test(tagMatch)) {
                    isKnownTag = true;
                    break;
                }
            }

            // If tag is unknown, check if it was in the original preprocessed text
            if (!isKnownTag) {
                if (!originalPreprocessed.includes(tagMatch)) {
                    // Tag not in original = AI hallucination
                    return {
                        valid: false,
                        unknownTag: tagMatch,
                        reason: 'unknown tag'
                    };
                }
                // Tag was in original, so it's OK (maybe leftover from preprocessing)
            }
        }

        return { valid: true };
    }

    // Helpers for endpoints and headers
    getModelsUrl() {
        const host = (this.host || (this.provider === 'openwebui' ? 'http://localhost:8080' : 'http://localhost:4891')).replace(/\/$/, '');
        return this.provider === 'openwebui' ? `${host}/api/models` : `${host}/v1/models`;
    }

    getChatUrl() {
        const host = (this.host || (this.provider === 'openwebui' ? 'http://localhost:8080' : 'http://localhost:4891')).replace(/\/$/, '');
        return this.provider === 'openwebui' ? `${host}/api/chat/completions` : `${host}/v1/chat/completions`;
    }

    getAuthHeaders() {
        if (this.provider === 'openwebui' && this.apiKey) {
            return { Authorization: `Bearer ${this.apiKey}` };
        }
        return {};
    }

    async validateResponseLanguage(responseJson, targetName, sourceName) {
        // Validate if response is in target language using AI
        try {
            const validationPayload = {
                model: this.selectedModel,
                messages: [
                    {
                        "role": "system",
                        "content": `Is this translated to ${targetName}? Answer as JSON { "isTranslated": true } or { "isTranslated": false}. The text can contain ${sourceName} names and onomatopoeia and still be considered English. Do not comment, do not explain.`
                    },
                    {
                        "role": "user",
                        "content": responseJson
                    }
                ],
                response_format: { type: "json_object" }
            };

            const url = this.getChatUrl();
            const response = await axios.post(url, validationPayload, { headers: this.getAuthHeaders() });
            const data = response && response.data;

            if (!data || !data.choices || !data.choices[0]) {
                console.warn('[AIEngine] Validation returned empty response');
                return false;
            }

            const message = data.choices[0].message;
            let validationContent = message && typeof message === 'object' ? (message.content || '').trim() : '';

            if (!validationContent) {
                console.warn('[AIEngine] Validation returned no content');
                return false;
            }

            // Handle markdown code block format (```json ... ```)
            const jsonBlockMatch = validationContent.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonBlockMatch) {
                validationContent = jsonBlockMatch[1].trim();
                console.log('[AIEngine] Extracted JSON from markdown code block');
            }

            try {
                const validationResult = JSON.parse(validationContent);
                console.log('[AIEngine] Parsed validation result:', validationResult);
                const isValid = validationResult.isTranslated === true;
                console.log('[AIEngine] Validation result:', validationResult, 'isValid:', isValid);
                return isValid;
            } catch (parseError) {
                console.warn('[AIEngine] Failed to parse validation response:', validationContent);
                return false;
            }
        } catch (error) {
            console.error('[AIEngine] Validation error:', error.message);
            return false;
        }
    }

    async retryTranslationWithError(originalPayload, responseJson, targetName) {
        // Retry translation with error feedback
        try {
            const retryPayload = {
                ...originalPayload,
                messages: [
                    ...originalPayload.messages,
                    {
                        "role": "assistant",
                        "content": responseJson
                    },
                    {
                        "role": "user",
                        "content": `Wrong! This is not ${targetName}! Try again!`
                    }
                ],
                max_tokens: 10000,
                temperature: 0.7,
                frequency_penalty: 0,
                presence_penalty: 0,
                response_format: { type: "json_object" },
            };

            const url = this.getChatUrl();
            const response = await axios.post(url, retryPayload, { headers: this.getAuthHeaders() });
            const data = response && response.data;

            if (!data || !data.choices || !data.choices[0]) {
                console.warn('[AIEngine] Retry returned empty response');
                return null;
            }

            const message = data.choices[0].message;
            const asFlatString = (value) => {
                if (Array.isArray(value)) {
                    return value.map(v => typeof v === 'string' ? v : '').join('');
                }
                return typeof value === 'string' ? value : '';
            };

            const primaryContent = message && typeof message === 'object' ? asFlatString(message.content) : '';
            const fallbackContent = message && typeof message === 'object' ? asFlatString(message.reasoning_content) : '';
            const responseContent = primaryContent && primaryContent.trim() ? primaryContent : fallbackContent;

            if (!responseContent) {
                console.warn('[AIEngine] Retry returned no content');
                return null;
            }

            return responseContent;
        } catch (error) {
            console.error('[AIEngine] Retry error:', error.message);
            return null;
        }
    }

    async retryJsonParsing(originalContent, invalidJsonResponse, errorMessage, depth = 0) {
        // Retry with JSON parsing error feedback
        try {
            const retryPayload = {
                model: this.selectedModel,
                messages: [
                    {
                        "role": "system",
                        "content": "You fix translation jsons generated by LLM with malformed format. Only fix the json, do not comment or add anything else. Do not bold, DO NOT FORMAT THE RESPONSE, RETURN IT ALL IN ONE LINE"
                    },
                    {
                        "role": "user",
                        "content": "Fix broken translation json. Each message in translation json should be related to the same message key in original. \n Original: { \"message23\": \"はい\" } \n Broken Translation JSON: { \"message23: \"Yes\" } \n Error: Missing closing quote after message23 key"
                    },
                    {
                        "role": "assistant",
                        "content": "{ \"message23\": \"はい\" } { \"message23\": \"Yes\" }"
                    },
                    {
                        "role": "user",
                        "content": "Wrong. You've returned both original and translation. Only return the fixed translation json."
                    },
                    {
                        "role": "assistant",
                        "content": "{ \"message23\": \"Yes\" }"
                    },
                    {
                        "role": "user",
                        "content": `Good. Now fix broken translation json. Each message in translation json should be related to the same message key in original. \n Original: ${originalContent} \n Broken Translation JSON: ${invalidJsonResponse} \n Error: ${errorMessage}`
                    }
                ],
                max_tokens: 10000,
                temperature: 0.7,
                frequency_penalty: 0,
                presence_penalty: 0,
                response_format: { type: "json_object" },
            };

            const url = this.getChatUrl();
            const response = await axios.post(url, retryPayload, { headers: this.getAuthHeaders() });
            const data = response && response.data;

            if (!data || !data.choices || !data.choices[0]) {
                console.warn('[AIEngine] JSON parsing retry returned empty response');
                return null;
            }

            const message = data.choices[0].message;
            const asFlatString = (value) => {
                if (Array.isArray(value)) {
                    return value.map(v => typeof v === 'string' ? v : '').join('');
                }
                return typeof value === 'string' ? value : '';
            };

            const primaryContent = message && typeof message === 'object' ? asFlatString(message.content) : '';
            const fallbackContent = message && typeof message === 'object' ? asFlatString(message.reasoning_content) : '';
            const responseContent = primaryContent && primaryContent.trim() ? primaryContent : fallbackContent;

            if (!responseContent) {
                console.warn('[AIEngine] JSON parsing retry returned no content');
                return null;
            }

            console.log('[AIEngine] JSON parsing retry response:', responseContent, invalidJsonResponse);
            try {
                JSON.parse(responseContent);
            } catch (parseError) {
                const reachedDepthLimit = (this.aiFixRecursionMaxDepth > 0 && depth >= this.aiFixRecursionMaxDepth);
                if (responseContent === invalidJsonResponse || reachedDepthLimit) {
                    console.warn('[AIEngine] JSON parsing retry returned same invalid response or reached recursion depth, aborting further retries.');
                    return responseContent;
                }
                console.warn('[AIEngine] JSON parsing retry still invalid:', responseContent);
                return this.retryJsonParsing(originalContent, responseContent, parseError.message, depth + 1);
            }

            return responseContent;
        } catch (error) {
            console.error('[AIEngine] JSON parsing retry error:', error.message);
            return null;
        }
    }

    async resendFirstHalfOfItems(itemData, payload) {
        // Resend with first half of items (rounded up for odd numbers)
        try {
            const halfCount = Math.ceil(itemData.length / 2);
            console.log(`[AIEngine] Resending with first ${halfCount} items out of ${itemData.length}`);

            const firstHalfItems = itemData.slice(0, halfCount);

            // Build JSON map with first half items
            const jsonMap = {};
            firstHalfItems.forEach(item => {
                const shortTag = typeToTag[item.type] || item.type;
                const key = `${shortTag}${item.index}`;
                jsonMap[key] = item.preprocessed;
            });

            const content = JSON.stringify(jsonMap);

            // Keep all messages except the last one, then add new user message with half content
            const messages = payload.messages.slice(0, -1);
            messages.push({
                "role": "user",
                "content": `Try again with fewer items: ${content}`
            });

            // Create new payload keeping full conversation history
            const retryPayload = {
                ...payload,
                messages: messages
            };

            const url = this.getChatUrl();
            const response = await axios.post(url, retryPayload, { headers: this.getAuthHeaders() });
            const data = response && response.data;

            if (!data || !data.choices || !data.choices[0]) {
                console.warn('[AIEngine] Resend first half returned empty response');
                return null;
            }

            const message = data.choices[0].message;
            const asFlatString = (value) => {
                if (Array.isArray(value)) {
                    return value.map(v => typeof v === 'string' ? v : '').join('');
                }
                return typeof value === 'string' ? value : '';
            };

            const primaryContent = message && typeof message === 'object' ? asFlatString(message.content) : '';
            const fallbackContent = message && typeof message === 'object' ? asFlatString(message.reasoning_content) : '';
            const responseContent = primaryContent && primaryContent.trim() ? primaryContent : fallbackContent;

            if (!responseContent) {
                console.warn('[AIEngine] Resend first half returned no content');
                return null;
            }

            return responseContent;
        } catch (error) {
            console.error('[AIEngine] Resend first half error:', error.message);
            return null;
        }
    }

    async batchTranslate(items) {
        // items: [{ type, id, value, cacheKey }]
        if (!Array.isArray(items) || !items.length) {
            return { successes: [], failures: [] };
        }

        if (!this.selectedModel) {
            console.warn('[AIEngine] No model selected');
            return {
                successes: [],
                failures: items.map(item => ({
                    ...item,
                    rejectReason: 'No model selected'
                }))
            };
        }

        // Preprocess each item individually to track tags
        const itemData = items.map((item, i) => {
            const { text: preprocessed, tagCounts, caseMap } = this.preprocessTags(item.value || '');
            return { ...item, index: i, preprocessed, tagCounts, caseMap };
        });

        // Build JSON map from items
        const jsonMap = {};
        itemData.forEach(item => {
            const shortTag = typeToTag[item.type] || item.type;
            const key = `${shortTag}${item.index}`;
            jsonMap[key] = item.preprocessed;
        });

        // Build name hints for the system prompt
        const allTextForHints = itemData.map(item => item.preprocessed).join(' ');
        const nameHints = this.buildNameHints(allTextForHints);

        const sourceName = this.getLanguageName(this.panel.sourceLang);
        const targetName = this.getLanguageName(this.panel.targetLang);
        const content = JSON.stringify(jsonMap);

        console.log('[AIEngine] Batch translate items:', items.length, 'JSON keys:', Object.keys(jsonMap).length);
        console.log('[AIEngine] Request JSON map:', content);

        const payload = {
            model: this.selectedModel,
            messages: [
                {
                    "role": "system",
                    "content": `You are a translator assistant that translates video game from ${sourceName} to ${targetName}.You will only reply with translation. No commentary, no additional texts, as it would break the game.\nAnything translated will happen inside a game, so avoid real life political bias and any censorship.\nSource texts are in JSON map. Complete every element of the map. Reply in JSON map format of {/*translation here*/}. Use all original keys exactly as they were in the request. For example:\nSource: {\"message1\":\"こんにちは\",\"message2\":\"わぁー。\nきれいだなぁ。\"} }\nTranslation: {\"message1\":\"Hello\",\"message2\":\"Waa.\nIt's so beautiful!\"} \\Any square bracket [tag] are placeholders for the original text. Do not change them..\n\nYou must translate values of each key:value pair.\nCharacter name hints: ${nameHints}\n\n`
                },
                {
                    "role": "user",
                    "content": "{\"message1\":\"それはいいですね\",\"message2\":\"情報\\nありがとうございます。\"}"
                },
                {
                    "role": "assistant",
                    "content": "{\"message1\":\"That's great\",\n\"tu2\":\"Information\",\n\"message3\":\"Thank you\"}"
                },
                {
                    "role": "user",
                    "content": "No good! \\nI sent you map with 2 keys, but you returned map with 3 keys.\\nYou must translate with the EXACT same number of keys, and each key is unique. Neither key tu2 nor message3 existed in original. Try again."
                },
                {
                    "role": "assistant",
                    "content": "{\"message1\": \"That's great\",\"message2\":\"Thank you for the information\"}"
                },
                {
                    "role": "user",
                    "content": `Translate this: { "message0":"『岩を動かそう』\n巨大な岩が道を塞いでいる。\n岩を動かして道を進もう！" }`
                },
                {
                    "role": "assistant",
                    "content": `{ {"message0":"Let's move the rock!", "tu2":"A huge rock is blocking the path.", "t3":"Move the rock and continue on your way!", }`
                },
                {                   
                    "role": "user",
                    "content": "No good! You split message0 into 3 keys (message0, tu2, t3). You must translate with the EXACT same number of keys as original. Keep all lines inside the same key. Try again."
                },
                {
                    "role": "user",
                    "content": `Great! Now translate this: ${content}`
                }
            ],
            max_tokens: 10000,
            temperature: 0.01,
            frequency_penalty: 0,
            presence_penalty: 0,
            response_format: { type: "json_object" },
        };

        const url = this.getChatUrl();

        try {
            const response = await axios.post(url, payload, { headers: this.getAuthHeaders() });
            const data = response && response.data;

            if (!data || !data.choices || !data.choices[0]) {
                console.warn('[AIEngine] Batch returned empty response');
                return {
                    successes: [],
                    failures: items.map(item => ({ ...item, rejectReason: 'Empty response' }))
                };
            }

            const message = data.choices[0].message;
            console.log('[AIEngine] Response message:', message);

            const asFlatString = (value) => {
                if (Array.isArray(value)) {
                    return value.map(v => typeof v === 'string' ? v : '').join('');
                }
                return typeof value === 'string' ? value : '';
            };

            const primaryContent = message && typeof message === 'object' ? asFlatString(message.content) : '';
            const fallbackContent = message && typeof message === 'object' ? asFlatString(message.reasoning_content) : '';
            const responseContent = primaryContent && primaryContent.trim() ? primaryContent : fallbackContent;

            if (!message || !responseContent) {
                console.warn('[AIEngine] Batch returned no content');
                return {
                    successes: [],
                    failures: items.map(item => ({ ...item, rejectReason: 'No content' }))
                };
            }

            let rawTranslated = responseContent;
            console.log('[AIEngine] Response content:', rawTranslated);

            // Parse JSON response
            let translatedMap;
            try {
                translatedMap = JSON.parse(rawTranslated);
            } catch (parseError) {
                console.error('[AIEngine] Failed to parse JSON response:', parseError.message);
                console.log('[AIEngine] Invalid JSON Handling Strategy:', this.invalidJsonHandlingStrategy);

                let retryResponse = null;

                if (this.invalidJsonHandlingStrategy === 'resendFirstHalf' && itemData.length > 1) {
                    console.log('[AIEngine] Using resendFirstHalf strategy...');
                    retryResponse = await this.resendFirstHalfOfItems(itemData, payload);
                } else if (this.invalidJsonHandlingStrategy === 'askAIToFix' || this.invalidJsonHandlingStrategy === 'resendFirstHalf' && itemData.length === 1) {
                    console.log('[AIEngine] Using askAIToFix strategy (retryJsonParsing)...');
                        retryResponse = await this.retryJsonParsing(content, rawTranslated, parseError.message, 0);
                } else if(this.invalidJsonHandlingStrategy === 'useJsonFixer') {
                    console.log('[AIEngine] Using useJsonFixer strategy (useJsonFixerApi)...');
                    retryResponse = await this.useJsonFixerApi(rawTranslated);
                } if (this.invalidJsonHandlingStrategy === 'none') {
                    console.log('[AIEngine] Using none strategy - no retry');
                    retryResponse = null;
                }

                console.log('[AIEngine] Retry response for JSON parsing:', retryResponse);
                if (retryResponse) {
                    try {
                        translatedMap = JSON.parse(retryResponse);
                        console.log('[AIEngine] Retry response parsed successfully');
                        rawTranslated = retryResponse;
                    } catch (retryParseError) {
                        console.error('[AIEngine] Failed to parse retry JSON response:', retryParseError.message);
                        translatedMap = await this.useJsonFixerApi(retryResponse);
                        if (!translatedMap) {
                            return {
                                successes: [],
                                failures: items.map(item => ({ ...item, rejectReason: 'Invalid JSON response (retry also failed)' }))
                            };
                        }
                    }
                } else {
                    console.warn('[AIEngine] JSON parsing strategy returned null or failed');
                    return {
                        successes: [],
                        failures: items.map(item => ({ ...item, rejectReason: 'Invalid JSON response' }))
                    };
                }
            }

            // Validate response language
            console.log('[AIEngine] Validating response language...');
            const isValid = await this.validateResponseLanguage(rawTranslated, targetName, sourceName);

            if (!isValid) {
                console.log('[AIEngine] Validation failed, retrying with error feedback...');
                const retryResponse = await this.retryTranslationWithError(payload, rawTranslated, targetName);

                if (retryResponse) {
                    try {
                        const retryMap = JSON.parse(retryResponse);
                        console.log('[AIEngine] Retry response parsed successfully', retryMap);
                        rawTranslated = retryResponse;
                        translatedMap = retryMap;
                    } catch (retryParseError) {
                        console.error('[AIEngine] Failed to parse retry response:', retryParseError.message);
                        return {
                            successes: [],
                            failures: items.map(item => ({ ...item, rejectReason: 'Invalid retry JSON response' }))
                        };
                    }
                } else {
                    console.warn('[AIEngine] Retry translation failed');
                    return {
                        successes: [],
                        failures: items.map(item => ({ ...item, rejectReason: 'Translation validation failed and retry failed' }))
                    };
                }
            } else {
                console.log('[AIEngine] Validation passed');
            }

            const successes = [];
            const failures = [];

            // Process each item individually
            for (const itemD of itemData) {
                const shortTag = typeToTag[itemD.type] || itemD.type;
                const key = `${shortTag}${itemD.index}`;

                // Get translated value from JSON map
                const rawSlice = translatedMap[key];

                if (rawSlice === undefined || rawSlice === null) {
                    failures.push({
                        type: itemD.type,
                        id: itemD.id,
                        value: itemD.value,
                        cacheKey: itemD.cacheKey,
                        rejectReason: `Missing key "${key}" in response`
                    });
                    continue;
                }

                if (typeof rawSlice !== 'string') {
                    failures.push({
                        type: itemD.type,
                        id: itemD.id,
                        value: itemD.value,
                        cacheKey: itemD.cacheKey,
                        rejectReason: `Value for key "${key}" is not a string`
                    });
                    continue;
                }

                // Validate unknown tags before postprocessing
                const unknownTagCheck = this.validateUnknownTags(rawSlice, itemD.preprocessed);
                if (!unknownTagCheck.valid && (itemD.type === 'text' || itemD.type === 'choice')) {
                    failures.push({
                        type: itemD.type,
                        id: itemD.id,
                        value: itemD.value,
                        cacheKey: itemD.cacheKey,
                        rejectReason: `Unknown tag: ${unknownTagCheck.unknownTag}`
                    });
                    continue;
                }

                // Postprocess with tag tracking
                const { text: translated, valid, expectedCounts, actualCounts } = this.postprocessTags(rawSlice, itemD.tagCounts, itemD.caseMap);

                // Check if invalid due to tag mismatch
                if (!valid) {
                    failures.push({
                        type: itemD.type,
                        id: itemD.id,
                        value: itemD.value,
                        cacheKey: itemD.cacheKey,
                        rejectReason: "Tag count mismatch"
                    });
                    continue;
                }

                /* Temporary disable, other fixes shoould handle unchanged translations. Maybe.
                const isSame = translated.trim() === (itemD.value || '').trim();
                if (this.panel.sourceLang !== this.panel.targetLang && isSame) {
                    // Only report as translation unchanged if the string contains at least one letter (excluding tags)
                    // Remove all tags from value to check if it contains actual translatable text
                    let valueWithoutTags = itemD.value;
                    for (const config of TAG_CONFIGS) {
                        valueWithoutTags = valueWithoutTags.replace(config.prePattern, '');
                    }
                    const hasLetters = /[a-zA-Z]/i.test(valueWithoutTags);
                    if (hasLetters) {
                        failures.push({
                            type: itemD.type,
                            id: itemD.id,
                            value: itemD.value,
                            cacheKey: itemD.cacheKey,
                            rejectReason: 'Translation unchanged'
                        });
                        continue;
                    }
                    // If no letters (e.g., ".....", "!!!" or text with only tags), accept as valid translation
                }
                */

                // Clean and wrap text/choice types and descriptions
                let finalTranslated = translated;
                const isDescriptionType = (typeof itemD.type === 'string' && itemD.type.endsWith('_description'));
                if (itemD.type === 'text' || itemD.type === 'choice' || isDescriptionType) {
                    const maxWidth = isDescriptionType ? (this.panel.descriptionMaxLineWidth || this.panel.maxLineWidth) : this.panel.maxLineWidth;
                    finalTranslated = this.wrapText(this.cleanTranslatedText(translated), maxWidth);
                } else if (itemD.type === 'speaker') {
                    finalTranslated = this.normalizeSpeakerNameCase(translated);
                }

                successes.push({
                    type: itemD.type,
                    id: itemD.id,
                    value: itemD.value,
                    translated: finalTranslated,
                    cacheKey: itemD.cacheKey
                });
            }

            console.log(`[AIEngine] Batch complete: ${successes.length} successes, ${failures.length} failures`);
            return { successes, failures };

        } catch (error) {
            console.error('[AIEngine] Batch error:', error.message);
            return {
                successes: [],
                failures: items.map(item => ({
                    ...item,
                    rejectReason: `Exception: ${error.message}`
                }))
            };
        }
    }

    async useJsonFixerApi(invalidJson) {
        if (!this.useJsonFixer) {
            console.warn('[AIEngine] JSON fixer API calls disabled by user setting');
            return null;
        }
        const apiUrl = 'https://mangiucugna.pythonanywhere.com/api/repair-json';
        try {
            const response = await axios.post(apiUrl, { malformedJSON: invalidJson });
            if (response && response.data && response.data[0]) {
                console.log('[AIEngine] JSON fixed using external API');
                return response.data[0];
            } else {
                console.warn('[AIEngine] JSON fixer API returned invalid response');
                return null;
            }
        } catch (error) {
            console.error('[AIEngine] JSON fixer API error:', error.message);
            return null;
        }
    }

}
