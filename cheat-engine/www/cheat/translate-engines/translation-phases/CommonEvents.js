import { MapEvents } from './MapEvents.js';

export class CommonEvents extends MapEvents {
    getKind() {
        return 'commonEvents';
    }

    async createEntries() {
        return [
            {
                strategy: this.configure(
                    { events: [{ pages: window.$dataCommonEvents }] },
                    -1,
                    null,
                    'translating common events'
                ),
                priorityMapId: 0,
            },
        ];
    }

    static countCommonEventsAmount(runtime, commonEvents) {
        if (!Array.isArray(commonEvents)) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        const stats = this.countEventCommandListStats(
            runtime,
            commonEvents.flatMap((entry) => (entry && entry.list) || [])
        );
        return {
            total: stats.totalStrings,
            left: stats.leftStrings,
            totalStrings: stats.totalStrings,
            leftStrings: stats.leftStrings,
        };
    }

    countAmountSync({ runtime }) {
        return this.constructor.countCommonEventsAmount(runtime, window.$dataCommonEvents);
    }
}
