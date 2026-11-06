/** Separate per-game metadata, indexed by the full language-qualified cache key. */
export class TranslationSuspicionStore {
    constructor(fileSystem, filePath) {
        this.fileSystem = fileSystem;
        this.filePath = filePath;
        this.entries = {};
        this.dirty = false;
        if (fileSystem.existsSync(filePath)) {
            try {
                const data = JSON.parse(fileSystem.readFileSync(filePath, 'utf8'));
                if (data?.version === 1 && data.entries && typeof data.entries === 'object') {
                    for (const [key, record] of Object.entries(data.entries)) {
                        if (
                            !record ||
                            typeof record.translation !== 'string' ||
                            !Array.isArray(record.reasons)
                        )
                            continue;
                        this.entries[key] = {
                            translation: record.translation,
                            reasons: record.reasons.filter(
                                (reason) =>
                                    reason &&
                                    typeof reason.id === 'string' &&
                                    typeof reason.label === 'string' &&
                                    typeof reason.message === 'string'
                            ),
                        };
                    }
                }
            } catch (error) {
                console.warn('[TranslationSuspicionStore] Failed to read suspicions', error);
            }
        }
    }

    get(key, translation) {
        const record = this.entries[key];
        if (!record || (translation !== undefined && record.translation !== translation)) return [];
        return record.reasons;
    }

    set(key, reasons, translation = '') {
        const next =
            Array.isArray(reasons) && reasons.length ? { translation, reasons } : undefined;
        if (JSON.stringify(this.entries[key]) === JSON.stringify(next)) return;
        if (next) this.entries[key] = next;
        else delete this.entries[key];
        this.dirty = true;
    }

    save() {
        if (!this.dirty) return;
        const temporaryPath = this.filePath + '.tmp';
        this.fileSystem.writeFileSync(
            temporaryPath,
            JSON.stringify({ version: 1, entries: this.entries }, null, 2),
            'utf8'
        );
        this.fileSystem.renameSync(temporaryPath, this.filePath);
        this.dirty = false;
    }
}
