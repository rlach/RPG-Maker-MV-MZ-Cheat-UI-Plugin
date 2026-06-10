import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../js/translation-runtime/ObjectTranslationModalMethods.js';

/**
 * ProfileExtend.js translator
 *
 * Supported plugin versions:
 * - 1.1.1 (MV)
 *
 * Translation notes:
 * - Collects extension profile text from actor meta tag: <PE拡張:...>
 * - Collects runtime-overridable profile text from MV plugin command 356:
 *   PE_拡張プロフィール設定 <actorId> <text>
 *   PE_SET_EXTEND_PROFILE <actorId> <text>
 * - Hooks Game_Actor.getExtendProfile() to translate displayed text while preserving
 *   original command syntax and source payloads.
 */

const PROFILE_EXTEND_COMMANDS = new Set(['PE_拡張プロフィール設定', 'PE_SET_EXTEND_PROFILE']);
const CACHE_TYPE = 'plugin_profile_extend';

function toUpperSafe(value) {
    return String(value || '')
        .trim()
        .toUpperCase();
}

function isProfileExtendCommand(commandName) {
    return PROFILE_EXTEND_COMMANDS.has(String(commandName || '').trim());
}

function buildProfileExtendCommandEntry(commandLine) {
    const line = String(commandLine || '');
    if (!line.trim()) {
        return null;
    }

    // Mirror MV command356 tokenization behavior (split on regular space).
    const parts = line.split(' ');
    const commandName = String(parts.shift() || '');
    if (!commandName) {
        return null;
    }

    if (
        !isProfileExtendCommand(commandName) &&
        !PROFILE_EXTEND_COMMANDS.has(toUpperSafe(commandName))
    ) {
        return null;
    }

    const actorIdArg = String(parts[0] || '').trim();
    const profileText = String(parts[1] || '').trim();

    if (!profileText) {
        return null;
    }

    return {
        commandName,
        actorIdArg,
        text: profileText,
    };
}

export class ProfileExtendTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'ProfileExtend';
    }

    getPluginLabel() {
        return 'ProfileExtend';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    enablePluginTranslation() {
        if (
            !window.Game_Actor ||
            !Game_Actor.prototype ||
            typeof Game_Actor.prototype.getExtendProfile !== 'function'
        ) {
            return false;
        }

        const originalGetExtendProfile = Game_Actor.prototype.getExtendProfile;
        const translator = this;

        Game_Actor.prototype.getExtendProfile = function () {
            const originalValue = originalGetExtendProfile.apply(this, arguments);

            try {
                return translator.resolveRuntimeTranslation(
                    originalValue,
                    translator.getRuntime(),
                    translator.getCacheType(),
                    {
                        requireRuntimeTranslationActive: true,
                    }
                );
            } catch (error) {
                console.warn(
                    '[ProfileExtendTranslator] Failed to apply runtime profile extension translation',
                    error
                );
                return originalValue;
            }
        };

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
                console.warn('[ProfileExtendTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];

        this.collectActorMetaEntries(entries);

        if (Array.isArray(window.$dataCommonEvents)) {
            for (let commonEventId = 0; commonEventId < $dataCommonEvents.length; commonEventId++) {
                const commonEvent = $dataCommonEvents[commonEventId];
                if (!commonEvent || !Array.isArray(commonEvent.list)) {
                    continue;
                }

                this.collectProfileExtendCommandsFromList(
                    commonEvent.list,
                    {
                        scope: 'commonEvent',
                        commonEventId,
                    },
                    entries
                );
            }
        }

        const mapInfos = Array.isArray(window.$dataMapInfos) ? window.$dataMapInfos : [];
        for (const mapInfo of mapInfos) {
            const mapId = Number(mapInfo?.id);
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

                        this.collectProfileExtendCommandsFromList(
                            page.list,
                            {
                                scope: 'mapEvent',
                                mapId,
                                eventIdx,
                                pageIdx,
                            },
                            entries
                        );
                    }
                }
            } catch (error) {
                console.warn(`[ProfileExtendTranslator] Failed to scan map ${mapId}`, error);
            }
        }

        return entries;
    }

    collectActorMetaEntries(output) {
        if (!Array.isArray(output) || !Array.isArray(window.$dataActors)) {
            return;
        }

        for (let actorId = 1; actorId < $dataActors.length; actorId++) {
            const actor = $dataActors[actorId];
            if (!actor || !actor.meta || typeof actor.meta !== 'object') {
                continue;
            }

            const text = String(actor.meta['PE拡張'] || '').trim();
            if (!this.isUsableText(text)) {
                continue;
            }

            output.push({
                text,
                source: {
                    scope: 'actorMeta',
                    actorId,
                    metaKey: 'PE拡張',
                },
            });
        }
    }

    collectProfileExtendCommandsFromList(list, baseMeta, output) {
        if (!Array.isArray(list) || !Array.isArray(output)) {
            return;
        }

        for (let cmdIdx = 0; cmdIdx < list.length; cmdIdx++) {
            const cmd = list[cmdIdx];
            if (!cmd || Number(cmd.code) !== 356) {
                continue;
            }

            const commandLine =
                Array.isArray(cmd.parameters) && typeof cmd.parameters[0] === 'string'
                    ? cmd.parameters[0]
                    : '';

            const parsed = buildProfileExtendCommandEntry(commandLine);
            if (!parsed || !this.isUsableText(parsed.text)) {
                continue;
            }

            output.push({
                text: parsed.text,
                commandName: parsed.commandName,
                actorIdArg: parsed.actorIdArg,
                source: {
                    ...baseMeta,
                    cmdIdx,
                },
            });
        }
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = String(entry?.text || '');
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_profile_extend_${byCacheKey.size}`,
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
