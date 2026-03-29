import { BaseTranslationPhaseStrategy } from "./BasePhase.js";

export class DirectItemsTranslationKindStrategy extends BaseTranslationPhaseStrategy {
  getKind() {
    return "directItems";
  }

  async createEntries({ request }) {
    const items = Array.isArray(request.items) ? request.items : [];

    return [
      {
        items,
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
}
