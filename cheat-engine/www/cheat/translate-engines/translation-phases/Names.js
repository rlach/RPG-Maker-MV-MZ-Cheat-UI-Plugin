import { DirectItems } from './DirectItems.js';
import { getTranslationNames } from '../../js/translation-runtime/TranslationNames.js';

export class Names extends DirectItems {
    getKind() {
        return 'names';
    }

    getNames(runtime) {
        const { actors, names } = getTranslationNames(runtime);
        for (const { originalName } of actors) {
            if (!names.has(originalName)) names.set(originalName, '');
        }
        return names;
    }

    getItems(runtime) {
        return [...this.getNames(runtime)]
            .filter(([, translation]) => !translation.trim())
            .map(([value], index) => ({
                type: 'actor_name',
                id: 'actor_name_' + index,
                value,
                cacheKey: runtime.getCacheKey(value, 'actor_name'),
            }));
    }

    createEntries({ runtime }) {
        return super.createEntries({ request: { items: this.getItems(runtime) } });
    }

    countAmountSync({ runtime }) {
        const names = this.getNames(runtime);
        const total = names.size;
        const left = [...names.values()].filter((translation) => !translation.trim()).length;
        return { total, left, totalStrings: total, leftStrings: left };
    }
}
