/** Estimate remaining requests by cache identity, not by overlapping phase lists. */
export class QueueWorkEstimate {
    constructor(keyForItem, countChars) {
        this.keyForItem = keyForItem;
        this.countChars = countChars;
        this.entries = new Map();
        this.processedChars = 0;
    }

    setItems(entry, items) {
        this.entries.set(
            entry,
            new Map((items || []).map((item) => [this.keyForItem(item), item]))
        );
    }

    removeEntry(entry) {
        this.entries.delete(entry);
    }

    completeBatch(entry, batch, successes) {
        this.processedChars += this.countChars(batch);
        const successfulKeys = new Set(successes.map(this.keyForItem));
        const pending = this.entries.get(entry);
        for (const item of batch) pending?.delete(this.keyForItem(item));
        // Later phases will skip usable cache values, including the final
        // cache-empty sweep whose startup snapshot may contain the entire game.
        for (const items of this.entries.values())
            for (const key of successfulKeys) items.delete(key);
        for (const [candidate, items] of this.entries) {
            if (
                candidate.kind !== 'cacheEmptyStrings' &&
                !(candidate === entry && candidate.shouldRepeat)
            )
                continue;
            for (const item of batch) {
                const key = this.keyForItem(item);
                if (!successfulKeys.has(key)) items.set(key, item);
            }
        }
    }

    get totalChars() {
        const unique = new Map();
        for (const items of this.entries.values())
            for (const [key, item] of items) unique.set(key, item);
        return this.processedChars + this.countChars([...unique.values()]);
    }
}
