import { BasePhase } from './BasePhase.js';

export class EmptyStrings extends BasePhase {
    static getInstance() {
        if (!EmptyStrings._instance) {
            EmptyStrings._instance = new EmptyStrings();
        }
        return EmptyStrings._instance;
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
        return 'translate empty strings';
    }

    getKind() {
        return 'emptyStrings';
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
}
