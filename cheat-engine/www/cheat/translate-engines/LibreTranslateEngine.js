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

    async batchTranslateMessagesAndSpeakers(entries, speakers) {
        const msgs = Array.isArray(entries) ? entries : [];
        const spks = Array.isArray(speakers) ? speakers : [];
        if (!msgs.length && !spks.length) {
            return;
        }

        const msgParts = msgs.map((e, i) => `<span data-t="m" data-i="${i}">${this.htmlizeText(e.text || '')}</span>`);
        const spkParts = spks.map((s, i) => `<span data-t="s" data-i="${i}">${this.htmlizeText(s || '')}</span>`);
        const htmlPayload = `<div id="tof-batch">${msgParts.join('')}${spkParts.join('')}</div>`;

        const translatedHtml = await this.translate(htmlPayload, this.panel.sourceLang, this.panel.targetLang, { format: 'html' });
        const html = translatedHtml && translatedHtml.trim().length ? translatedHtml : null;
        if (!html) {
            console.warn('[LibreTranslate] HTML batch returned empty/original, NOT caching');
            msgs.forEach(e => this.panel.failedTranslations.set(e.cacheKey, Date.now()));
            return;
        }

        let doc = null;
        if (typeof DOMParser !== 'undefined') {
            try { doc = new DOMParser().parseFromString(html, 'text/html'); } catch (_) { doc = null; }
        }

        const extractNodes = (type, count) => {
            const arr = new Array(count).fill(null);
            if (doc) {
                const nodes = doc.querySelectorAll(`span[data-t="${type}"]`);
                nodes.forEach(node => {
                    const idx = parseInt(node.getAttribute('data-i'), 10);
                    if (!isNaN(idx) && idx >= 0 && idx < count) {
                        arr[idx] = node.innerHTML;
                    }
                });
            } else {
                const regex = new RegExp(`<span[^>]*data-t=\\"${type}\\"[^>]*data-i=\\"(\\\\d+)\\"[^>]*>([\\\\s\\\\S]*?)<\\\\/span>`, 'gi');
                let m;
                while ((m = regex.exec(html)) !== null) {
                    const idx = parseInt(m[1], 10);
                    if (!isNaN(idx) && idx >= 0 && idx < count) {
                        arr[idx] = m[2];
                    }
                }
            }
            return arr;
        };

        const msgSlices = extractNodes('m', msgs.length);
        const spkSlices = extractNodes('s', spks.length);

        for (let i = 0; i < msgs.length; i++) {
            const entry = msgs[i];
            const rawHtml = msgSlices[i];
            if (rawHtml !== null && rawHtml !== undefined) {
                const raw = this.decodeHtml(rawHtml);
                const isSame = raw.trim() === (entry.text || '').trim();
                if (!(this.panel.sourceLang !== this.panel.targetLang && isSame)) {
                    const cleaned = this.wrapText(this.cleanTranslatedText(raw), this.panel.maxLineWidth);
                    this.setCacheValue(entry.cacheKey, cleaned);
                    continue;
                }
            }
            console.warn('[LibreTranslate] HTML batch message missing/unchanged slice, NOT caching');
            this.panel.failedTranslations.set(entry.cacheKey, Date.now());
        }

        for (let i = 0; i < spks.length; i++) {
            const orig = spks[i];
            const rawHtml = spkSlices[i];
            if (rawHtml !== null && rawHtml !== undefined) {
                const raw = this.decodeHtml(rawHtml);
                const key = this.getCacheKey(orig, 'speaker');
                const normalized = this.normalizeSpeakerNameCase(raw);
                this.setCacheValue(key, normalized);
            } else {
                console.warn('[LibreTranslate] HTML batch speaker missing slice, not caching');
            }
        }
    }

    async batchTranslateChoices(choices, choiceKey) {
        const list = Array.isArray(choices) ? choices : [];
        if (!list.length) {
            return { choices, complete: true };
        }

        // Check which individual choices are already cached
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
            console.log('[LibreTranslate] All choices found in cache');
            return { choices: cachedResults, complete: true };
        }

        const parts = needsTranslation.map((c, i) => `<span data-t="c" data-i="${i}">${this.htmlizeText(c || '')}</span>`);
        const htmlPayload = `<div id="tof-choices">${parts.join('')}</div>`;
        const translatedHtml = await this.translate(htmlPayload, this.panel.sourceLang, this.panel.targetLang, { format: 'html' });
        const html = translatedHtml && translatedHtml.trim().length ? translatedHtml : null;
        if (!html) {
            console.warn('[LibreTranslate] HTML choice batch returned empty/original, not caching');
            this.panel.failedTranslations.set(choiceKey, Date.now());
            return { choices: list, complete: false };
        }

        let doc = null;
        if (typeof DOMParser !== 'undefined') {
            try { doc = new DOMParser().parseFromString(html, 'text/html'); } catch(_) { doc = null; }
        }

        const translatedResults = new Array(needsTranslation.length).fill(null);
        if (doc) {
            doc.querySelectorAll('span[data-t="c"]').forEach(node => {
                const idx = parseInt(node.getAttribute('data-i'), 10);
                if (!isNaN(idx) && idx >= 0 && idx < translatedResults.length) {
                    translatedResults[idx] = node.innerHTML;
                }
            });
        } else {
            const regex = /<span[^>]*data-t=\"c\"[^>]*data-i=\"(\d+)\"[^>]*>([\s\S]*?)<\/span>/gi;
            let m;
            while ((m = regex.exec(html)) !== null) {
                const idx = parseInt(m[1], 10);
                if (!isNaN(idx) && idx >= 0 && idx < translatedResults.length) {
                    translatedResults[idx] = m[2];
                }
            }
        }

        // Merge cached and newly translated results
        const results = [...cachedResults];
        for (let i = 0; i < needsTranslationIndices.length; i++) {
            const originalIndex = needsTranslationIndices[i];
            results[originalIndex] = translatedResults[i];
        }

        const finalChoices = list.map((orig, idx) => {
            const rawHtml = results[idx];
            if (rawHtml !== null && rawHtml !== undefined) {
                const raw = this.decodeHtml(rawHtml);
                const isSame = raw.trim() === (orig || '').trim();
                if (!(this.panel.sourceLang !== this.panel.targetLang && isSame)) {
                    const cleaned = this.wrapText(this.cleanTranslatedText(raw), this.panel.maxLineWidth);
                    // Cache individual choice for reuse
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
            console.warn('[LibreTranslate] HTML choice batch incomplete, not caching');
            this.panel.failedTranslations.set(choiceKey, Date.now());
        }

        return { choices: finalChoices, complete };
    }
}
