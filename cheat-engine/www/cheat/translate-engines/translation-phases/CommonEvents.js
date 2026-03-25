import { MapEventsTranslationPhaseStrategy } from "./MapEvents.js";

export class CommonEventsTranslationKindStrategy extends MapEventsTranslationPhaseStrategy {
  getKind() {
    return "commonEvents";
  }

  async createEntries() {
    return [
      {
        strategy: this.configure(
          { events: [{ pages: window.$dataCommonEvents }] },
          -1,
          null,
          "translating common events",
        ),
        priorityMapId: 0,
      },
    ];
  }

  static countCommonEventsAmount(panel, commonEvents) {
    if (!Array.isArray(commonEvents)) {
      return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
    }

    const stats = this.countEventCommandListStats(
      panel,
      commonEvents.flatMap((entry) => (entry && entry.list) || []),
    );
    return {
      total: stats.totalStrings,
      left: stats.leftStrings,
      totalStrings: stats.totalStrings,
      leftStrings: stats.leftStrings,
    };
  }

  countAmountSync({ panel }) {
    return this.constructor.countCommonEventsAmount(
      panel,
      window.$dataCommonEvents,
    );
  }
}
