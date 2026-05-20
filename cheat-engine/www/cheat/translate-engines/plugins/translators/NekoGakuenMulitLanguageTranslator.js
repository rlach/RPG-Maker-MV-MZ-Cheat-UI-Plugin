import { TAG_BRACKET, TAG_TYPE } from '../../ai-engine/constants.js';
import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/**
 * NekoGakuen_MulitLanguage translator.
 *
 * Plugin: NekoGakuen_MulitLanguage.js
 * Supported versions:
 * - v1.8.4 (MV/MZ): CSV-based multilingual string lookup through !Say / \Say[]
 *
 * Notes:
 * - Source texts are selected from CSV column headers using current cheat runtime
 *   source language (runtime.sourceLang).
 * - Language alias mapping includes ja -> jp to match this plugin's header naming.
 * - If source language header is not found, translator falls back to the first
 *   text column (index >= 1).
 */

const CACHE_TYPE = 'plugin_neko_mulit_language';
const LANGUAGE_LIST_PARAM = 'Lancsv List';
const CSV_PATH_PARAM = 'Lancsv Path';

const PLUGIN_TAGS = [
    {
        description: 'Is replaced with custom text from csv.',
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        tagSymbol: 'SAY',
        bracket: TAG_BRACKET.SQUARE,
        maskValue: true,
        requiredConsistency: true,
        alwaysTranslate: false,
        alwaysAddToKnowledgeBase: false,
    },
];

function normalizeHeader(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replaceAll('-', '_');
}

function parseCsvRow(line) {
    const row = [];
    let current = '';
    let inQuotes = false;

    for (let index = 0; index < line.length; index++) {
        const char = line[index];

        if (char === '"') {
            const next = line[index + 1];
            if (inQuotes && next === '"') {
                current += '"';
                index += 1;
                continue;
            }

            inQuotes = !inQuotes;
            continue;
        }

        if (char === ',' && !inQuotes) {
            row.push(current.trim());
            current = '';
            continue;
        }

        current += char;
    }

    row.push(current.trim());
    return row;
}

export class NekoGakuenMulitLanguageTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
        this._runtimeLookupSourceLang = '';
        this._runtimeLookupByKey = new Map();
    }

    getPluginName() {
        return 'NekoGakuen_MulitLanguage';
    }

    getPluginLabel() {
        return 'NekoGakuen MulitLanguage';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    async precomputeCounts(context = {}) {
        if (!this.ensureDetection()) {
            return;
        }

        if (this._scanPrepared) {
            return;
        }

        if (this._scanPromise) {
            return this._scanPromise;
        }

        this._scanPromise = Promise.resolve(this.buildScanEntries(context))
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[NekoGakuenMulitLanguageTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries(context = {}) {
        const pluginEntry = this.findPluginEntry(this.getPluginName());
        const parameters = pluginEntry?.parameters || null;
        const csvPaths = this.extractCsvPaths(parameters);
        if (csvPaths.length === 0) {
            return [];
        }

        const runtime = context?.runtime || this.getRuntime();
        const entries = [];
        for (const csvPath of csvPaths) {
            const csvText = this.loadCsvText(csvPath);
            if (!this.isUsableText(csvText)) {
                continue;
            }

            const fileEntries = this.buildScanEntriesFromCsv(csvText, csvPath, runtime);
            if (fileEntries.length > 0) {
                entries.push(...fileEntries);
            }
        }

        return entries;
    }

    extractCsvPaths(parameters) {
        if (!parameters || typeof parameters !== 'object') {
            return [];
        }

        const parsedList = parseJsonSafely(parameters[LANGUAGE_LIST_PARAM], []);
        if (!Array.isArray(parsedList)) {
            return [];
        }

        const paths = [];
        for (const item of parsedList) {
            const parsedItem = parseJsonSafely(item, null);
            const csvPath = String(parsedItem?.[CSV_PATH_PARAM] || '').trim();
            if (!this.isUsableText(csvPath) || paths.includes(csvPath)) {
                continue;
            }

            paths.push(csvPath);
        }

        return paths;
    }

    loadCsvText(csvPath) {
        const pathValue = String(csvPath || '').trim();
        if (!this.isUsableText(pathValue)) {
            return '';
        }

        if (typeof Utils !== 'undefined' && Utils.isNwjs()) {
            try {
                const fs = require('fs');
                const path = require('path');
                const mainModuleFilename = process.mainModule?.filename || process.argv?.[1] || '';
                const base =
                    typeof Utils.isElectronjs === 'function' && Utils.isElectronjs()
                        ? path.dirname(__filename)
                        : path.dirname(mainModuleFilename);
                const absolutePath = path.join(base, pathValue);
                if (fs.existsSync(absolutePath)) {
                    return String(fs.readFileSync(absolutePath, 'utf8') || '');
                }
            } catch (error) {
                console.warn(
                    `[NekoGakuenMulitLanguageTranslator] Failed to load CSV via fs: ${pathValue}`,
                    error
                );
            }
        }

        try {
            const request = new XMLHttpRequest();
            request.open('GET', pathValue, false);
            request.send(null);
            if (request.readyState === 4 && request.status === 200) {
                return String(request.responseText || '');
            }
        } catch (error) {
            console.warn(
                `[NekoGakuenMulitLanguageTranslator] Failed to load CSV via XMLHttpRequest: ${pathValue}`,
                error
            );
        }

        return '';
    }

    getSourceHeaderCandidates(runtime) {
        const sourceLang = normalizeHeader(runtime?.sourceLang);
        if (!sourceLang) {
            return [];
        }

        const candidates = [sourceLang];
        if (sourceLang.includes('_')) {
            candidates.push(sourceLang.replaceAll('_', '-'));
        }
        if (sourceLang.includes('-')) {
            candidates.push(sourceLang.replaceAll('-', '_'));
        }

        if (sourceLang === 'ja') {
            candidates.push('jp');
        }
        if (sourceLang === 'jp') {
            candidates.push('ja');
        }

        return Array.from(new Set(candidates));
    }

    resolveSourceColumnIndex(headers, runtime) {
        const candidates = this.getSourceHeaderCandidates(runtime);
        const normalizedHeaders = headers.map((header) => normalizeHeader(header));

        for (const candidate of candidates) {
            const index = normalizedHeaders.indexOf(candidate);
            if (index >= 1) {
                return index;
            }
        }

        for (let index = 1; index < headers.length; index++) {
            if (this.isUsableText(headers[index])) {
                return index;
            }
        }

        return -1;
    }

    resolveRowSourceText(row, sourceColumnIndex) {
        if (sourceColumnIndex >= 1 && this.isUsableText(row[sourceColumnIndex])) {
            return row[sourceColumnIndex];
        }

        for (let index = 1; index < row.length; index++) {
            if (this.isUsableText(row[index])) {
                return row[index];
            }
        }

        return '';
    }

    buildScanEntriesFromCsv(csvText, csvPath, runtime) {
        const normalizedText = String(csvText || '')
            .replace(/^\uFEFF/, '')
            .replaceAll('\r\n', '\n')
            .replaceAll('\r', '\n');
        const lines = normalizedText.split('\n').filter((line) => line.trim() !== '');
        if (lines.length < 2) {
            return [];
        }

        const headers = parseCsvRow(lines[0]);
        const sourceColumnIndex = this.resolveSourceColumnIndex(headers, runtime);
        if (sourceColumnIndex < 1) {
            return [];
        }

        const entries = [];
        for (let lineIndex = 1; lineIndex < lines.length; lineIndex++) {
            const row = parseCsvRow(lines[lineIndex]);
            const text = this.resolveRowSourceText(row, sourceColumnIndex);
            if (!this.isUsableText(text)) {
                continue;
            }

            entries.push({
                text,
                source: {
                    csvPath,
                    lineIndex,
                    key: String(row[0] || '').trim(),
                    sourceColumnIndex,
                },
            });
        }

        return entries;
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = entry?.text;
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (byCacheKey.has(cacheKey)) {
                continue;
            }

            byCacheKey.set(cacheKey, {
                type: this.getCacheType(),
                id: `plugin_neko_mulit_language_${byCacheKey.size}`,
                value: text,
                cacheKey,
            });
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

    resolveCachedText(sourceText) {
        if (!this.isUsableText(sourceText)) {
            return sourceText;
        }

        return this.resolveRuntimeTranslation(sourceText, this.getRuntime(), this.getCacheType(), {
            requireRuntimeTranslationActive: true,
            missValue: sourceText,
        });
    }

    normalizeSayKey(value) {
        return String(value || '')
            .trim()
            .replaceAll(/^<|>$/g, '');
    }

    ensureRuntimeLookupPrepared(runtime = this.getRuntime()) {
        const sourceLang = normalizeHeader(runtime?.sourceLang);
        if (this._runtimeLookupByKey.size > 0 && this._runtimeLookupSourceLang === sourceLang) {
            return;
        }

        const entries = this.buildScanEntries({ runtime });
        const byKey = new Map();
        for (const entry of entries) {
            const key = this.normalizeSayKey(entry?.source?.key);
            const text = String(entry?.text || '').trim();
            if (!this.isUsableText(key) || !this.isUsableText(text) || byKey.has(key)) {
                continue;
            }

            byKey.set(key, text);
        }

        this._runtimeLookupSourceLang = sourceLang;
        this._runtimeLookupByKey = byKey;
    }

    resolveSayTagToTranslatedText(rawArgs, runtime) {
        const args = String(rawArgs || '').split(',');
        const key = this.normalizeSayKey(args[0]);
        if (!this.isUsableText(key)) {
            return null;
        }

        this.ensureRuntimeLookupPrepared(runtime);
        const sourceText = this._runtimeLookupByKey.get(key);
        if (!this.isUsableText(sourceText)) {
            return null;
        }

        return this.resolveCachedText(sourceText);
    }

    replaceSayTagsInText(text, runtime) {
        const input = String(text || '');
        if (!this.isUsableText(input)) {
            return input;
        }

        // Match both literal backslash (\Say[...]) and the actual 0x1B escape character
        // (\x1bSay[...]) that RPG Maker inserts when it pre-processes the text.
        // RegExp is built dynamically to avoid a literal ESC control char in a regex literal
        // (which some linters and editors flag as a control character violation).
        const SAY_TAG_RE = new RegExp(
            String.raw`[\\]Say\[([^\]]*?)\]|` + String.fromCodePoint(0x1b) + String.raw`Say\[([^\]]*?)\]`,
            'gi'
        );
        return input.replace(SAY_TAG_RE, (match, p1, p2) => {
            const translated = this.resolveSayTagToTranslatedText(p1 ?? p2, runtime);
            return this.isUsableText(translated) ? translated : match;
        });
    }

    tryTranslateBangSayText(text, runtime) {
        const input = String(text || '').trim();
        if (!this.isUsableText(input)) {
            return null;
        }

        const commandMatch = /^!Say\s+(.+)$/i.exec(input);
        if (!commandMatch) {
            return null;
        }

        const translated = this.resolveSayTagToTranslatedText(commandMatch[1], runtime);
        return this.isUsableText(translated) ? translated : null;
    }

    enablePluginTranslation() {
        if (typeof PluginManager?.convText !== 'function') {
            console.log('[NekoGakuenMulitLanguageTranslator] PluginManager.convText not found');
            return false;
        }

        if (typeof Window_Base?.prototype?.convertEscapeCharacters !== 'function') {
            console.log(
                '[NekoGakuenMulitLanguageTranslator] Window_Base.convertEscapeCharacters not found'
            );
            return false;
        }

        if (typeof Game_Interpreter?.prototype?.checkTextByData !== 'function') {
            console.log(
                '[NekoGakuenMulitLanguageTranslator] Game_Interpreter.checkTextByData not found'
            );
            return false;
        }

        this.registerPluginCustomTags(PLUGIN_TAGS);
        const replaceSayTagsInText = this.replaceSayTagsInText.bind(this);
        const tryTranslateBangSayText = this.tryTranslateBangSayText.bind(this);
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);

        const originalConvText = PluginManager.convText;
        PluginManager.convText = function () {
            const runtime = getRuntime();
            if (!isRuntimeTranslationActive(runtime)) {
                return originalConvText.apply(this, arguments);
            }

            const translatedBangSay = tryTranslateBangSayText(arguments[0], runtime);
            if (translatedBangSay !== null) {
                return translatedBangSay;
            }

            // Not a !Say command: pass through unchanged. Never call resolveCachedText
            // on arbitrary game strings (item names, skill types, etc.) — that would
            // harvest those strings as spurious cache keys.
            return originalConvText.apply(this, arguments);
        };

        const originalConvertEscapeCharacters = Window_Base.prototype.convertEscapeCharacters;
        Window_Base.prototype.convertEscapeCharacters = function () {
            const runtime = getRuntime();
            if (!isRuntimeTranslationActive(runtime)) {
                return originalConvertEscapeCharacters.apply(this, arguments);
            }

            if (arguments.length > 0) {
                arguments[0] = replaceSayTagsInText(arguments[0], runtime);
            }

            // Do NOT call resolveCachedText on the output. convertEscapeCharacters is
            // called on every render frame during letter-by-letter text animation;
            // post-processing its output would harvest partial/translated text as cache keys.
            return originalConvertEscapeCharacters.apply(this, arguments);
        };

        const originalCheckTextByData = Game_Interpreter.prototype.checkTextByData;
        Game_Interpreter.prototype.checkTextByData = function () {
            const runtime = getRuntime();
            if (!isRuntimeTranslationActive(runtime)) {
                return originalCheckTextByData.apply(this, arguments);
            }

            if (arguments.length > 0) {
                arguments[0] = replaceSayTagsInText(arguments[0], runtime);
            }

            return originalCheckTextByData.apply(this, arguments);
        };

        return true;
    }
}
