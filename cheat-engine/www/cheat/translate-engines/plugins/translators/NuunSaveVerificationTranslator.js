/**
 * NuunSaveVerificationTranslator
 *
 * Translator for NUUN_SaveVerification.js
 * Supported versions:
 * - v1.0.0 (MZ)
 *
 * Text sources:
 * - SaveVerificationMessage parameter (string array)
 * - SaveVerificationYesText / SaveVerificationNoText
 */

import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

export class NuunSaveVerificationTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'NUUN_SaveVerification';
    }

    getPluginLabel() {
        return 'NUUN SaveVerification';
    }

    getCacheType() {
        return 'plugin_nuun_save_verification';
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

        this._scanPromise = Promise.resolve(this.buildScanEntries())
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[NuunSaveVerificationTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const entries = [];
        const parameters = this._resolvePluginParameters();
        if (!parameters) {
            return entries;
        }

        const yesText = String(parameters.SaveVerificationYesText || '');
        if (this.isUsableText(yesText)) {
            entries.push({
                text: yesText,
                source: { scope: 'pluginParam', paramKey: 'SaveVerificationYesText' },
            });
        }

        const noText = String(parameters.SaveVerificationNoText || '');
        if (this.isUsableText(noText)) {
            entries.push({
                text: noText,
                source: { scope: 'pluginParam', paramKey: 'SaveVerificationNoText' },
            });
        }

        const messageList = parseJsonSafely(parameters.SaveVerificationMessage, []);
        if (Array.isArray(messageList)) {
            for (let i = 0; i < messageList.length; i += 1) {
                const text = String(messageList[i] || '');
                if (!this.isUsableText(text)) {
                    continue;
                }

                entries.push({
                    text,
                    source: { scope: 'pluginParam', paramKey: 'SaveVerificationMessage', index: i },
                });
            }
        }

        return entries;
    }

    collectUntranslated({ runtime }) {
        if (!runtime) {
            return [];
        }

        const items = this._buildUniquePendingItems(runtime);
        return items.filter((item) => !runtime.hasUsableCacheValue(item.cacheKey));
    }

    getCachedCountsSync({ runtime }) {
        if (!runtime) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        const items = this._buildUniquePendingItems(runtime);
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

    enablePluginTranslation() {
        const commandProto = window.Window_Command?.prototype;
        const messageProto = window.Window_Base?.prototype;

        if (
            !commandProto ||
            !messageProto ||
            typeof commandProto.addCommand !== 'function' ||
            typeof messageProto.drawText !== 'function'
        ) {
            console.log(
                '[NuunSaveVerificationTranslator] Required prototypes or methods not found, cannot apply translation hooks. State of functions:',
                {
                    commandAddCommand: typeof commandProto?.addCommand,
                    messageDrawText: typeof messageProto?.drawText,
                    commandPrototype: commandProto,
                    messagePrototype: messageProto,
                }
            );
            return false;
        }

        this._hookCommandWindow(commandProto);
        this._hookMessageWindow(messageProto);
        return true;
    }

    _hookCommandWindow(prototype) {
        if (prototype.__CHEAT_NUUN_SAVE_VERIFICATION_ADD_COMMAND_PATCHED__) {
            return;
        }

        const original = prototype.addCommand;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);

        prototype.addCommand = function (name, symbol, enabled, ext) {
            if (this?.constructor?.name !== 'Window_SaveVerificationWindow') {
                return original.call(this, name, symbol, enabled, ext);
            }

            const runtime = getRuntime();
            if (!isRuntimeTranslationActive(runtime)) {
                return original.call(this, name, symbol, enabled, ext);
            }

            const translated = resolveRuntimeTranslation(
                name,
                runtime,
                'plugin_nuun_save_verification',
                {
                    requireRuntimeTranslationActive: true,
                    missValue: name,
                }
            );

            return original.call(this, translated, symbol, enabled, ext);
        };

        Object.defineProperty(prototype, '__CHEAT_NUUN_SAVE_VERIFICATION_ADD_COMMAND_PATCHED__', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    _hookMessageWindow(prototype) {
        if (prototype.__CHEAT_NUUN_SAVE_VERIFICATION_MESSAGE_PATCHED__) {
            return;
        }

        const original = prototype.drawText;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);
        const isUsableText = this.isUsableText.bind(this);

        prototype.drawText = function (text, x, y, maxWidth, align) {
            if (this?.constructor?.name !== 'Window_SaveVerificationMessageWindow') {
                return original.call(this, text, x, y, maxWidth, align);
            }

            const runtime = getRuntime();
            if (!isRuntimeTranslationActive(runtime)) {
                return original.call(this, text, x, y, maxWidth, align);
            }

            const source = isUsableText(text) ? text : String(text || '');
            const translated = resolveRuntimeTranslation(
                source,
                runtime,
                'plugin_nuun_save_verification',
                {
                    requireRuntimeTranslationActive: true,
                    missValue: source,
                }
            );

            return original.call(this, translated, x, y, maxWidth, align);
        };

        Object.defineProperty(prototype, '__CHEAT_NUUN_SAVE_VERIFICATION_MESSAGE_PATCHED__', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    _resolvePluginParameters() {
        const pluginEntry = this.findPluginEntry(this.getPluginName());
        if (pluginEntry?.parameters && typeof pluginEntry.parameters === 'object') {
            return pluginEntry.parameters;
        }

        if (typeof window.PluginManager?.parameters === 'function') {
            const parameters = window.PluginManager.parameters(this.getPluginName());
            if (parameters && typeof parameters === 'object') {
                return parameters;
            }
        }

        return null;
    }

    _buildUniquePendingItems(runtime) {
        if (!this._scanPrepared) {
            this._scanEntries = this.buildScanEntries();
            this._scanPrepared = true;
        }

        const byCacheKey = new Map();
        for (const entry of this._scanEntries) {
            const text = String(entry?.text || '');
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (byCacheKey.has(cacheKey)) {
                continue;
            }

            byCacheKey.set(cacheKey, {
                type: this.getCacheType(),
                id: `plugin_nuun_save_verification_${byCacheKey.size}`,
                value: text,
                cacheKey,
            });
        }

        return Array.from(byCacheKey.values());
    }
}
