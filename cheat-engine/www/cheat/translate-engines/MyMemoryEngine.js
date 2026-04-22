import BaseTranslationEngine from './BaseTranslationEngine.js';

export default class MyMemoryEngine extends BaseTranslationEngine {
    getId() {
        return 'mymemory';
    }

    getName() {
        return 'MyMemory';
    }

    async batchTranslate(items) {
        // items: [{ type, id, value, cacheKey }]
        if (!Array.isArray(items) || !items.length) {
            return { successes: [], failures: [] };
        }

        const NL = '\uE000NL\uE000';
        const typeToTag = {
            text: 't',
            message: 't',
            message_portrait: 't',
            speaker: 's',
            choice: 'ch',
        };

        // Map type to short tag
        const payloadParts = items.map((item, idx) => {
            const shortTag = typeToTag[item.type] || item.type;
            const body = (item.value || '').replace(/\n/g, NL);
            return `[${shortTag}${idx}]${body}[e${shortTag}${idx}]`;
        });

        const joined = payloadParts.join('');

        // Call MyMemory API directly (CORRECT endpoint from old panel)
        let translatedJoinedRaw;
        try {
            const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(joined)}&langpair=${this.panel.sourceLang}|${this.panel.targetLang}`;
            const response = await axios.get(url);

            if (
                !response.data ||
                !response.data.responseData ||
                !response.data.responseData.translatedText
            ) {
                throw new Error('Invalid API response');
            }

            translatedJoinedRaw = response.data.responseData.translatedText;
        } catch (error) {
            console.error('[MyMemory] API error:', error);
            const failures = items.map((item) => ({
                type: item.type,
                id: item.id,
                value: item.value,
                cacheKey: item.cacheKey,
                rejectReason: 'API error: ' + error.message,
            }));
            return { successes: [], failures };
        }

        const translatedJoined = translatedJoinedRaw === joined ? null : translatedJoinedRaw;

        const successes = [];
        const failures = [];

        if (!translatedJoined) {
            console.warn('[MyMemory] Batch returned original, not caching');
            items.forEach((item) =>
                failures.push({
                    type: item.type,
                    id: item.id,
                    value: item.value,
                    cacheKey: item.cacheKey,
                    rejectReason: 'Translation unchanged',
                })
            );
            return { successes, failures };
        }

        // Process each item individually
        for (let idx = 0; idx < items.length; idx++) {
            const item = items[idx];
            const shortTag = typeToTag[item.type] || item.type;
            const startTag = `[${shortTag}${idx}]`;
            const endTag = `[e${shortTag}${idx}]`;
            const startPos = translatedJoined.indexOf(startTag);
            const endPos = translatedJoined.indexOf(endTag);

            if (startPos === -1 || endPos === -1 || endPos <= startPos) {
                failures.push({
                    type: item.type,
                    id: item.id,
                    value: item.value,
                    cacheKey: item.cacheKey,
                    rejectReason: 'Missing slice in response',
                });
                continue;
            }

            const rawSlice = translatedJoined.substring(startPos + startTag.length, endPos);
            const translated = rawSlice.replace(new RegExp(NL, 'g'), '\n');

            const isSame = translated.trim() === (item.value || '').trim();
            if (this.panel.sourceLang !== this.panel.targetLang && isSame) {
                failures.push({
                    type: item.type,
                    id: item.id,
                    value: item.value,
                    cacheKey: item.cacheKey,
                    rejectReason: 'Translation unchanged',
                });
                continue;
            }

            const finalTranslated = this.postprocessTranslatedItem(item, translated);

            successes.push({
                type: item.type,
                id: item.id,
                value: item.value,
                translated: finalTranslated,
                cacheKey: item.cacheKey,
            });
        }
        return { successes, failures };
    }
}
