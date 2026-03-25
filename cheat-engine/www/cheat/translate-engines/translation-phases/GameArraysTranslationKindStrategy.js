export class GameArraysTranslationKindStrategy {
  getKind() {
    return "gameArrays";
  }

  async createEntries({ panel }) {
    return [
      {
        execute: async () => {
          const batchResult = await panel.translateGameArrays({
            backgroundJob: true,
            progressLabel: "translating arrays",
            isPhase: true,
            showSummary: false,
          });
          return {
            successes: Array(
              Math.max(0, Number(batchResult.successCount) || 0),
            ).fill({}),
            failures: Array(
              Math.max(0, Number(batchResult.failureCount) || 0),
            ).fill({}),
            stats: batchResult.stats || null,
            summary: batchResult.summary || null,
          };
        },
        priorityMapId: 0,
      },
    ];
  }

  countAmountSync({ panel }) {
    if (typeof panel.countGameArraysStats === "function") {
      return panel.countGameArraysStats();
    }
    return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
  }
}
