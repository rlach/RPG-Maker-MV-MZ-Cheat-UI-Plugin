import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { DATA_CONTAINER_TRANSLATION_DEFINITIONS } from '../../translation-phases/DataContainerDefinitions.js';

const RUNTIME_HOOK_GUARD = '__CHEAT_DYNAMIC_DATABASE_TRANSLATOR_HOOKED__';

export class DynamicDatabaseTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'DynamicDatabase';
    }

    getPluginLabel() {
        return 'DynamicDatabase';
    }

    getCacheType() {
        return 'plugin_dynamic_database';
    }

    resolveMappedCacheType(cachePrefix, field) {
        const normalizedPrefix = String(cachePrefix || '').trim();
        const normalizedField = String(field || '').trim();
        if (!normalizedPrefix || !normalizedField) {
            return '';
        }

        return `${normalizedPrefix}_${normalizedField}`;
    }

    getDataTypeByObject(dataObject) {
        if (!dataObject || typeof dataObject !== 'object') {
            return '';
        }

        const objectId = Number(dataObject.id) || 0;
        if (objectId <= 0) {
            return '';
        }

        if (Array.isArray(window.$dataItems) && window.$dataItems[objectId] === dataObject) {
            return 'item';
        }

        if (Array.isArray(window.$dataWeapons) && window.$dataWeapons[objectId] === dataObject) {
            return 'weapon';
        }

        if (Array.isArray(window.$dataArmors) && window.$dataArmors[objectId] === dataObject) {
            return 'armor';
        }

        if (Array.isArray(window.$dataSkills) && window.$dataSkills[objectId] === dataObject) {
            return 'skill';
        }

        return '';
    }

    getOriginalFieldValue(dataObject, field) {
        if (!dataObject || typeof dataObject !== 'object') {
            return '';
        }

        const originalMap =
            dataObject._translateOriginal && typeof dataObject._translateOriginal === 'object'
                ? dataObject._translateOriginal
                : null;

        if (originalMap && this.isUsableText(originalMap[field])) {
            return originalMap[field];
        }

        const raw = dataObject[field];
        return this.isUsableText(raw) ? raw : '';
    }

    resolveRuntimeTranslation(runtime, dataObject, field) {
        if (
            !runtime
        ) {
            return null;
        }

        const originalText = this.getOriginalFieldValue(dataObject, field);
        if (!this.isUsableText(originalText)) {
            return null;
        }

        const dataType = this.getDataTypeByObject(dataObject);
        if (dataType) {
            const dataCacheType = `${dataType}_${field}`;
            const directCached = super.resolveRuntimeTranslation(
                originalText,
                runtime,
                dataCacheType,
                { missValue: null }
            );
            if (this.isUsableText(directCached)) {
                return directCached;
            }
        }

        return super.resolveRuntimeTranslation(originalText, runtime, this.getCacheType(), {
            missValue: null,
        });
    }

    enablePluginTranslation() {
        if (window[RUNTIME_HOOK_GUARD]) {
            return;
        }

        if (
            !window.Window_Base ||
            !Window_Base.prototype ||
            typeof Window_Base.prototype.drawItemName !== 'function'
        ) {
            return;
        }

        const translator = this;
        const originalDrawItemName = Window_Base.prototype.drawItemName;
        Window_Base.prototype.drawItemName = function (item) {
            try {
                const runtime = translator.getRuntime();
                const translatedName = translator.resolveRuntimeTranslation(runtime, item, 'name');

                if (translator.isUsableText(translatedName) && item && typeof item === 'object') {
                    arguments[0] = {
                        ...item,
                        name: translatedName,
                    };
                }
            } catch (error) {
                console.warn(
                    '[DynamicDatabaseTranslator] Failed to apply runtime item name translation',
                    error
                );
            }

            return originalDrawItemName.apply(this, arguments);
        };

        if (
            window.Window_Help &&
            Window_Help.prototype &&
            typeof Window_Help.prototype.setItem === 'function'
        ) {
            const originalHelpSetItem = Window_Help.prototype.setItem;
            Window_Help.prototype.setItem = function (item) {
                try {
                    const runtime = translator.getRuntime();
                    const translatedDescription = translator.resolveRuntimeTranslation(
                        runtime,
                        item,
                        'description'
                    );

                    if (translator.isUsableText(translatedDescription) && item && typeof item === 'object') {
                        arguments[0] = {
                            ...item,
                            description: translatedDescription,
                        };
                    }
                } catch (error) {
                    console.warn(
                        '[DynamicDatabaseTranslator] Failed to apply runtime description translation',
                        error
                    );
                }

                return originalHelpSetItem.apply(this, arguments);
            };
        }

        window[RUNTIME_HOOK_GUARD] = true;
    }

    async prepareTranslator() {
        if (!this.ensureDetection()) {
            return;
        }

        if (this._scanPrepared) {
            return;
        }

        if (this._scanPromise) {
            return this._scanPromise;
        }

        this._scanPromise = Promise.resolve(this.buildScanEntries())
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[DynamicDatabaseTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const entries = [];

        for (const definition of DATA_CONTAINER_TRANSLATION_DEFINITIONS) {
            const container =
                definition && typeof definition.getContainer === 'function'
                    ? definition.getContainer()
                    : null;
            const fields = Array.isArray(definition && definition.fields) ? definition.fields : [];
            const cachePrefix = String((definition && definition.cachePrefix) || '').trim();

            if (!Array.isArray(container) || fields.length === 0 || !cachePrefix) {
                continue;
            }

            for (let id = 1; id < container.length; id++) {
                const dataObject = container[id];
                if (!dataObject || typeof dataObject !== 'object') {
                    continue;
                }

                for (const field of fields) {
                    const text = this.getOriginalFieldValue(dataObject, field);
                    if (!this.isUsableText(text)) {
                        continue;
                    }

                    entries.push({
                        text,
                        cachePrefix,
                        field,
                        source: {
                            kind: definition.kind || cachePrefix,
                            id,
                            field,
                        },
                    });
                }
            }
        }

        return entries;
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!this.isUsableText(text)) {
                continue;
            }

            const mappedType = this.resolveMappedCacheType(entry.cachePrefix, entry.field);
            if (!mappedType) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, mappedType);
            const legacyCacheKey = runtime.getCacheKey(text, this.getCacheType());

            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: mappedType,
                    id: `plugin_dynamic_database_${byCacheKey.size}`,
                    value: text,
                    cacheKey,
                    legacyCacheKey,
                });
            }
        }

        return Array.from(byCacheKey.values());
    }

    isEntryTranslated(runtime, item) {
        if (!runtime || !item) {
            return false;
        }

        if (runtime.hasUsableCacheValue(item.cacheKey)) {
            return true;
        }

        if (item.legacyCacheKey && runtime.hasUsableCacheValue(item.legacyCacheKey)) {
            return true;
        }

        return false;
    }

    collectUntranslated({ runtime }) {
        if (!runtime) {
            return [];
        }

        const items = this.buildUniquePendingItems(runtime);
        return items.filter((item) => !this.isEntryTranslated(runtime, item));
    }

    countPluginAmountSync({ runtime }) {
        if (!runtime) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        const items = this.buildUniquePendingItems(runtime);
        const totalStrings = items.length;
        const leftStrings = items.filter((item) => !this.isEntryTranslated(runtime, item)).length;

        return {
            total: totalStrings,
            left: leftStrings,
            totalStrings,
            leftStrings,
        };
    }
}
