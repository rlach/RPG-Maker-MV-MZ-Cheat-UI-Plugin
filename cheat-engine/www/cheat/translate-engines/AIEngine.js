import BaseTranslationEngine from './BaseTranslationEngine.js';

const DEFAULT_SYSTEM_PROMPT = 'You are translating scripts that contain []. Altering contents or order of any such tags, removing or adding tags will break the script. DO NOT REMOVE OR ADD ANY TAGS. DO NOT CHANGE ORDER OF THE TAGS. EVER. PRESENT TAGS EXACTLY AS THEY ARE.Only translate the text, do not comment or add anything else. Do not bold, DO NOT FORMAT THE RESPONSE, RETURN IT ALL IN ONE LINE';

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
        this.systemPrompt = DEFAULT_SYSTEM_PROMPT;
        this.lastAiResponse = '';

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
            aiSystemPrompt: {
                get: () => this.systemPrompt,
                set: (v) => { this.systemPrompt = v || DEFAULT_SYSTEM_PROMPT; }
            },
            aiLastResponse: {
                get: () => this.lastAiResponse,
                set: (v) => { this.lastAiResponse = v || ''; }
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

    getConfigTemplate() {
        return `
            <v-select
                v-model="aiProvider"
                :items="aiProviderOptions"
                label="Provider"
                outlined
                dense
                hide-details
                :disabled="!enabled"
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
                @change="onChangeAiApiKey"
                class="mb-2"
            ></v-text-field>

            <div class="d-flex gap-2 mb-2">
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
                <div v-if="aiModelsError" class="text-caption error--text">{{aiModelsError}}</div>
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
                label="Allow newline mismatch"
                :disabled="!enabled"
                @change="onChangeAiAllowNewlineMismatch"
                class="mt-2"
                hide-details
            ></v-checkbox>
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
            aiSystemPrompt: this.systemPrompt,
            aiLastResponse: this.lastAiResponse
        };
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
                panel.translationCache.clear();
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
                panel.translationCache.clear();
                panel.saveSettings();
            },
            onChangeAiApiKey() {
                self.apiKey = panel.aiApiKey || '';
                panel.translationCache.clear();
                panel.saveSettings();
            },
            onChangeAiModel() {
                self.selectedModel = panel.aiSelectedModel;
                panel.translationCache.clear();
                panel.saveSettings();
            },
            onChangeAiAllowNewlineMismatch() {
                self.allowNewlineMismatch = panel.aiAllowNewlineMismatch;
                panel.saveSettings();
            },
            onChangeAiSystemPrompt() {
                const next = panel.aiSystemPrompt || DEFAULT_SYSTEM_PROMPT;
                self.systemPrompt = next;
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

    isNewlineOnlyMismatch(expected, actual) {
        // Check if the only difference between expected and actual tag counts is in simpleN (newlines)
        if (expected.nBracket !== actual.nBracket) return false;
        if (expected.cBracket !== actual.cBracket) return false;
        // Allow difference only in simpleN (newlines)
        return true;
    }

    preprocessTags(text) {
        if (!text || typeof text !== 'string') {
            return { text: text || '', tagCounts: {}, caseMap: [] };
        }

        let result = text;
        const tagCounts = {};
        const caseMap = [];

        const nBracketMatches = result.match(/\\[nN]\[(\d+)\]/g) || [];
        tagCounts.nBracket = nBracketMatches.length;
        result = result.replace(/\\([nN])\[(\d+)\]/g, (match, letter, num) => {
            caseMap.push({ type: 'nBracket', num, case: letter });
            return `[n${num}]`;
        });

        const cBracketMatches = result.match(/\\[cC]\[(\d+)\]/g) || [];
        tagCounts.cBracket = cBracketMatches.length;
        result = result.replace(/\\([cC])\[(\d+)\]/g, (match, letter, num) => {
            caseMap.push({ type: 'cBracket', num, case: letter });
            return `[c${num}]`;
        });

        // Treat \n, \N, literal newlines and ↵ symbol as newline markers
        const simpleNMatches = result.match(/\\[nN]|\n|↵/g) || [];
        tagCounts.simpleN = simpleNMatches.length;
        let simpleNIndex = 0;
        result = result.replace(/\\([nN])|\n|↵/g, (match, letter) => {
            const marker = letter || match; // Use letter for \n/\N, or the actual match (\n or ↵)
            caseMap.push({ type: 'simpleN', index: simpleNIndex++, case: marker });
            return '[n]';
        });

        return { text: result, tagCounts, caseMap };
    }

    postprocessTags(text, tagCounts, caseMap) {
        if (!text || typeof text !== 'string') {
            return { text: text || '', valid: false, expectedCounts: tagCounts, actualCounts: {} };
        }

        let result = text;
        const actualCounts = {};
        const caseLookup = {
            nBracket: {},
            cBracket: {},
            simpleN: []
        };

        if (Array.isArray(caseMap)) {
            for (const item of caseMap) {
                if (item.type === 'nBracket') {
                    caseLookup.nBracket[item.num] = item.case;
                } else if (item.type === 'cBracket') {
                    caseLookup.cBracket[item.num] = item.case;
                } else if (item.type === 'simpleN') {
                    caseLookup.simpleN.push(item.case);
                }
            }
        }

        const nBracketMatches = result.match(/\[n(\d+)\]/g) || [];
        actualCounts.nBracket = nBracketMatches.length;
        result = result.replace(/\[n(\d+)\]/g, (match, num) => {
            const originalCase = caseLookup.nBracket[num] || 'n';
            return `\\${originalCase}[${num}]`;
        });

        const cBracketMatches = result.match(/\[c(\d+)\]/g) || [];
        actualCounts.cBracket = cBracketMatches.length;
        result = result.replace(/\[c(\d+)\]/g, (match, num) => {
            const originalCase = caseLookup.cBracket[num] || 'c';
            return `\\${originalCase}[${num}]`;
        });

        const simpleNMatches = result.match(/\[n\]/g) || [];
        actualCounts.simpleN = simpleNMatches.length;
        let simpleNIndex = 0;
        result = result.replace(/\[n\]/g, () => {
            const originalCase = caseLookup.simpleN[simpleNIndex++] || 'n';
            // Restore literal newline, ↵ symbol, or \n/\N escape
            if (originalCase === '\n') return '\n';
            if (originalCase === '↵') return '↵';
            return `\\${originalCase}`;
        });

        const valid =
            actualCounts.nBracket === (tagCounts.nBracket || 0) &&
            actualCounts.cBracket === (tagCounts.cBracket || 0) &&
            actualCounts.simpleN === (tagCounts.simpleN || 0);

        if (!valid) {
            console.warn('[AIEngine] Tag count mismatch:', {
                expected: tagCounts,
                actual: actualCounts
            });
        }

        return { text: result, valid, expectedCounts: tagCounts, actualCounts };
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

        // Map type to short tag
        const typeToTag = { text: 't', speaker: 's', choice: 'ch' };
        
        // Build tagged batch text
        const taggedItems = itemData.map(item => {
            const shortTag = typeToTag[item.type] || item.type;
            return `[${shortTag}${item.index}]${item.preprocessed}[e${shortTag}${item.index}]X`;
        }).join('');
        
        const nameHints = this.buildNameHints(taggedItems);

        const sourceName = this.getLanguageName(this.panel.sourceLang);
        const targetName = this.getLanguageName(this.panel.targetLang);
        const prompt = (this.systemPrompt || DEFAULT_SYSTEM_PROMPT).trim() || DEFAULT_SYSTEM_PROMPT;
        const systemPrompt = `Translate from ${sourceName} to ${targetName}. ${prompt}:`;
        const content = systemPrompt + '[start]' + (nameHints ? nameHints + '\n' : '') + taggedItems + '[end]';
        
        console.log('[AIEngine] Batch translate items:', items.length, 'content length:', content.length);
        console.log('[AIEngine] Request content:', content);

        const payload = {
            model: this.selectedModel,
            messages: [{ role: 'user', content }],
            max_tokens: 10000,
            temperature: 0.01
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

            const rawTranslated = responseContent;
            this.lastAiResponse = rawTranslated || '';
            if (this.panel) {
                this.panel.aiLastResponse = this.lastAiResponse;
            }
            console.log('[AIEngine] Response content:', rawTranslated);
            const successes = [];
            const failures = [];

            // Map type to short tag
            const typeToTag = { text: 't', speaker: 's', choice: 'ch' };

            // Process each item individually
            for (const itemD of itemData) {
                const shortTag = typeToTag[itemD.type] || itemD.type;
                const startTag = `[${shortTag}${itemD.index}]`;
                const endTag = `[e${shortTag}${itemD.index}]`;
                const startPos = rawTranslated.indexOf(startTag);
                const endPos = rawTranslated.indexOf(endTag);
                
                if (startPos === -1 || endPos === -1 || endPos <= startPos) {
                    failures.push({
                        type: itemD.type,
                        id: itemD.id,
                        value: itemD.value,
                        cacheKey: itemD.cacheKey,
                        rejectReason: 'Missing slice in response'
                    });
                    continue;
                }

                const rawSlice = rawTranslated.substring(startPos + startTag.length, endPos);

                // Reject slices that still contain any opening/closing item tags (t/s/ch)
                if (/\[(?:e?t|e?s|e?ch)\d+\]/i.test(rawSlice)) {
                    failures.push({
                        type: itemD.type,
                        id: itemD.id,
                        value: itemD.value,
                        cacheKey: itemD.cacheKey,
                        rejectReason: 'Response contains leftover tags'
                    });
                    continue;
                }
                
                // Postprocess with tag tracking
                const { text: translated, valid, expectedCounts, actualCounts } = this.postprocessTags(rawSlice, itemD.tagCounts, itemD.caseMap);
                
                // Check if invalid due to tag mismatch
                if (!valid) {
                    // If allowNewlineMismatch is enabled and only newlines differ, accept it
                    if (this.allowNewlineMismatch && this.isNewlineOnlyMismatch(expectedCounts, actualCounts)) {
                        // Accept with newline mismatch - continue to check other validations
                        console.log('[AIEngine] Accepting translation with newline count mismatch:', {
                            expected: expectedCounts,
                            actual: actualCounts
                        });
                    } else {
                        failures.push({
                            type: itemD.type,
                            id: itemD.id,
                            value: itemD.value,
                            cacheKey: itemD.cacheKey,
                            rejectReason: `Tag count mismatch (expected: ${JSON.stringify(itemD.tagCounts)})`
                        });
                        continue;
                    }
                }

                const isSame = translated.trim() === (itemD.value || '').trim();
                if (this.panel.sourceLang !== this.panel.targetLang && isSame) {
                    failures.push({
                        type: itemD.type,
                        id: itemD.id,
                        value: itemD.value,
                        cacheKey: itemD.cacheKey,
                        rejectReason: 'Translation unchanged'
                    });
                    continue;
                }

                // Clean and wrap text/choice types
                let finalTranslated = translated;
                if (itemD.type === 'text' || itemD.type === 'choice') {
                    finalTranslated = this.wrapText(this.cleanTranslatedText(translated), this.panel.maxLineWidth);
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

}
