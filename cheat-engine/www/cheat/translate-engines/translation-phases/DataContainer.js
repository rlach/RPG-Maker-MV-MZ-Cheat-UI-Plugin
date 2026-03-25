import { DataObjectsTranslationPhaseStrategy } from "./DataObjects.js";

export class DataContainerTranslationKindStrategy extends DataObjectsTranslationPhaseStrategy {
  constructor({ kind, getContainer, fields, cachePrefix }) {
    super([], fields, cachePrefix || "data");
    this.kind = kind;
    this.getContainer = getContainer;
    this.fields = Array.isArray(fields) ? fields : [];
    this.cachePrefix = cachePrefix || "data";
  }

  getKind() {
    return this.kind;
  }

  getTranslationPhaseLabel() {
    return `translating ${this.kind}`;
  }

  async createEntries({ request, panel }) {
    const container = this.getContainer && this.getContainer();
    if (!Array.isArray(container)) {
      return [];
    }

    const pendingObjects = [];
    for (let i = 1; i < container.length; i++) {
      const item = container[i];
      if (!item) {
        continue;
      }

      if (panel.hasUntranslatedFields(item, this.fields, this.cachePrefix)) {
        pendingObjects.push(item);
      }
    }

    if (pendingObjects.length === 0) {
      return [];
    }

    return [
      {
        strategy: this.configure(pendingObjects, this.fields, this.cachePrefix),
        priorityMapId: 0,
      },
    ];
  }

  countAmountSync({ panel }) {
    const container = this.getContainer && this.getContainer();
    return this.constructor.countAmountFromContainer(
      panel,
      container,
      this.fields,
      this.cachePrefix,
    );
  }
}
