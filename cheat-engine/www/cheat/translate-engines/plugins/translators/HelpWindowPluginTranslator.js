import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../js/translation-runtime/ObjectTranslationModalMethods.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

const PLUGIN_NAME = 'HelpWindowPlugin';
const SET_PAGES_COMMAND = 'SetPages';
const ADD_PAGE_COMMAND = 'AddPage';

export class HelpWindowPluginTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return PLUGIN_NAME;
    }

    getPluginLabel() {
        return 'HelpWindowPlugin';
    }

    getCacheType() {
        return 'plugin_help_window';
    }

    // -----------------------------------------------------------------------
    // Runtime hook
    // -----------------------------------------------------------------------

    enablePluginTranslation() {
        // Scene_HelpWindow is exported globally by the plugin as window.Scene_HelpWindow.
        // Hook _refreshPage instead of Game_System.prototype.helpPages to avoid
        // breaking addHelpPage(), which calls helpPages().push() — mutating a mapped
        // copy would silently discard pages, leaving the window blank.
        if (typeof Scene_HelpWindow === 'undefined' || !Scene_HelpWindow.prototype) {
            return false;
        }

        const translator = this;
        const original = Scene_HelpWindow.prototype._refreshPage;

        if (!original || typeof original !== 'function') {
            return false;
        }

        Scene_HelpWindow.prototype._refreshPage = function () {
            original.call(this);

            try {
                const runtime = translator.getRuntime();
                if (!runtime) {
                    return;
                }

                const pages =
                    typeof $gameSystem !== 'undefined' &&
                    typeof $gameSystem.helpPages === 'function'
                        ? $gameSystem.helpPages()
                        : null;

                if (!Array.isArray(pages) || pages.length === 0) {
                    return;
                }

                const pageIndex = Number(this._pageIndex) || 0;
                const page = pages[Math.max(0, Math.min(pageIndex, pages.length - 1))];
                if (!page) {
                    return;
                }

                const cacheType = translator.getCacheType();
                const translationActive = translator.isRuntimeTranslationActive(runtime);

                if (translator.isUsableText(page.title) && this._titleWindow) {
                    const titleKey = runtime.getCacheKey(page.title, cacheType);
                    runtime.trackCacheKeyUsage(titleKey);
                    if (translationActive && runtime.hasUsableCacheValue(titleKey)) {
                        const cached = runtime.translationCache.get(titleKey);
                        if (translator.isUsableText(cached)) {
                            this._titleWindow.setTitle(cached);
                        }
                    }
                }

                if (translator.isUsableText(page.text) && this._contentWindow) {
                    const textKey = runtime.getCacheKey(page.text, cacheType);
                    runtime.trackCacheKeyUsage(textKey);
                    if (translationActive && runtime.hasUsableCacheValue(textKey)) {
                        const cached = runtime.translationCache.get(textKey);
                        if (translator.isUsableText(cached)) {
                            this._contentWindow.setText(cached);
                        }
                    }
                }
            } catch (error) {
                console.warn(
                    '[HelpWindowPluginTranslator] Failed to apply cached translation in _refreshPage',
                    error
                );
            }
        };

        return true;
    }

    // -----------------------------------------------------------------------
    // Scanning
    // -----------------------------------------------------------------------

    /**
     * Scan the plugin's `pages` parameter for default help page texts.
     * These are defined by the game author in the Plugin Manager, not in events,
     * and are the primary source of translatable strings for this plugin.
     */
    collectDefaultPagesFromPluginParams(output) {
        if (!Array.isArray(window.$plugins)) {
            return;
        }

        const pluginEntry = window.$plugins.find(
            (p) =>
                p &&
                typeof p.name === 'string' &&
                p.name.trim().toLowerCase() === PLUGIN_NAME.toLowerCase()
        );

        if (!pluginEntry || !pluginEntry.parameters) {
            return;
        }

        const rawPages = pluginEntry.parameters['pages'];
        const outerArray = parseJsonSafely(rawPages, []);
        if (!Array.isArray(outerArray)) {
            return;
        }

        for (const rawPage of outerArray) {
            const page = parseJsonSafely(rawPage, null);
            if (!page || typeof page !== 'object') {
                continue;
            }

            if (this.isUsableText(page.title)) {
                output.push({ text: page.title, field: 'title', source: { scope: 'pluginParam' } });
            }
            if (this.isUsableText(page.text)) {
                output.push({ text: page.text, field: 'text', source: { scope: 'pluginParam' } });
            }
        }
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

        this._scanPromise = this.buildScanEntries()
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[HelpWindowPluginTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];

        // Plugin parameters hold the default pages list.
        // This is the most common way the game author populates pages,
        // so this scan must run before event scanning.
        this.collectDefaultPagesFromPluginParams(entries);

        if (Array.isArray(window.$dataCommonEvents)) {
            for (let commonEventId = 0; commonEventId < $dataCommonEvents.length; commonEventId++) {
                const commonEvent = $dataCommonEvents[commonEventId];
                if (!commonEvent || !Array.isArray(commonEvent.list)) {
                    continue;
                }

                this.collectHelpPageCommandsFromList(
                    commonEvent.list,
                    { scope: 'commonEvent', commonEventId },
                    entries
                );
            }
        }

        const mapInfos = Array.isArray(window.$dataMapInfos) ? window.$dataMapInfos : [];
        for (const mapInfo of mapInfos) {
            const mapId = Number(mapInfo && mapInfo.id);
            if (!mapId) {
                continue;
            }

            try {
                const mapData = await loadMapDataById(mapId);
                if (!mapData || !Array.isArray(mapData.events)) {
                    continue;
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

                        this.collectHelpPageCommandsFromList(
                            page.list,
                            { scope: 'mapEvent', mapId, eventIdx, pageIdx },
                            entries
                        );
                    }
                }
            } catch (error) {
                console.warn(`[HelpWindowPluginTranslator] Failed to scan map ${mapId}`, error);
            }
        }

        return entries;
    }

    collectHelpPageCommandsFromList(list, baseMeta, output) {
        if (!Array.isArray(list) || !Array.isArray(output)) {
            return;
        }

        for (let cmdIdx = 0; cmdIdx < list.length; cmdIdx++) {
            const cmd = list[cmdIdx];
            if (!cmd) {
                continue;
            }

            const extracted = this.extractHelpPageTexts(cmd);
            if (!extracted || extracted.length === 0) {
                continue;
            }

            for (const item of extracted) {
                output.push({
                    ...item,
                    source: { ...baseMeta, cmdIdx },
                });
            }
        }
    }

    /**
     * Extract translatable page texts from a single command.
     * Handles MZ plugin commands (code 357) only; HelpWindowPlugin is MZ-only.
     * @param {object} cmd - Event command object
     * @returns {Array<{text: string, field: string}>}
     */
    extractHelpPageTexts(cmd) {
        if (Number(cmd.code) !== 357) {
            return [];
        }

        const params = cmd.parameters;
        if (!Array.isArray(params)) {
            return [];
        }

        const pluginName = String(params[0] || '').trim();
        if (pluginName.toLowerCase() !== PLUGIN_NAME.toLowerCase()) {
            return [];
        }

        const commandName = String(params[1] || '').trim();
        const args = params[3] && typeof params[3] === 'object' ? params[3] : {};

        if (commandName === SET_PAGES_COMMAND) {
            return this.extractFromSetPages(args);
        }

        if (commandName === ADD_PAGE_COMMAND) {
            return this.extractFromAddPage(args);
        }

        return [];
    }

    extractFromSetPages(args) {
        const results = [];
        // pages arg is a double-encoded JSON string: JSON array of JSON-stringified page objects
        const rawPages = args.pages;
        const outerArray = parseJsonSafely(rawPages, []);
        if (!Array.isArray(outerArray)) {
            return results;
        }

        for (const rawPage of outerArray) {
            const page = parseJsonSafely(rawPage, null);
            if (!page || typeof page !== 'object') {
                continue;
            }

            if (this.isUsableText(page.title)) {
                results.push({ text: page.title, field: 'title' });
            }
            if (this.isUsableText(page.text)) {
                results.push({ text: page.text, field: 'text' });
            }
        }

        return results;
    }

    extractFromAddPage(args) {
        const results = [];
        const title = String(args.title || '');
        const text = String(args.text || '');

        if (this.isUsableText(title)) {
            results.push({ text: title, field: 'title' });
        }
        if (this.isUsableText(text)) {
            results.push({ text: text, field: 'text' });
        }

        return results;
    }

    // -----------------------------------------------------------------------
    // Deduplication and collection
    // -----------------------------------------------------------------------

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!text || !text.trim()) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_help_window_${byCacheKey.size}`,
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

    countPluginAmountSync({ runtime }) {
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
