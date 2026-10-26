import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../js/translation-runtime/ObjectTranslationModalMethods.js';
import { TAG_TYPE } from '../../ai-engine/constants.js';
import {
    withTranslatedNotification,
    isNotificationTranslationHandled,
    isKnownDisplayTranslation,
    rememberDisplayTranslation,
} from '../NotificationTranslationContext.js';

const CACHE_TYPE = 'plugin_torigoya_notify_message';
const RUNTIME_HOOK_GUARD = '__CHEAT_TORIGOYA_NOTIFY_MESSAGE_TRANSLATOR_HOOKED__';

export class TorigoyaNotifyMessageTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'TorigoyaMZ_NotifyMessage';
    }

    getPluginAliases() {
        return [this.getPluginName(), 'TorigoyaMZ_NotifyMessageZ'];
    }

    getPluginLabel() {
        return 'Torigoya NotifyMessage';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    normalizeArgsObject(value) {
        return value && typeof value === 'object' ? value : null;
    }

    translateRuntimeText(text, runtime) {
        if (
            !this.isUsableText(text) ||
            !this.isRuntimeTranslationActive(runtime) ||
            isNotificationTranslationHandled() ||
            isKnownDisplayTranslation(runtime, text)
        )
            return text;
        const translated = this.resolveRuntimeTranslation(text, runtime);
        if (translated !== text) rememberDisplayTranslation(runtime, translated);
        return translated;
    }

    enablePluginTranslation() {
        if (window[RUNTIME_HOOK_GUARD]) {
            return true;
        }

        const namespace = window.Torigoya?.NotifyMessageZ || window.Torigoya?.NotifyMessage;
        const notifyWindowClass = namespace?.Window;
        const manager = namespace?.Manager;
        const addon = namespace?.Addons?.GetItem;
        const addonEnabled =
            this.findPluginEntry('TorigoyaMZ_NotifyMessage_AddonGetItem')?.status ||
            this.findPluginEntry('TorigoyaMZ_NotifyMessageZ_AddonGetItem')?.status;

        if (
            !notifyWindowClass?.prototype ||
            typeof notifyWindowClass.prototype.setup !== 'function' ||
            typeof manager?.notify !== 'function' ||
            (addonEnabled &&
                (typeof addon?.notifyGainItem !== 'function' ||
                    typeof addon?.notifyGainMoney !== 'function'))
        ) {
            return false;
        }

        this.registerPluginCustomTags(
            ['name', 'count', 'gold'].map((tagSymbol) => ({
                tagSymbol,
                type: TAG_TYPE.WITHOUT_PARAMETER,
                requiredConsistency: true,
                description:
                    'Torigoya GetItem formatter token; replaced before notification rendering.',
            }))
        );
        const originalSetup = notifyWindowClass.prototype.setup;
        const getTranslatedText = (text) => this.translateRuntimeText(text, this.getRuntime());
        // Render a view with a stable message while openness and other animation
        // properties continue to refer to the original item. Never overwrite it.
        notifyWindowClass.prototype.setup = function (notifyItem) {
            if (!notifyItem) return originalSetup.call(this, notifyItem);
            let message = getTranslatedText(notifyItem.message);
            const view = new Proxy(notifyItem, {
                get(target, key, receiver) {
                    return key === 'message' ? message : Reflect.get(target, key, receiver);
                },
                set(target, key, value, receiver) {
                    if (key === 'message') {
                        message = value;
                        return true;
                    }
                    return Reflect.set(target, key, value, receiver);
                },
            });
            return originalSetup.call(this, view);
        };

        // Translate the complete source before modified builds split it into lines.
        const notify = manager.notify;
        manager.notify = function (item, ...args) {
            if (!item) return notify.call(this, item, ...args);
            const source = item.message;
            item.message = getTranslatedText(source);
            try {
                return withTranslatedNotification(() => notify.call(this, item, ...args));
            } finally {
                item.message = source;
            }
        };
        if (addon) {
            for (const [method, fields] of [
                ['notifyGainItem', ['baseGainSingleMessage', 'baseGainMultiMessage']],
                ['notifyGainMoney', ['baseGainMoneyMessage']],
            ]) {
                if (typeof addon[method] !== 'function') continue;
                const original = addon[method];
                addon[method] = function (...args) {
                    const selected = fields.length === 2 ? [fields[args[1] === 1 ? 0 : 1]] : fields;
                    const source = selected.map((field) => this.parameter[field]);
                    selected.forEach((field, index) => {
                        this.parameter[field] = getTranslatedText(source[index]);
                    });
                    try {
                        return withTranslatedNotification(() => original.apply(this, args));
                    } finally {
                        selected.forEach((field, index) => {
                            this.parameter[field] = source[index];
                        });
                    }
                };
            }
        }

        window[RUNTIME_HOOK_GUARD] = true;
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
                console.warn('[TorigoyaNotifyMessageTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];
        const addon = (window.Torigoya?.NotifyMessageZ || window.Torigoya?.NotifyMessage)?.Addons
            ?.GetItem;
        for (const field of [
            'baseGainSingleMessage',
            'baseGainMultiMessage',
            'baseGainMoneyMessage',
        ]) {
            const text = addon?.parameter?.[field];
            if (this.isUsableText(text)) entries.push({ text, source: { scope: 'addon', field } });
        }
        this.collectCommonEventEntries(entries);
        this.collectTroopEntries(entries);
        await this.collectMapEntries(entries);
        return entries;
    }

    collectCommonEventEntries(output) {
        if (Array.isArray(window.$dataCommonEvents)) {
            for (let commonEventId = 0; commonEventId < $dataCommonEvents.length; commonEventId++) {
                const commonEvent = $dataCommonEvents[commonEventId];
                if (!commonEvent || !Array.isArray(commonEvent.list)) {
                    continue;
                }

                this.collectNotifyCommandsFromList(
                    commonEvent.list,
                    {
                        scope: 'commonEvent',
                        commonEventId,
                    },
                    output
                );
            }
        }
    }

    collectTroopEntries(output) {
        if (Array.isArray(window.$dataTroops)) {
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

                    this.collectNotifyCommandsFromList(
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
                this.collectMapDataEntries(mapData, mapId, output);
            } catch (error) {
                console.warn(
                    `[TorigoyaNotifyMessageTranslator] Failed to scan map ${mapId}`,
                    error
                );
            }
        }
    }

    collectMapDataEntries(mapData, mapId, output) {
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

                this.collectNotifyCommandsFromList(
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

    collectNotifyCommandsFromList(list, baseMeta, output) {
        if (!Array.isArray(list) || !Array.isArray(output)) {
            return;
        }

        for (let cmdIdx = 0; cmdIdx < list.length; cmdIdx++) {
            const cmd = list[cmdIdx];
            if (!cmd || Number(cmd.code) !== 357) {
                continue;
            }

            const entry = this.extractMZNotifyEntry(cmd);
            if (!entry?.text?.trim()) {
                continue;
            }

            output.push({
                text: entry.text,
                commandName: entry.commandName,
                source: {
                    ...baseMeta,
                    cmdIdx,
                },
            });
        }
    }

    extractMZNotifyEntry(cmd) {
        const parameters = Array.isArray(cmd.parameters) ? cmd.parameters : [];
        const pluginName = String(parameters[0] || '')
            .trim()
            .split(/[\\/]/)
            .pop();
        const commandName = String(parameters[1] || '').trim();
        const args = this.normalizeArgsObject(parameters[3]);
        const message = args && typeof args.message === 'string' ? args.message : '';

        if (
            pluginName?.toLowerCase() !== 'torigoyamz_notifymessage' &&
            pluginName?.toLowerCase() !== 'torigoyamz_notifymessagez'
        ) {
            return null;
        }

        if (commandName && commandName !== 'notify') {
            return null;
        }

        if (!message?.trim()) {
            return null;
        }

        return {
            text: message,
            commandName: commandName || 'notify',
        };
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!text?.trim()) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_torigoya_notify_message_${byCacheKey.size}`,
                    value: text,
                    cacheKey,
                });
            }
        }

        return Array.from(byCacheKey.values());
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
}
