import { BasePhase } from "./BasePhase.js";

export class OtherStrings extends BasePhase {
  static _instance = /** @type {OtherStrings | null} */ (null);

  static FIELD_DEFINITIONS = [
    { id: "gameTitle", path: ["gameTitle"] },
    { id: "airshipCharacterName", path: ["airship", "characterName"] },
    { id: "boatCharacterName", path: ["boat", "characterName"] },
    { id: "shipCharacterName", path: ["ship", "characterName"] },
    { id: "currencyUnit", path: ["currencyUnit"] },
  ];

  static getInstance() {
    if (!OtherStrings._instance) {
      OtherStrings._instance = new OtherStrings();
    }
    return OtherStrings._instance;
  }

  getTranslationPhaseLabel() {
    return "translating other strings";
  }

  getKind() {
    return "otherStrings";
  }

  getSystemData() {
    if (typeof $dataSystem === "undefined" || !$dataSystem || typeof $dataSystem !== "object") {
      return null;
    }

    return $dataSystem;
  }

  ensureOriginalValuesStore(dataSystem) {
    if (
      !dataSystem._translationOriginalOtherStrings ||
      typeof dataSystem._translationOriginalOtherStrings !== "object"
    ) {
      dataSystem._translationOriginalOtherStrings = {};
    }

    return dataSystem._translationOriginalOtherStrings;
  }

  getValueByPath(root, path) {
    let current = root;
    for (const segment of path) {
      if (!current || typeof current !== "object") {
        return undefined;
      }

      current = current[segment];
    }

    return current;
  }

  setValueByPath(root, path, value) {
    if (!root || typeof root !== "object" || !Array.isArray(path) || !path.length) {
      return false;
    }

    let current = root;
    for (let i = 0; i < path.length - 1; i++) {
      const segment = path[i];
      if (!current[segment] || typeof current[segment] !== "object") {
        return false;
      }

      current = current[segment];
    }

    const leafKey = [...path].pop();
    if (leafKey === undefined) {
      return false;
    }
    current[leafKey] = value;
    return true;
  }

  getOriginalFieldValue(field) {
    const dataSystem = this.getSystemData();
    if (!dataSystem) {
      return "";
    }

    const currentValue = this.getValueByPath(dataSystem, field.path);
    if (typeof currentValue !== "string") {
      return "";
    }

    const originals = this.ensureOriginalValuesStore(dataSystem);
    if (typeof originals[field.id] !== "string") {
      originals[field.id] = currentValue || "";
    }

    return originals[field.id] || "";
  }

  getFieldCacheKey(panel, source) {
    if (!panel || typeof panel.getCacheKey !== "function") {
      return null;
    }

    if (!source || source.trim() === "") {
      return null;
    }

    return panel.getCacheKey(source, "other");
  }

  buildPendingItems({ panel }) {
    const pending = [];

    for (const field of OtherStrings.FIELD_DEFINITIONS) {
      const source = this.getOriginalFieldValue(field);
      if (!source || source.trim() === "") {
        continue;
      }

      const cacheKey = this.getFieldCacheKey(panel, source);
      if (cacheKey && panel?.hasUsableCacheValue(cacheKey)) {
        continue;
      }

      pending.push({
        type: "other",
        id: `other_${field.id}`,
        value: source,
        cacheKey,
        fieldId: field.id,
      });
    }

    return pending;
  }

  applyTranslatedToField(fieldId, translatedValue) {
    if (typeof translatedValue !== "string") {
      return false;
    }

    const field = OtherStrings.FIELD_DEFINITIONS.find((entry) => entry.id === fieldId);
    if (!field) {
      return false;
    }

    const dataSystem = this.getSystemData();
    if (!dataSystem) {
      return false;
    }

    return this.setValueByPath(dataSystem, field.path, translatedValue);
  }

  applyCachedDataForField({ panel, field }) {
    const source = this.getOriginalFieldValue(field);
    if (!source || source.trim() === "") {
      return false;
    }

    const cacheKey = this.getFieldCacheKey(panel, source);
    if (!cacheKey || !panel.hasUsableCacheValue(cacheKey)) {
      return false;
    }

    const translated = panel.translationCache.get(cacheKey);
    if (typeof translated !== "string") {
      return false;
    }

    return this.applyTranslatedToField(field.id, translated);
  }

  getTitleOriginalValue() {
    return this.getOriginalFieldValue(OtherStrings.FIELD_DEFINITIONS[0]);
  }

  getTitleCacheKey(panel) {
    const source = this.getTitleOriginalValue();
    return this.getFieldCacheKey(panel, source);
  }

  getTranslatableFieldsCount({ panel }) {
    const pending = this.buildPendingItems({ panel });
    let total = 0;
    for (const field of OtherStrings.FIELD_DEFINITIONS) {
      const source = this.getOriginalFieldValue(field);
      if (source && source.trim() !== "") {
        total += 1;
      }
    }

    return { total, left: pending.length };
  }

  async createEntries() {
    return [
      {
        strategy: this,
        priorityMapId: 0,
      },
    ];
  }

  countAmountSync({ panel }) {
    const counts = this.getTranslatableFieldsCount({ panel });

    return {
      total: counts.total,
      left: counts.left,
      totalStrings: counts.total,
      leftStrings: counts.left,
    };
  }

  collectUntranslated({ panel }) {
    return this.buildPendingItems({ panel });
  }

  setData({ panel, successes, failures, pendingItems }) {
    super.setData({ panel, successes, failures });

    const fieldIdsByCacheKey = new Map();
    for (const item of pendingItems || []) {
      if (!item?.cacheKey || !item?.fieldId) {
        continue;
      }

      const existing = fieldIdsByCacheKey.get(item.cacheKey) || [];
      existing.push(item.fieldId);
      fieldIdsByCacheKey.set(item.cacheKey, existing);
    }

    for (const success of successes || []) {
      if (!success?.cacheKey) {
        continue;
      }

      const fieldIds = fieldIdsByCacheKey.get(success.cacheKey) || [];
      for (const fieldId of fieldIds) {
        this.applyTranslatedToField(fieldId, success.translated);
      }
    }
  }

  applyDataOnLifecycle(context = {}) {
    const { panel } = context;
    if (!panel || !this.getSystemData()) {
      return false;
    }

    let appliedAny = false;
    for (const field of OtherStrings.FIELD_DEFINITIONS) {
      appliedAny = this.applyCachedDataForField({ panel, field }) || appliedAny;
    }

    return appliedAny;
  }
}