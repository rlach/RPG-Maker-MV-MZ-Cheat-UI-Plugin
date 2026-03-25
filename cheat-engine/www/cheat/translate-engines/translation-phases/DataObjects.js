import { BaseTranslationPhaseStrategy } from "./BasePhase.js";

export class DataObjectsTranslationPhaseStrategy extends BaseTranslationPhaseStrategy {
  static getInstance() {
    if (!DataObjectsTranslationPhaseStrategy._instance) {
      DataObjectsTranslationPhaseStrategy._instance =
        new DataObjectsTranslationPhaseStrategy();
    }
    return DataObjectsTranslationPhaseStrategy._instance;
  }

  constructor(dataObjects, fields, type) {
    super();
    this.configure(dataObjects, fields, type);
  }

  configure(dataObjects, fields, type) {
    this.dataObjects = Array.isArray(dataObjects) ? dataObjects : [];
    this.fields = Array.isArray(fields) ? fields : [];
    this.type = type || "data";
    return this;
  }

  static countAmountFromObjects(panel, dataObjects, fields, type) {
    const safeDataObjects = Array.isArray(dataObjects) ? dataObjects : [];
    const safeFields = Array.isArray(fields) ? fields : [];
    const safeType = type || "data";

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
          typeof originalValue !== "string" ||
          originalValue.trim() === ""
        ) {
          continue;
        }

        totalStrings += 1;
        const cacheKey = panel.getCacheKey(
          originalValue,
          `${safeType}_${field}`,
        );
        if (!panel.hasUsableCacheValue(cacheKey)) {
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

  static countAmountFromContainer(panel, container, fields, cachePrefix) {
    if (!Array.isArray(container)) {
      return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
    }

    const objects = [];
    for (let i = 1; i < container.length; i++) {
      objects.push(container[i]);
    }

    return DataObjectsTranslationPhaseStrategy.countAmountFromObjects(
      panel,
      objects,
      fields,
      cachePrefix,
    );
  }

  getTranslationPhaseLabel() {
    return `translating ${this.type}`;
  }

  getKind() {
    return "dataObjects";
  }

  async createEntries({ request }) {
    const dataObjects = Array.isArray(request.dataObjects)
      ? request.dataObjects
      : [];
    const fields = Array.isArray(request.fields) ? request.fields : [];
    const type = request.type || "data";
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

  countAmountSync({ request, panel }) {
    return DataObjectsTranslationPhaseStrategy.countAmountFromObjects(
      panel,
      request.dataObjects,
      request.fields,
      request.type,
    );
  }

  collectUntranslated({ panel }) {
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
        if (typeof value !== "string" || value.trim() === "") {
          continue;
        }

        if (!(field in dataObject._translateOriginal)) {
          dataObject._translateOriginal[field] = value;
        }

        const originalValue = dataObject._translateOriginal[field];
        const cacheKey = panel.getCacheKey(
          originalValue,
          `${this.type}_${field}`,
        );
        if (panel.hasUsableCacheValue(cacheKey)) {
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

  finalizePhase({ panel }) {
    for (const dataObject of this.dataObjects) {
      if (!dataObject || !dataObject._translateOriginal) {
        continue;
      }

      for (const field of this.fields) {
        const originalValue = dataObject._translateOriginal[field];
        if (typeof originalValue !== "string" || originalValue.trim() === "") {
          continue;
        }

        const cacheKey = panel.getCacheKey(
          originalValue,
          `${this.type}_${field}`,
        );
        if (panel.hasUsableCacheValue(cacheKey)) {
          dataObject[field] = panel.translationCache.get(cacheKey);
        }
      }
    }
  }
}
