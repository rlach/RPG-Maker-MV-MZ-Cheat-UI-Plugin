import { BasePhase } from './BasePhase.js';

export class DataObjects extends BasePhase {
    static getInstance() {
        if (!DataObjects._instance) {
            DataObjects._instance = new DataObjects();
        }
        return DataObjects._instance;
    }

    constructor(dataObjects, fields, type) {
        super();
        this.configure(dataObjects, fields, type);
    }

    configure(dataObjects, fields, type) {
        this.dataObjects = Array.isArray(dataObjects) ? dataObjects : [];
        this.fields = Array.isArray(fields) ? fields : [];
        this.type = type || 'data';
        return this;
    }

    static countAmountFromObjects(runtime, dataObjects, fields, type) {
        const safeDataObjects = Array.isArray(dataObjects) ? dataObjects : [];
        const safeFields = Array.isArray(fields) ? fields : [];
        const safeType = type || 'data';

        let total = 0;
        let left = 0;
        let totalStrings = 0;
        let leftStrings = 0;

        for (const item of safeDataObjects) {
            if (!item) {
                continue;
            }

            total += 1;
            let hasUntranslated = false;
            if (!item._translateOriginal) {
                item._translateOriginal = {};
            }

            for (const field of safeFields) {
                if (!(field in item._translateOriginal) && item[field]) {
                    item._translateOriginal[field] = item[field];
                }

                const originalValue = item._translateOriginal[field];
                if (
                    !originalValue ||
                    typeof originalValue !== 'string' ||
                    originalValue.trim() === ''
                ) {
                    continue;
                }

                totalStrings += 1;
                const cacheKey = runtime.getCacheKey(originalValue, `${safeType}_${field}`);
                if (!runtime.hasUsableCacheValue(cacheKey)) {
                    leftStrings += 1;
                    hasUntranslated = true;
                }
            }

            if (hasUntranslated) {
                left += 1;
            }
        }

        return { total, left, totalStrings, leftStrings };
    }

    static countAmountFromContainer(runtime, container, fields, cachePrefix) {
        if (!Array.isArray(container)) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        const objects = [];
        for (let i = 1; i < container.length; i++) {
            objects.push(container[i]);
        }

        return DataObjects.countAmountFromObjects(runtime, objects, fields, cachePrefix);
    }

    getTranslationPhaseLabel() {
        return `translating ${this.type}`;
    }

    getKind() {
        return 'dataObjects';
    }

    async createEntries({ request }) {
        const dataObjects = Array.isArray(request.dataObjects) ? request.dataObjects : [];
        const fields = Array.isArray(request.fields) ? request.fields : [];
        const type = request.type || 'data';
        if (dataObjects.length === 0 || fields.length === 0) {
            return [];
        }

        return [
            {
                strategy: this.configure(dataObjects, fields, type),
                priorityMapId: 0,
            },
        ];
    }

    countAmountSync({ request, runtime }) {
        return DataObjects.countAmountFromObjects(
            runtime,
            request.dataObjects,
            request.fields,
            request.type
        );
    }

    collectUntranslated({ runtime }) {
        if (!this.type || this.fields.length === 0) {
            return [];
        }

        const pendingItems = [];
        for (const dataObject of this.dataObjects) {
            if (!dataObject) {
                continue;
            }

            if (!dataObject._translateOriginal) {
                dataObject._translateOriginal = {};
            }

            for (const field of this.fields) {
                const value = dataObject[field];
                if (typeof value !== 'string' || value.trim() === '') {
                    continue;
                }

                if (!(field in dataObject._translateOriginal)) {
                    dataObject._translateOriginal[field] = value;
                }

                const originalValue = dataObject._translateOriginal[field];
                const cacheKey = runtime.getCacheKey(originalValue, `${this.type}_${field}`);
                if (runtime.hasUsableCacheValue(cacheKey)) {
                    continue;
                }

                pendingItems.push({
                    type: `${this.type}_${field}`,
                    id: `${this.type}_${dataObject.id}_${field}`,
                    value: originalValue,
                    cacheKey,
                    dataObject,
                    field,
                });
            }
        }

        return pendingItems;
    }

    findPropertyDescriptorInChain(target, field) {
        let current = target;
        while (current) {
            const descriptor = Object.getOwnPropertyDescriptor(current, field);
            if (descriptor) {
                return descriptor;
            }
            current = Object.getPrototypeOf(current);
        }

        return null;
    }

    canAssignField(target, field) {
        const ownDescriptor = Object.getOwnPropertyDescriptor(target, field);
        if (ownDescriptor) {
            return !!ownDescriptor.writable || typeof ownDescriptor.set === 'function';
        }

        const prototypeDescriptor = this.findPropertyDescriptorInChain(
            Object.getPrototypeOf(target),
            field
        );

        if (!prototypeDescriptor) {
            return true;
        }

        return !!prototypeDescriptor.writable || typeof prototypeDescriptor.set === 'function';
    }

    applyTranslatedFieldValue(dataObject, field, translatedValue) {
        const warningSet =
            this._readonlyFieldWarningSet || (this._readonlyFieldWarningSet = new Set());
        const warningKey = `${this.type}:${field}`;

        if (this.canAssignField(dataObject, field)) {
            try {
                dataObject[field] = translatedValue;
                return true;
            } catch (error) {
                // Fall back to backing field handling below.
            }
        }

        const backingField = `_${field}`;
        if (this.canAssignField(dataObject, backingField)) {
            try {
                dataObject[backingField] = translatedValue;
                return true;
            } catch (error) {
                // Fall through to warning.
            }
        }

        if (!warningSet.has(warningKey)) {
            warningSet.add(warningKey);
            console.warn(`[DataObjects] Skipped read-only field assignment for ${warningKey}`);
        }

        return false;
    }

    finalizePhase({ runtime }) {
        for (const dataObject of this.dataObjects) {
            if (!dataObject || !dataObject._translateOriginal) {
                continue;
            }

            for (const field of this.fields) {
                const originalValue = dataObject._translateOriginal[field];
                if (typeof originalValue !== 'string' || originalValue.trim() === '') {
                    continue;
                }

                const cacheKey = runtime.getCacheKey(originalValue, `${this.type}_${field}`);
                if (runtime.hasUsableCacheValue(cacheKey)) {
                    this.applyTranslatedFieldValue(
                        dataObject,
                        field,
                        runtime.translationCache.get(cacheKey)
                    );
                }
            }
        }
    }
}
