import BaseTranslationEngine from './BaseTranslationEngine.js';

export default class LibreTranslateEngine extends BaseTranslationEngine {
    constructor(panel) {
        super(panel);
        this.host = 'http://127.0.0.1:5000';
        this.apiKey = '';
    }

    getId() {
        return 'libretranslate';
    }

    getName() {
        return 'LibreTranslate';
    }

    getConfigTemplate() {
        return `
            <v-text-field
                v-model="libreTranslateHost"
                label="LibreTranslate Host"
                outlined
                dense
                hide-details
                :disabled="!enabled"
                @change="onChangeLibreTranslateHost"
                class="mb-2">
            </v-text-field>
            <v-text-field
                v-model="libreTranslateApiKey"
                label="LibreTranslate API Key (optional)"
                outlined
                dense
                hide-details
                type="password"
                :disabled="!enabled"
                @change="onChangeLibreTranslateApiKey">
            </v-text-field>
        `;
    }

    getConfigData() {
        return {
            libreTranslateHost: this.host,
            libreTranslateApiKey: this.apiKey
        };
    }

    getConfigMethods() {
        const self = this;
        return {
            onChangeLibreTranslateHost() {
                self.host = this.libreTranslateHost;
                self.panel.translationCache.clear();
                self.panel.saveSettings();
            },
            onChangeLibreTranslateApiKey() {
                self.apiKey = this.libreTranslateApiKey;
                self.panel.saveSettings();
            }
        };
    }

    // HTML helpers
    escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    htmlizeText(str) {
        return this.escapeHtml(str || '').replace(/\n/g, '<br/>');
    }

    decodeHtml(html) {
        if (typeof document === 'undefined') {
            return String(html)
                .replace(/<br\s*\/?>(\r?\n)?/gi, '\n')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#039;/g, "'")
                .replace(/&amp;/g, '&');
        }
        const tmp = document.createElement('div');
        tmp.innerHTML = String(html).replace(/<br\s*\/?>(\r?\n)?/gi, '\n');
        return tmp.textContent || '';
    }

    async batchTranslate(items) {
        // items: [{ type, id, value, cacheKey }]
        if (!Array.isArray(items) || !items.length) {
            return { successes: [], failures: [] };
        }

        const typeToHtmlType = { text: 'm', speaker: 's', choice: 'c' };
        const htmlParts = items.map((item, idx) => {
            const htmlType = typeToHtmlType[item.type] || item.type;
            return `<span data-t="${htmlType}" data-i="${idx}">${this.htmlizeText(item.value || '')}</span>`;
        });
        const htmlPayload = `<div id="tof-batch">${htmlParts.join('')}</div>`;

        // Call LibreTranslate API directly
        let translatedHtml;
        try {
            const url = `${this.host}/translate`;
            const payload = {
                q: htmlPayload,
                source: this.panel.sourceLang === 'auto' ? 'auto' : this.panel.sourceLang,
                target: this.panel.targetLang,
                format: 'html'
            };
            
            if (this.apiKey && this.apiKey.trim()) {
                payload.api_key = this.apiKey.trim();
            }
            
            const response = await axios.post(url, payload);
            
            if (!response.data || !response.data.translatedText) {
                throw new Error('Invalid API response');
            }
            
            translatedHtml = response.data.translatedText;
        } catch (error) {
            console.error('[LibreTranslate] API error:', error);
            const failures = items.map(item => ({
                type: item.type,
                id: item.id,
                value: item.value,
                cacheKey: item.cacheKey,
                rejectReason: 'API error: ' + error.message
            }));
            return { successes: [], failures };
        }
        
        const html = translatedHtml && translatedHtml.trim().length ? translatedHtml : null;

        const successes = [];
        const failures = [];

        if (!html) {
            console.warn('[LibreTranslate] HTML batch returned empty/original, NOT caching');
            items.forEach(item => failures.push({
                type: item.type,
                id: item.id,
                value: item.value,
                cacheKey: item.cacheKey,
                rejectReason: 'Empty response'
            }));
            return { successes, failures };
        }

        let doc = null;
        if (typeof DOMParser !== 'undefined') {
            try { doc = new DOMParser().parseFromString(html, 'text/html'); } catch (_) { doc = null; }
        }

        // Process each item individually
        for (let idx = 0; idx < items.length; idx++) {
            const item = items[idx];
            const htmlType = typeToHtmlType[item.type] || item.type;
            let rawHtml = null;

            if (doc) {
                const node = doc.querySelector(`span[data-t="${htmlType}"][data-i="${idx}"]`);
                if (node) {
                    rawHtml = node.innerHTML;
                }
            } else {
                const regex = new RegExp(`<span[^>]*data-t=\\"${htmlType}\\"[^>]*data-i=\\"${idx}\\"[^>]*>([\\\\s\\\\S]*?)<\\\\/span>`, 'i');
                const m = regex.exec(html);
                if (m) {
                    rawHtml = m[1];
                }
            }

            if (rawHtml === null || rawHtml === undefined) {
                failures.push({
                    type: item.type,
                    id: item.id,
                    value: item.value,
                    cacheKey: item.cacheKey,
                    rejectReason: 'Missing slice in response'
                });
                continue;
            }

            const translated = this.decodeHtml(rawHtml);
            const isSame = translated.trim() === (item.value || '').trim();
            if (this.panel.sourceLang !== this.panel.targetLang && isSame) {
                failures.push({
                    type: item.type,
                    id: item.id,
                    value: item.value,
                    cacheKey: item.cacheKey,
                    rejectReason: 'Translation unchanged'
                });
                continue;
            }

            // Clean and wrap text/choice types
            let finalTranslated = translated;
            if (item.type === 'text' || item.type === 'choice') {
                finalTranslated = this.wrapText(this.cleanTranslatedText(translated), this.panel.maxLineWidth);
            } else if (item.type === 'speaker') {
                finalTranslated = this.normalizeSpeakerNameCase(translated);
            }

            successes.push({
                type: item.type,
                id: item.id,
                value: item.value,
                translated: finalTranslated,
                cacheKey: item.cacheKey
            });
        }

        console.log(`[LibreTranslate] Batch complete: ${successes.length} successes, ${failures.length} failures`);
        return { successes, failures };
    }
}
