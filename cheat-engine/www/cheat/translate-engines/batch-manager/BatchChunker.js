export class BatchChunker {
    static chunkItems(items, options = {}) {
        const safeItems = Array.isArray(items) ? items : [];
        const itemLimit = Math.max(1, Number(options.itemLimit) || 20);
        const charLimit = Math.max(1, Number(options.charLimit) || 1000);

        const batches = [];
        let currentBatch = [];
        let currentChars = 0;

        for (const item of safeItems) {
            const value = item && typeof item.value === 'string' ? item.value : '';
            const len = value.length;
            const wouldOverflowItems = currentBatch.length >= itemLimit;
            const wouldOverflowChars = currentChars > 0 && currentChars + len > charLimit;

            if (wouldOverflowItems || wouldOverflowChars) {
                if (currentBatch.length > 0) {
                    batches.push(currentBatch);
                }
                currentBatch = [];
                currentChars = 0;
            }

            currentBatch.push(item);
            currentChars += len;
        }

        if (currentBatch.length > 0) {
            batches.push(currentBatch);
        }

        return batches;
    }
}
