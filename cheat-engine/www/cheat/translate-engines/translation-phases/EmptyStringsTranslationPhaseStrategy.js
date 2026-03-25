import { BaseTranslationPhaseStrategy } from "./BaseTranslationPhaseStrategy.js";

export class EmptyStringsTranslationPhaseStrategy extends BaseTranslationPhaseStrategy {
  static getInstance() {
    if (!EmptyStringsTranslationPhaseStrategy._instance) {
      EmptyStringsTranslationPhaseStrategy._instance =
        new EmptyStringsTranslationPhaseStrategy();
    }
    return EmptyStringsTranslationPhaseStrategy._instance;
  }

  constructor(items = []) {
    super();
    this.configure(items);
  }

  configure(items = []) {
    this.items = Array.isArray(items) ? items : [];
    return this;
  }

  getTranslationPhaseLabel() {
    return "translate empty strings";
  }

  getKind() {
    return "emptyStrings";
  }

  async createEntries({ request }) {
    const items = Array.isArray(request.items) ? request.items : [];
    if (items.length === 0) {
      return [];
    }

    return [
      {
        strategy: this.configure(items),
        priorityMapId: 0,
      },
    ];
  }

  countAmountSync({ request }) {
    const items = Array.isArray(request.items) ? request.items : [];
    return {
      total: items.length,
      left: items.length,
      totalStrings: items.length,
      leftStrings: items.length,
    };
  }

  collectUntranslated() {
    return this.items;
  }

  shouldCacheFailuresAsEmpty() {
    return true;
  }
}
