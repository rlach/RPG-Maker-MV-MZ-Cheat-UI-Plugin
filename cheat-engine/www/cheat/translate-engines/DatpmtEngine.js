import BaseTranslationEngine from './BaseTranslationEngine.js';

export default class DatpmtEngine extends BaseTranslationEngine {
    getId() {
        return 'datpmt';
    }

    getName() {
        return 'Datpmt';
    }

    async translate(text, sourceLang, targetLang, options = {}) {
        console.log(`[Datpmt] Translating: [${sourceLang} -> ${targetLang}]`, text.substring(0, 50));
        const url = 'https://api.datpmt.com/api/v2/dictionary/translate';
        const params = {
            string: text,
            from_lang: sourceLang || 'auto',
            to_lang: targetLang || 'en'
        };

        const response = await axios.get(url, { params });
        const data = response && response.data;

        const candidate = [
            data && data.data && data.data.translated_text,
            data && data.data && data.data.translate_string,
            data && data.data && data.data.translation,
            data && data.translation,
            data && data.translatedText,
            data && data.result,
            typeof data === 'string' ? data : null
        ].find(value => typeof value === 'string' && value.length > 0);

        if (candidate) {
            return candidate;
        }

        return text;
    }

    async batchTranslateMessagesAndSpeakers(entries, speakers) {
        const msgs = Array.isArray(entries) ? entries : [];
        const spks = Array.isArray(speakers) ? speakers : [];
        if (!msgs.length && !spks.length) {
            return;
        }

        const NL = '\uE000NL\uE000';
        const msgStart = (idx) => `[MSG${idx}]`;
        const msgEnd = (idx) => `[/MSG${idx}]`;
        const spkStart = (idx) => `[SPK${idx}]`;
        const spkEnd = (idx) => `[/SPK${idx}]`;

        const payloadParts = [];
        msgs.forEach((e, idx) => {
            const body = (e.text || '').replace(/\n/g, NL);
            payloadParts.push(`${msgStart(idx)}${body}${msgEnd(idx)}`);
        });
        spks.forEach((s, idx) => {
            const body = (s || '').replace(/\n/g, NL);
            payloadParts.push(`${spkStart(idx)}${body}${spkEnd(idx)}`);
        });

        const joined = payloadParts.join('');
        const translatedJoinedRaw = await this.translate(joined, this.panel.sourceLang, this.panel.targetLang, { skipWrap: false });
        const translatedJoined = translatedJoinedRaw === joined ? null : translatedJoinedRaw;
        
        if (!translatedJoined) {
            console.warn('[Datpmt] Batch returned original, not caching');
            msgs.forEach(e => this.panel.failedTranslations.set(e.cacheKey, Date.now()));
            return;
        }

        const msgResults = new Array(msgs.length).fill(null);
        const spkResults = new Array(spks.length).fill(null);

        if (translatedJoined) {
            for (let idx = 0; idx < msgs.length; idx++) {
                const st = msgStart(idx);
                const en = msgEnd(idx);
                const sPos = translatedJoined.indexOf(st);
                const ePos = translatedJoined.indexOf(en);
                if (sPos !== -1 && ePos !== -1 && ePos > sPos) {
                    const slice = translatedJoined.substring(sPos + st.length, ePos);
                    msgResults[idx] = slice.replace(new RegExp(NL, 'g'), '\n');
                }
            }
            for (let idx = 0; idx < spks.length; idx++) {
                const st = spkStart(idx);
                const en = spkEnd(idx);
                const sPos = translatedJoined.indexOf(st);
                const ePos = translatedJoined.indexOf(en);
                if (sPos !== -1 && ePos !== -1 && ePos > sPos) {
                    const slice = translatedJoined.substring(sPos + st.length, ePos);
                    spkResults[idx] = slice.replace(new RegExp(NL, 'g'), '\n');
                }
            }
        }

        // Cache messages
        for (let idx = 0; idx < msgs.length; idx++) {
            const entry = msgs[idx];
            const raw = msgResults[idx];
            const isSameAsOriginal = raw !== null && raw.trim() === (entry.text || '').trim();
            
            if (raw !== null && !(this.panel.sourceLang !== this.panel.targetLang && isSameAsOriginal)) {
                const cleaned = this.wrapText(this.cleanTranslatedText(raw), this.panel.maxLineWidth);
                this.setCacheValue(entry.cacheKey, cleaned);
            } else {
                console.warn('[Datpmt] Message slice missing, NOT caching');
                this.panel.failedTranslations.set(entry.cacheKey, Date.now());
            }
        }

        // Cache speakers
        for (let idx = 0; idx < spks.length; idx++) {
            const orig = spks[idx];
            const raw = spkResults[idx];
            if (raw !== null) {
                const normalized = this.normalizeSpeakerNameCase(raw);
                const key = this.getCacheKey(orig, 'speaker');
                this.setCacheValue(key, normalized);
            } else {
                console.warn('[Datpmt] Speaker slice missing, not caching');
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
            console.log('[Datpmt] All choices found in cache');
            return { choices: cachedResults, complete: true };
        }

        const NL = '\uE000NL\uE000';
        const startTokenFor = (idx) => `[CHO${idx}]`;
        const endTokenFor = (idx) => `[/CHO${idx}]`;

        const payloadParts = needsTranslation.map((c, idx) => {
            const body = (c || '').replace(/\n/g, NL);
            return `${startTokenFor(idx)}${body}${endTokenFor(idx)}`;
        });

        const joined = payloadParts.join('');
        const translatedJoinedRaw = await this.translate(joined, this.panel.sourceLang, this.panel.targetLang, { skipWrap: false });
        const translatedJoined = translatedJoinedRaw === joined ? null : translatedJoinedRaw;
        
        if (!translatedJoined) {
            console.warn('[Datpmt] Choice batch returned original, skipping cache');
            this.panel.failedTranslations.set(choiceKey, Date.now());
        }

        const translatedResults = new Array(needsTranslation.length).fill(null);
        if (translatedJoined) {
            for (let idx = 0; idx < needsTranslation.length; idx++) {
                const startToken = startTokenFor(idx);
                const endToken = endTokenFor(idx);
                const startPos = translatedJoined.indexOf(startToken);
                const endPos = translatedJoined.indexOf(endToken);
                if (startPos !== -1 && endPos !== -1 && endPos > startPos) {
                    const sliced = translatedJoined.substring(startPos + startToken.length, endPos);
                    translatedResults[idx] = sliced.replace(new RegExp(NL, 'g'), '\n');
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
            const raw = results[idx];
            const isSameAsOriginal = raw !== null && raw.trim() === (orig || '').trim();
            if (raw !== null && !(this.panel.sourceLang !== this.panel.targetLang && isSameAsOriginal)) {
                const cleaned = this.wrapText(this.cleanTranslatedText(raw), this.panel.maxLineWidth);
                const individualKey = this.getCacheKey(orig, 'choice');
                this.setCacheValue(individualKey, cleaned);
                return cleaned;
            }
            return orig;
        });

        const complete = results.every(r => r !== null);
        if (complete) {
            this.setCacheValue(choiceKey, finalChoices);
        } else {
            console.warn('[Datpmt] Choice batch incomplete, not caching');
            this.panel.failedTranslations.set(choiceKey, Date.now());
        }

        return { choices: finalChoices, complete };
    }
}
