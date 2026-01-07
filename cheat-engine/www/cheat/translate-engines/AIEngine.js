import BaseTranslationEngine from './BaseTranslationEngine.js';

// Unified AI engine supporting GPT4All and Open WebUI providers
export default class AIEngine extends BaseTranslationEngine {
    constructor(panel) {
        super(panel);
        this.provider = 'gpt4all'; // 'gpt4all' | 'openwebui'
        this.host = 'http://localhost:4891';
        this.apiKey = '';
        this.selectedModel = '';
        this.models = [];
        this.loadingModels = false;
        this.modelsError = '';

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
            aiModelsError: this.modelsError
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
        const prefix = `speaker:${this.panel.translationEngine}-${this.panel.sourceLang}-${this.panel.targetLang}-`;

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
            return { text: text || '', valid: false };
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

        return { text: result, valid };
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

    async batchTranslateMessagesAndSpeakers(entries, speakers) {
        const msgs = Array.isArray(entries) ? entries : [];
        const spks = Array.isArray(speakers) ? speakers : [];
        if (!msgs.length && !spks.length) {
            return;
        }

        // Preprocess each message/speaker individually to track tags per item
        const msgData = msgs.map((e, i) => {
            const { text: preprocessed, tagCounts, caseMap } = this.preprocessTags(e.text || '');
            return { index: i, entry: e, preprocessed, tagCounts, caseMap };
        });

        const spkData = spks.map((s, i) => {
            const { text: preprocessed, tagCounts, caseMap } = this.preprocessTags(s || '');
            return { index: i, original: s, preprocessed, tagCounts, caseMap };
        });

        // Build tagged batch text
        const msgTags = msgData.map(m => `[m${m.index}]${m.preprocessed}[em${m.index}]`).join('');
        const spkTags = spkData.map(s => `[s${s.index}]${s.preprocessed}[es${s.index}]`).join('');
        const taggedText = msgTags + spkTags;

        const nameHints = this.buildNameHints(taggedText);

        const sourceName = this.getLanguageName(this.panel.sourceLang);
        const targetName = this.getLanguageName(this.panel.targetLang);
        const systemPrompt = `Translate from ${sourceName} to ${targetName}. You are translating scripts that contain []. Altering contents or order of any such tags, removing or adding tags will break the script. DO NOT REMOVE OR ADD ANY TAGS. Only translate the text, do not comment or add anything else:`;
        console.log('[AIEngine] Batch preprocessed tagged text:', taggedText);
        const content =  systemPrompt + '[start]' + (nameHints ? nameHints + '\n' : '') + taggedText + '[end]';
        console.log('[AIEngine] Content to translate:', content);

        const payload = {
            model: this.selectedModel,
            messages: [
                { role: 'user', content: content }
            ],
            max_tokens: 10000,
            temperature: 0.01
        };

        const url = this.getChatUrl();
        console.log('[AIEngine] Batch via', this.provider, 'messages=', msgs.length, 'speakers=', spks.length);

        this.showSpinner();
        try {
            const response = await axios.post(url, payload, { headers: this.getAuthHeaders() });
            const data = response && response.data;
            if (!data || !data.choices || !data.choices[0]) {
                console.warn('[AIEngine] Batch returned empty response');
                msgs.forEach(e => this.panel.failedTranslations.set(e.cacheKey, Date.now()));
                return;
            }

            const message = data.choices[0].message;
            console.log('[AIEngine] Batch response received', message?.content);
            if (!message || !message.content) {
                console.warn('[AIEngine] Batch returned no content');
                msgs.forEach(e => this.panel.failedTranslations.set(e.cacheKey, Date.now()));
                return;
            }

            const rawTranslated = message.content;

            // Process each message individually
            for (const m of msgData) {
                const startTag = `[m${m.index}]`;
                const endTag = `[em${m.index}]`;
                const startPos = rawTranslated.indexOf(startTag);
                const endPos = rawTranslated.indexOf(endTag);
                
                if (startPos === -1 || endPos === -1 || endPos <= startPos) {
                    console.warn('[AIEngine] Batch message missing slice', m.index);
                    this.panel.failedTranslations.set(m.entry.cacheKey, Date.now());
                    continue;
                }

                const rawSlice = rawTranslated.substring(startPos + startTag.length, endPos);
                
                // Postprocess this specific message with its own tag tracking
                const { text: translated, valid } = this.postprocessTags(rawSlice, m.tagCounts, m.caseMap);
                
                if (!valid) {
                    console.warn('[AIEngine] Batch message tag mismatch', m.index, {
                        expected: m.tagCounts,
                        text: rawSlice.substring(0, 50)
                    });
                    this.panel.failedTranslations.set(m.entry.cacheKey, Date.now());
                    continue;
                }

                const isSame = translated.trim() === (m.entry.text || '').trim();
                if (this.panel.sourceLang !== this.panel.targetLang && isSame) {
                    console.warn('[AIEngine] Batch message unchanged', m.index);
                    this.panel.failedTranslations.set(m.entry.cacheKey, Date.now());
                    continue;
                }

                const cleaned = this.wrapText(this.cleanTranslatedText(translated), this.panel.maxLineWidth);
                this.setCacheValue(m.entry.cacheKey, cleaned);
            }

            // Process each speaker individually
            for (const s of spkData) {
                const startTag = `[s${s.index}]`;
                const endTag = `[es${s.index}]`;
                const startPos = rawTranslated.indexOf(startTag);
                const endPos = rawTranslated.indexOf(endTag);
                
                if (startPos === -1 || endPos === -1 || endPos <= startPos) {
                    console.warn('[AIEngine] Batch speaker missing slice', s.index);
                    continue;
                }

                const rawSlice = rawTranslated.substring(startPos + startTag.length, endPos);
                
                // Postprocess this specific speaker with its own tag tracking
                const { text: translated, valid } = this.postprocessTags(rawSlice, s.tagCounts, s.caseMap);
                
                if (!valid) {
                    console.warn('[AIEngine] Batch speaker tag mismatch', s.index);
                    continue;
                }

                const key = this.getCacheKey(s.original, 'speaker');
                const normalized = this.normalizeSpeakerNameCase(translated);
                this.setCacheValue(key, normalized);
            }
        } catch (error) {
            console.error('[AIEngine] Batch error:', error.message);
            msgs.forEach(e => this.panel.failedTranslations.set(e.cacheKey, Date.now()));
        } finally {
            this.hideSpinner();
        }
    }

    async batchTranslateChoices(choices, choiceKey) {
        const list = Array.isArray(choices) ? choices : [];
        if (!list.length) {
            return { choices, complete: true };
        }

        const cachedResults = new Array(list.length).fill(null);
        const needsTranslation = [];
        const needsTranslationIndices = [];
        for (let i = 0; i < list.length; i++) {
            const choiceText = list[i];
            const individualKey = this.getCacheKey(choiceText, 'choice');
            const cached = this.panel.translationCache.get(individualKey);
            if (cached) {
                cachedResults[i] = cached;
            } else {
                needsTranslation.push(choiceText);
                needsTranslationIndices.push(i);
            }
        }

        if (needsTranslation.length === 0) {
            return { choices: cachedResults, complete: true };
        }

        const taggedChoices = needsTranslation.map((c, i) => `[ch${i}]${c || ''}[ech${i}]`).join('');
        const { text: preprocessedTaggedChoices, tagCounts, caseMap } = this.preprocessTags(taggedChoices);

        const sourceName = this.getLanguageName(this.panel.sourceLang);
        const targetName = this.getLanguageName(this.panel.targetLang);
        const systemPrompt = `Translate from ${sourceName} to ${targetName}. Do not remove, add or alter any [] sequences. Only translate, do not comment:`;

        const payload = {
            model: this.selectedModel,
            messages: [
                { role: 'user', content: systemPrompt + '\n\n' + preprocessedTaggedChoices }
            ],
            max_tokens: 10000,
            temperature: 0.01
        };

        const url = this.getChatUrl();
        this.showSpinner();
        try {
            const response = await axios.post(url, payload, { headers: this.getAuthHeaders() });
            const data = response && response.data;
            if (!data || !data.choices || !data.choices[0]) {
                this.panel.failedTranslations.set(choiceKey, Date.now());
                return { choices: list, complete: false };
            }

            const message = data.choices[0].message;
            if (!message || !message.content) {
                this.panel.failedTranslations.set(choiceKey, Date.now());
                return { choices: list, complete: false };
            }

            const rawTranslated = message.content;
            const { text: translated, valid } = this.postprocessTags(rawTranslated, tagCounts, caseMap);
            if (!valid) {
                this.panel.failedTranslations.set(choiceKey, Date.now());
                return { choices: list, complete: false };
            }

            if (translated === taggedChoices) {
                this.panel.failedTranslations.set(choiceKey, Date.now());
                return { choices: list, complete: false };
            }

            const translatedResults = new Array(needsTranslation.length).fill(null);
            for (let i = 0; i < needsTranslation.length; i++) {
                const startTag = `[ch${i}]`;
                const endTag = `[ech${i}]`;
                const startPos = translated.indexOf(startTag);
                const endPos = translated.indexOf(endTag);
                if (startPos !== -1 && endPos !== -1 && endPos > startPos) {
                    translatedResults[i] = translated.substring(startPos + startTag.length, endPos);
                }
            }

            const results = [...cachedResults];
            for (let i = 0; i < needsTranslationIndices.length; i++) {
                const originalIndex = needsTranslationIndices[i];
                results[originalIndex] = translatedResults[i];
            }

            const finalChoices = list.map((orig, idx) => {
                const raw = results[idx];
                if (raw !== null && raw !== undefined) {
                    const isSame = raw.trim() === (orig || '').trim();
                    if (!(this.panel.sourceLang !== this.panel.targetLang && isSame)) {
                        const cleaned = this.wrapText(this.cleanTranslatedText(raw), this.panel.maxLineWidth);
                        const individualKey = this.getCacheKey(orig, 'choice');
                        this.setCacheValue(individualKey, cleaned);
                        return cleaned;
                    }
                }
                return orig;
            });

            const complete = results.every(r => r !== null && r !== undefined);
            if (complete) {
                this.setCacheValue(choiceKey, finalChoices);
            } else {
                this.panel.failedTranslations.set(choiceKey, Date.now());
            }

            return { choices: finalChoices, complete };
        } catch (error) {
            console.error('[AIEngine] Choice batch error:', error.message);
            this.panel.failedTranslations.set(choiceKey, Date.now());
            return { choices: list, complete: false };
        } finally {
            this.hideSpinner();
        }
    }
}
