import {
    collectEventCommandEntries,
    extractMessageEntryAt,
} from '../../../js/EventCommandTraversal.js';
import { BasePluginTranslator } from '../BasePluginTranslator.js';

const SCENARIO_FILE_NAME = 'Scenario.json';

export class SabaSimpleScenarioTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
        this._scenarioDataPromise = null;
        this._scenarioCommandLists = new WeakSet();
    }

    getPluginName() {
        return 'Saba_SimpleScenario';
    }

    getPluginLabel() {
        return 'Saba SimpleScenario';
    }

    getCacheType() {
        return 'plugin_saba_simple_scenario';
    }

    enablePluginTranslation() {
        if (
            !window.Game_Interpreter ||
            !Game_Interpreter.prototype ||
            typeof Game_Interpreter.prototype.command101 !== 'function'
        ) {
            return false;
        }

        const original = Game_Interpreter.prototype.command101;
        const observeScenarioMessage = this.observeScenarioMessage.bind(this);

        Game_Interpreter.prototype.command101 = function () {
            try {
                observeScenarioMessage(this);
            } catch (error) {
                console.warn(
                    '[SabaSimpleScenarioTranslator] Failed to observe runtime scenario message',
                    error
                );
            }

            return original.apply(this, arguments);
        };

        return true;
    }

    observeScenarioMessage(interpreter) {
        const runtime = this.getRuntime();
        if (!runtime || !this.isRuntimeTranslationActive(runtime)) {
            return;
        }

        const commandList = Array.isArray(interpreter?._list) ? interpreter._list : null;
        if (!this.isScenarioCommandList(commandList)) {
            return;
        }

        const commandIndex = Number(interpreter?._index) || 0;
        const messageEntry = extractMessageEntryAt(commandList, commandIndex);
        if (!messageEntry || typeof messageEntry.text !== 'string' || !messageEntry.text.trim()) {
            return;
        }

        const normalizedSourceText = this.resolveMessageCacheSourceText({
            runtime,
            text: messageEntry.text,
            hasPortrait: !!messageEntry.hasPortrait,
            mode: 'runtime',
            command: messageEntry.command || null,
            cmdIndex: messageEntry.cmdIndex,
        });

        const sourceText =
            typeof normalizedSourceText === 'string' && normalizedSourceText.trim()
                ? normalizedSourceText
                : messageEntry.text;
        const messageType = messageEntry.hasPortrait ? 'message_portrait' : 'message';
        const cacheKey = runtime.getCacheKey(sourceText, messageType);
        runtime.trackCacheKeyUsage(cacheKey);
    }

    isScenarioCommandList(commandList) {
        if (!Array.isArray(commandList)) {
            return false;
        }

        if (this._scenarioCommandLists.has(commandList)) {
            return true;
        }

        this.registerScenarioCommandLists(window.$dataScenario);
        return this._scenarioCommandLists.has(commandList);
    }

    async precomputeCounts() {
        if (!this.ensureDetection()) {
            return;
        }

        if (this._scanPrepared) {
            return;
        }

        if (this._scanPromise) {
            return this._scanPromise;
        }

        this._scanPromise = this.buildScanEntries()
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[SabaSimpleScenarioTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const scenarioData = await this.loadScenarioData();
        if (!scenarioData || typeof scenarioData !== 'object') {
            return [];
        }

        this.registerScenarioCommandLists(scenarioData);

        const entries = [];
        const scenarioIds = Object.keys(scenarioData);
        for (const scenarioId of scenarioIds) {
            const commandList = scenarioData[scenarioId];
            if (!Array.isArray(commandList)) {
                continue;
            }

            const scanned = collectEventCommandEntries(commandList);
            for (const item of scanned) {
                const text = typeof item?.value === 'string' ? item.value : '';
                if (!text.trim()) {
                    continue;
                }

                entries.push({
                    text,
                    cacheType: this.resolveEntryCacheType(item.type),
                    source: {
                        scope: 'scenario',
                        scenarioId,
                        cmdIndex: Number(item.cmdIndex) || 0,
                        type: String(item.type || ''),
                    },
                });
            }
        }

        return entries;
    }

    resolveEntryCacheType(entryType) {
        const type = String(entryType || '');

        if (
            type === 'message' ||
            type === 'message_portrait' ||
            type === 'choice' ||
            type === 'speaker' ||
            type === 'scroll_text' ||
            type === 'variable_value'
        ) {
            return type;
        }

        return this.getCacheType();
    }

    registerScenarioCommandLists(scenarioData) {
        if (!scenarioData || typeof scenarioData !== 'object') {
            return;
        }

        const scenarioIds = Object.keys(scenarioData);
        for (const scenarioId of scenarioIds) {
            const commandList = scenarioData[scenarioId];
            if (Array.isArray(commandList)) {
                this._scenarioCommandLists.add(commandList);
            }
        }
    }

    async loadScenarioData() {
        if (window.$dataScenario && typeof window.$dataScenario === 'object') {
            return window.$dataScenario;
        }

        if (this._scenarioDataPromise) {
            return this._scenarioDataPromise;
        }

        this._scenarioDataPromise = this.loadScenarioDataFromDataFile()
            .catch((error) => {
                console.warn(
                    '[SabaSimpleScenarioTranslator] Failed to load Scenario.json for scanning',
                    error
                );
                return null;
            })
            .finally(() => {
                this._scenarioDataPromise = null;
            });

        return this._scenarioDataPromise;
    }

    loadScenarioDataFromDataFile() {
        const dataManager = globalThis.DataManager;
        if (dataManager && typeof dataManager.loadDataFile === 'function') {
            return this.loadScenarioDataViaDataManager(dataManager);
        }

        return this.loadScenarioDataViaXhr();
    }

    loadScenarioDataViaDataManager(dataManager) {
        return new Promise((resolve, reject) => {
            const tempName = `__cheatScenarioLoad_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const startedAt = Date.now();
            const timeoutMs = 15000;

            const cleanup = () => {
                try {
                    delete window[tempName];
                } catch {
                    window[tempName] = null;
                }
            };

            const checkLoaded = () => {
                const scenarioData = window[tempName];
                if (scenarioData && typeof scenarioData === 'object') {
                    cleanup();
                    resolve(scenarioData);
                    return;
                }

                const errors = Array.isArray(dataManager._errors) ? dataManager._errors : [];
                const errorIndex = errors.findIndex(
                    (error) => error?.name === tempName && error?.src === SCENARIO_FILE_NAME
                );

                if (errorIndex >= 0) {
                    errors.splice(errorIndex, 1);
                    cleanup();
                    reject(new Error(`Failed to load ${SCENARIO_FILE_NAME}`));
                    return;
                }

                if (Date.now() - startedAt >= timeoutMs) {
                    cleanup();
                    reject(new Error(`Timed out while loading ${SCENARIO_FILE_NAME}`));
                    return;
                }

                setTimeout(checkLoaded, 16);
            };

            try {
                dataManager.loadDataFile(tempName, SCENARIO_FILE_NAME);
                checkLoaded();
            } catch (error) {
                cleanup();
                reject(error);
            }
        });
    }

    loadScenarioDataViaXhr() {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', `data/${SCENARIO_FILE_NAME}`, true);
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const parsed = JSON.parse(xhr.responseText);
                        resolve(parsed && typeof parsed === 'object' ? parsed : null);
                    } catch (error) {
                        reject(error);
                    }
                    return;
                }

                reject(new Error(`HTTP ${xhr.status}`));
            };
            xhr.onerror = () => reject(new Error('Network error'));
            xhr.send();
        });
    }

    buildUniquePendingItems(panel) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry?.text === 'string' ? entry.text : '';
            if (!text.trim()) {
                continue;
            }

            const cacheType =
                typeof entry.cacheType === 'string' && entry.cacheType
                    ? entry.cacheType
                    : this.getCacheType();
            const cacheKey = panel.getCacheKey(text, cacheType);
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: cacheType,
                    id: `plugin_saba_simple_scenario_${byCacheKey.size}`,
                    value: text,
                    cacheKey,
                });
            }
        }

        return Array.from(byCacheKey.values());
    }

    collectUntranslated({ panel }) {
        if (!panel || typeof panel.getCacheKey !== 'function') {
            return [];
        }

        const items = this.buildUniquePendingItems(panel);
        return items.filter((item) => !panel.hasUsableCacheValue(item.cacheKey));
    }

    getCachedCountsSync({ panel }) {
        if (!panel || typeof panel.getCacheKey !== 'function') {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        const items = this.buildUniquePendingItems(panel);
        const totalStrings = items.length;
        const leftStrings = items.filter(
            (item) => !panel.hasUsableCacheValue(item.cacheKey)
        ).length;

        return {
            total: totalStrings,
            left: leftStrings,
            totalStrings,
            leftStrings,
        };
    }
}
