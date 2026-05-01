import { DataContainer } from './DataContainer.js';

export class Actor extends DataContainer {
    constructor() {
        super({
            kind: 'actors',
            cachePrefix: 'actor',
            fields: ['name', 'nickname', 'profile'],
            getContainer: () => window.$dataActors,
            getInstanceContainer: () => window.$gameActors,
            instanceFunctionName: 'actor',
            requiresReapplyOnLoad: true,
        });
    }

    applyCachedData(panel) {
        if (!panel || !Array.isArray(window.$dataActors)) {
            return true;
        }

        const dataContainer = window.$dataActors;
        const gameActors = window.$gameActors;

        for (let i = 1; i < dataContainer.length; i++) {
            const item = dataContainer[i];
            if (!item) {
                continue;
            }

            const actorInstance = gameActors?.actor?.(item.id) || null;

            if (!item._translateOriginal) {
                item._translateOriginal = {};
                for (const field of this.fields) {
                    item._translateOriginal[field] = item[field];
                }
            }

            for (const field of this.fields) {
                // If actor name differs from saved game instance name, keep user's manual edit.
                if (
                    field === 'name' &&
                    actorInstance &&
                    typeof actorInstance._name === 'string' &&
                    typeof item.name === 'string' &&
                    actorInstance._name !== item.name
                ) {
                    continue;
                }

                const originalValue = item._translateOriginal[field];
                if (
                    !originalValue ||
                    typeof originalValue !== 'string' ||
                    originalValue.trim() === ''
                ) {
                    continue;
                }

                const cacheKey = panel.getCacheKey(originalValue, `${this.cachePrefix}_${field}`);
                if (!panel.hasUsableCacheValue(cacheKey)) {
                    continue;
                }

                const translatedValue = panel.translationCache.get(cacheKey);
                item[field] = translatedValue;
                if (actorInstance) {
                    actorInstance[`_${field}`] = translatedValue;
                }
            }
        }

        return true;
    }
}
