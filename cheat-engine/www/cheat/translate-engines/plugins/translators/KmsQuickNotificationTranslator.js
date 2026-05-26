import { extractMessageEntryAt } from '../../../js/EventCommandTraversal.js';
import { loadMapDataById } from '../../../js/translation-runtime/ObjectTranslationModalMethods.js';
import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * KMS QuickNotification translator.
 *
 * Supported plugin versions:
 * - KMS_QuickNotification.js v0.1.1 (MV)
 *
 * Translation notes:
 * - Notification text is authored through the MV plugin command
 *   `QuickNotification register`, which causes the next Show Text command
 *   (`command101` + following 401 lines) to be diverted into the plugin's
 *   notification queue instead of the normal message window.
 * - Scans map events, common events, and troop event pages by mirroring that
 *   register-then-next-message flow exactly.
 * - Runtime translation hooks `Game_Temp.registerQuickNotification`, which is
 *   the narrow queue insertion point that still receives the original text.
 */

const CACHE_TYPE = 'plugin_kms_quick_notification';
const PLUGIN_NAME = 'KMS_QuickNotification';
const PLUGIN_COMMAND_NAME = 'QuickNotification';
const PLUGIN_COMMAND_REGISTER = 'register';
const HOOK_FLAG = '__CHEAT_KMS_QUICK_NOTIFICATION_TRANSLATOR_HOOKED__';

function splitMvPluginCommandLine(commandLine) {
    const normalized = String(commandLine || '').trim();
    if (!normalized) {
        return [];
    }

    return normalized.split(' ').filter((part) => part !== '');
}

function isRegisterCommand(commandLine) {
    const parts = splitMvPluginCommandLine(commandLine);
    if (parts.length < 2) {
        return false;
    }

    return parts[0] === PLUGIN_COMMAND_NAME && parts[1] === PLUGIN_COMMAND_REGISTER;
}

export class KmsQuickNotificationTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return PLUGIN_NAME;
    }

    getPluginAliases() {
        return [PLUGIN_NAME, PLUGIN_COMMAND_NAME];
    }

    getPluginLabel() {
        return 'KMS QuickNotification';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    enablePluginTranslation() {
        const gameTempProto = window.Game_Temp?.prototype;
        if (!gameTempProto || typeof gameTempProto.registerQuickNotification !== 'function') {
            return false;
        }

        if (gameTempProto[HOOK_FLAG]) {
            return true;
        }

        const originalRegisterQuickNotification = gameTempProto.registerQuickNotification;
        const getRuntime = this.getRuntime.bind(this);
        const isUsableText = this.isUsableText.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);
        const cacheType = this.getCacheType();

        gameTempProto.registerQuickNotification = function (notification) {
            let nextNotification = notification;

            try {
                const sourceText = String(notification?.text || '');
                const runtime = getRuntime();

                if (runtime && isUsableText(sourceText)) {
                    const cacheKey = runtime.getCacheKey(sourceText, cacheType);
                    runtime.trackCacheKeyUsage(cacheKey);

                    if (isRuntimeTranslationActive(runtime)) {
                        const translatedText = resolveRuntimeTranslation(
                            sourceText,
                            runtime,
                            cacheType,
                            {
                                requireRuntimeTranslationActive: true,
                                missValue: sourceText,
                                harvestMissing: false,
                            }
                        );

                        if (translatedText !== sourceText && isUsableText(translatedText)) {
                            nextNotification = {
                                ...notification,
                                text: translatedText,
                            };
                        }
                    }
                }
            } catch (error) {
                console.warn(
                    '[KmsQuickNotificationTranslator] Failed to resolve runtime notification translation',
                    error
                );
            }

            return originalRegisterQuickNotification.call(this, nextNotification);
        };

        Object.defineProperty(gameTempProto, HOOK_FLAG, {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });

        return true;
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
                console.warn('[KmsQuickNotificationTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];
        this.collectCommonEventEntries(entries);
        this.collectTroopEntries(entries);
        await this.collectMapEntries(entries);
        return entries;
    }

    collectCommonEventEntries(output) {
        if (!Array.isArray(window.$dataCommonEvents)) {
            return;
        }

        for (let commonEventId = 0; commonEventId < $dataCommonEvents.length; commonEventId++) {
            const commonEvent = $dataCommonEvents[commonEventId];
            if (!commonEvent || !Array.isArray(commonEvent.list)) {
                continue;
            }

            this.collectNotificationEntriesFromList(
                commonEvent.list,
                {
                    scope: 'commonEvent',
                    commonEventId,
                },
                output
            );
        }
    }

    collectTroopEntries(output) {
        if (!Array.isArray(window.$dataTroops)) {
            return;
        }

        for (let troopId = 0; troopId < $dataTroops.length; troopId++) {
            const troop = $dataTroops[troopId];
            if (!troop || !Array.isArray(troop.pages)) {
                continue;
            }

            for (let pageIdx = 0; pageIdx < troop.pages.length; pageIdx++) {
                const page = troop.pages[pageIdx];
                if (!page || !Array.isArray(page.list)) {
                    continue;
                }

                this.collectNotificationEntriesFromList(
                    page.list,
                    {
                        scope: 'troopEvent',
                        troopId,
                        pageIdx,
                    },
                    output
                );
            }
        }
    }

    async collectMapEntries(output) {
        const mapInfos = Array.isArray(window.$dataMapInfos) ? window.$dataMapInfos : [];

        for (const mapInfo of mapInfos) {
            const mapId = Number(mapInfo?.id);
            if (!mapId) {
                continue;
            }

            try {
                const mapData = await loadMapDataById(mapId);
                this.collectMapEventEntries(mapData, mapId, output);
            } catch (error) {
                console.warn(
                    `[KmsQuickNotificationTranslator] Failed to scan map ${mapId}`,
                    error
                );
            }
        }
    }

    collectMapEventEntries(mapData, mapId, output) {
        if (!mapData || !Array.isArray(mapData.events)) {
            return;
        }

        for (let eventIdx = 0; eventIdx < mapData.events.length; eventIdx++) {
            const event = mapData.events[eventIdx];
            if (!event || !Array.isArray(event.pages)) {
                continue;
            }

            for (let pageIdx = 0; pageIdx < event.pages.length; pageIdx++) {
                const page = event.pages[pageIdx];
                if (!page || !Array.isArray(page.list)) {
                    continue;
                }

                this.collectNotificationEntriesFromList(
                    page.list,
                    {
                        scope: 'mapEvent',
                        mapId,
                        eventIdx,
                        pageIdx,
                    },
                    output
                );
            }
        }
    }

    collectNotificationEntriesFromList(list, baseMeta, output) {
        if (!Array.isArray(list) || !Array.isArray(output)) {
            return;
        }

        let isRegistrationPending = false;

        let cmdIdx = 0;
        while (cmdIdx < list.length) {
            const cmd = list[cmdIdx];
            if (!cmd) {
                cmdIdx += 1;
                continue;
            }

            if (Number(cmd.code) === 356) {
                const commandLine = String(cmd.parameters?.[0] || '');
                if (isRegisterCommand(commandLine)) {
                    isRegistrationPending = true;
                }
                cmdIdx += 1;
                continue;
            }

            if (!isRegistrationPending || Number(cmd.code) !== 101) {
                cmdIdx += 1;
                continue;
            }

            const messageEntry = extractMessageEntryAt(list, cmdIdx);
            isRegistrationPending = false;
            if (!messageEntry || !this.isUsableText(messageEntry.text)) {
                cmdIdx += 1;
                continue;
            }

            output.push({
                text: messageEntry.text,
                source: {
                    ...baseMeta,
                    cmdIdx,
                },
            });

            cmdIdx = messageEntry.nextIndex;
        }
    }

    collectUntranslated({ runtime }) {
        if (!runtime) {
            return [];
        }

        const items = this.buildUniquePendingItems(runtime);
        return items.filter((item) => !runtime.hasUsableCacheValue(item.cacheKey));
    }

    getCachedCountsSync({ runtime }) {
        if (!runtime) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        const items = this.buildUniquePendingItems(runtime);
        const totalStrings = items.length;
        const leftStrings = items.filter(
            (item) => !runtime.hasUsableCacheValue(item.cacheKey)
        ).length;

        return {
            total: totalStrings,
            left: leftStrings,
            totalStrings,
            leftStrings,
        };
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry?.text === 'string' ? entry.text : '';
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_kms_quick_notification_${byCacheKey.size}`,
                    value: text,
                    cacheKey,
                });
            }
        }

        return Array.from(byCacheKey.values());
    }
}