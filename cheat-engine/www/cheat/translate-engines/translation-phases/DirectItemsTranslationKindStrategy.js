export class DirectItemsTranslationKindStrategy {
  getKind() {
    return "directItems";
  }

  async createEntries({ request }) {
    const items = Array.isArray(request.items) ? request.items : [];
    const phaseOptions = {
      translationPhaseLabel: request.translationPhaseLabel,
      stepLabel: request.stepLabel,
      backgroundJob: !!request.backgroundJob,
      itemLimit: request.itemLimit,
      charLimit: request.charLimit,
      showSummary: request.showSummary,
      isPhase: !!request.isPhase,
      onTranslationBatchCompleted: request.onTranslationBatchCompleted,
    };

    return [
      {
        items,
        options: {
          ...phaseOptions,
          showSummary: false,
        },
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
