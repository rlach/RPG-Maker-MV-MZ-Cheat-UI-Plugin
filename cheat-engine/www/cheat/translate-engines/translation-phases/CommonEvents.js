import { MapEvents } from './MapEvents.js';
import { parseJsonSafely } from '../plugins/translators/TranslatorHelpers.js';

export class CommonEvents extends MapEvents {
    getKind() {
        return 'commonEvents';
    }

    async createEntries() {
        // Display plugins may expand actor references in the live event lists.
        // Batch keys must still match the authored command text used at runtime.
        this.sourcePromise ??= (async () => {
            const response = await fetch('data/CommonEvents.json');
            if (!response.ok) throw new Error('Cannot read original common events');
            const events = parseJsonSafely(await response.text());
            if (!Array.isArray(events)) throw new Error('Invalid original common events');
            this.sourceCommonEvents = events;
            return events;
        })().catch((error) => {
            this.sourcePromise = null;
            throw error;
        });
        const commonEvents = await this.sourcePromise;
        return [
            {
                strategy: this.configure(
                    { events: [{ pages: commonEvents }] },
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
        return this.constructor.countCommonEventsAmount(
            runtime,
            this.sourceCommonEvents || window.$dataCommonEvents
        );
    }
}
