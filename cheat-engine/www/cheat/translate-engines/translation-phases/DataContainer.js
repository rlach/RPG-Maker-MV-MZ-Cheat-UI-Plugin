import { DataObjects } from './DataObjects.js';

export class DataContainer extends DataObjects {
    constructor({
        kind,
        getContainer,
        fields,
        cachePrefix,
        getInstanceContainer,
        instanceFunctionName,
        requiresReapplyOnLoad = false,
    }) {
        super([], fields, cachePrefix || 'data');
        this.kind = kind;
        this.getContainer = getContainer;
        this.getInstanceContainer =
            typeof getInstanceContainer === 'function' ? getInstanceContainer : null;
        this.instanceFunctionName = instanceFunctionName || null;
        this.fields = Array.isArray(fields) ? fields : [];
        this.cachePrefix = cachePrefix || 'data';
        this.requiresReapplyOnLoad = !!requiresReapplyOnLoad;
    }

    getKind() {
        return this.kind;
    }

    getTranslationPhaseLabel() {
        return `translating ${this.kind}`;
    }

    async createEntries({ request, runtime }) {
        const container = this.getContainer && this.getContainer();
        if (!Array.isArray(container)) {
            return [];
        }

        const pendingObjects = [];
        for (let i = 1; i < container.length; i++) {
            const item = container[i];
            if (!item) {
                continue;
            }

            if (runtime.hasUntranslatedFields(item, this.fields, this.cachePrefix)) {
                pendingObjects.push(item);
            }
        }

        if (pendingObjects.length === 0) {
            return [];
        }

        return [
            {
                strategy: this.configure(pendingObjects, this.fields, this.cachePrefix),
                priorityMapId: 0,
            },
        ];
    }

    countAmountSync({ runtime }) {
        const container = this.getContainer && this.getContainer();
        return this.constructor.countAmountFromContainer(
            runtime,
            container,
            this.fields,
            this.cachePrefix
        );
    }

    applyCachedData(runtime) {
        if (!runtime || typeof runtime.applyCachedTranslations !== 'function') {
            return true;
        }

        const container = this.getContainer && this.getContainer();
        if (!Array.isArray(container)) {
            return true;
        }

        const instanceContainer = this.getInstanceContainer && this.getInstanceContainer();

        runtime.applyCachedTranslations(
            container,
            this.fields,
            this.cachePrefix,
            instanceContainer,
            this.instanceFunctionName
        );

        return true;
    }

    applyDataOnLifecycle({ runtime, trigger } = {}) {
        const isRestart = trigger === 'createGameObjects';
        if (!isRestart && !this.requiresReapplyOnLoad) {
            return true;
        }

        return this.applyCachedData(runtime);
    }
}
