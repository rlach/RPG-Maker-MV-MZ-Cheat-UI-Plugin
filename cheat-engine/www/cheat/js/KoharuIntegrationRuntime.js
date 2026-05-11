/**
 * KoharuIntegrationRuntime – root-window backed singleton for Koharu integration.
 *
 * Mirrors TranslationRuntime / KnowledgeBaseRuntime pattern:
 *  - State rooted on the game (root) window via ensureRootWindowStateValue.
 *  - Cross-window notifications via root event bus.
 *  - Zero UI dependencies. Panels poll getSnapshot() or subscribe to events.
 *  - Vue never wraps this object — panels copy plain snapshots into their data().
 */

import {
    ensureRootWindowStateValue,
    notifyRootWindowEvent,
    subscribeRootWindowEvent,
} from './RootWindowState.js';
import { KeyValueStorage } from './KeyValueStorage.js';
import * as KoharuApi from './KoharuApiClient.js';
import { isSupportedImageFileName } from './ImageExporterRuntime.js';
import { ensureTranslationRuntime } from './translation-runtime/TranslationRuntime.js';

const ROOT_STATE_KEY = '__CheatKoharuIntegrationRuntime';
const RUNTIME_EVENT_NAME = 'cheat:koharu-runtime-updated';
const SETTINGS_FILE_PATH = './www/cheat-settings/koharu.json';

const CHEAT_ENGINE_TRANSLATOR_ID = 'cheat-engine';

// ---------------------------------------------------------------------------
// Settings defaults
// ---------------------------------------------------------------------------

function createDefaultSettings() {
    return {
        apiUrl: 'http://localhost:4000/api/v1',
        targetLanguage: '',
        projectId: '',
        projectName: '',
        selectedDetector: '',
        selectedFontDetector: '',
        selectedSegmenter: '',
        selectedBubbleSegmenter: '',
        selectedOcr: '',
        selectedTranslator: CHEAT_ENGINE_TRANSLATOR_ID,
        selectedInpainter: '',
        selectedRenderer: '',
        /** @type {Record<string, { pageId: string, fileName: string, relativePath: string }>} */
        pageIdMappings: {},
    };
}

// ---------------------------------------------------------------------------
// Pipeline step definitions
// ---------------------------------------------------------------------------

export const PIPELINE_STEPS = Object.freeze([
    { id: 'detect', label: 'Detect' },
    { id: 'ocr', label: 'OCR' },
    { id: 'gather-keys', label: 'Gather keys' },
    { id: 'translate', label: 'Translate' },
    { id: 'set-translations', label: 'Set translations in Koharu' },
    { id: 'render', label: 'Inpaint & Render' },
    { id: 'import', label: 'Import' },
]);

// ---------------------------------------------------------------------------
// Runtime class
// ---------------------------------------------------------------------------

class KoharuIntegrationRuntime {
    constructor() {
        this._storage = new KeyValueStorage(SETTINGS_FILE_PATH);
        this._settings = { ...createDefaultSettings(), ...this._loadSettings() };
        this._connected = false;
        this._engines = null;
        this._projects = [];
        this._operationId = '';
        this._runningStepId = '';
        this._stepProgress = { processed: 0, total: 0 };
        this._lastError = '';
        this._version = 0;
    }

    // -----------------------------------------------------------------------
    // Settings persistence
    // -----------------------------------------------------------------------

    _loadSettings() {
        try {
            const raw = this._storage.getAll();
            return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
        } catch (_error) {
            return {};
        }
    }

    _saveSettings() {
        try {
            this._storage.setAll(this._settings);
        } catch (error) {
            console.warn('[KoharuRuntime] Failed to save settings', error);
        }
    }

    getSetting(key) {
        return this._settings[key];
    }

    setSetting(key, value) {
        this._settings[key] = value;
        this._saveSettings();
        this._notify('setting-changed');
    }

    getSettings() {
        return { ...this._settings };
    }

    // -----------------------------------------------------------------------
    // Snapshot — UI reads this plain object, never the runtime itself
    // -----------------------------------------------------------------------

    getSnapshot() {
        return {
            connected: this._connected,
            engines: this._engines,
            projects: this._projects ? [...this._projects] : [],
            settings: { ...this._settings },
            operationId: this._operationId,
            runningStepId: this._runningStepId,
            stepProgress: { ...this._stepProgress },
            lastError: this._lastError,
            version: this._version,
        };
    }

    isConnected() {
        return this._connected;
    }

    isStepRunning() {
        return !!this._runningStepId;
    }

    getRunningStepId() {
        return this._runningStepId;
    }

    // -----------------------------------------------------------------------
    // Cross-window notifications
    // -----------------------------------------------------------------------

    _notify(reason = 'updated') {
        this._version += 1;
        notifyRootWindowEvent(RUNTIME_EVENT_NAME, {
            reason,
            version: this._version,
            timestamp: Date.now(),
        });
    }

    // -----------------------------------------------------------------------
    // Connection
    // -----------------------------------------------------------------------

    async refresh() {
        const baseUrl = this._settings.apiUrl;
        this._lastError = '';

        try {
            const connected = await KoharuApi.ping(baseUrl);
            this._connected = connected;

            if (!connected) {
                this._lastError = 'Koharu is off or address is different. Click refresh to retry.';
                this._engines = null;
                this._projects = [];
                this._notify('connection-failed');
                return;
            }

            await this._refreshEngines();
            await this._refreshProjects();
            this._applyDefaultEngineSelections();
            this._notify('refreshed');
        } catch (error) {
            this._connected = false;
            this._lastError = String(error?.message || error);
            this._notify('connection-failed');
        }
    }

    async _refreshEngines() {
        const baseUrl = this._settings.apiUrl;
        this._engines = await KoharuApi.getEngines(baseUrl);
    }

    async _refreshProjects() {
        const baseUrl = this._settings.apiUrl;
        const result = await KoharuApi.getProjects(baseUrl);
        this._projects = Array.isArray(result?.projects) ? result.projects : [];
    }

    _applyDefaultEngineSelections() {
        if (!this._engines) {
            return;
        }

        const applyDefault = (settingKey, engineArray) => {
            const list = Array.isArray(engineArray) ? engineArray : [];
            const current = this._settings[settingKey];
            const isCurrentValid = list.some((entry) => entry.id === current);
            if (!isCurrentValid && list.length > 0) {
                this._settings[settingKey] = list[0].id;
            }
        };

        applyDefault('selectedDetector', this._engines.detectors);
        applyDefault('selectedFontDetector', this._engines.fontDetectors);
        applyDefault('selectedSegmenter', this._engines.segmenters);
        applyDefault('selectedBubbleSegmenter', this._engines.bubbleSegmenters);
        applyDefault('selectedOcr', this._engines.ocr);
        applyDefault('selectedInpainter', this._engines.inpainters);
        applyDefault('selectedRenderer', this._engines.renderers);

        // Translator: validate against engine list + our cheat-engine option
        const translatorList = Array.isArray(this._engines.translators)
            ? this._engines.translators
            : [];
        const currentTranslator = this._settings.selectedTranslator;
        const isTranslatorValid =
            currentTranslator === CHEAT_ENGINE_TRANSLATOR_ID ||
            translatorList.some((entry) => entry.id === currentTranslator);
        if (!isTranslatorValid) {
            this._settings.selectedTranslator = CHEAT_ENGINE_TRANSLATOR_ID;
        }

        this._saveSettings();
    }

    // -----------------------------------------------------------------------
    // Project management
    // -----------------------------------------------------------------------

    getCurrentProject() {
        const projectId = this._settings.projectId;
        if (!projectId) {
            return null;
        }

        return this._projects.find((project) => project.id === projectId) || null;
    }

    hasValidProject() {
        return this.getCurrentProject() !== null;
    }

    getTargetImagePath() {
        const targetLang = this._settings.targetLanguage || 'en';
        if (!targetLang) {
            return '';
        }

        const nodeRequire = typeof globalThis.require === 'function' ? globalThis.require : null;
        if (!nodeRequire) {
            return '';
        }

        const runtime = ensureTranslationRuntime();
        if (!runtime || typeof runtime.getSplitCacheDirectoryPath !== 'function') {
            return '';
        }

        const path = nodeRequire('path');
        return path.join(runtime.getSplitCacheDirectoryPath(), 'img', targetLang);
    }

    countImagesInPath(dirPath) {
        const nodeRequire = typeof globalThis.require === 'function' ? globalThis.require : null;
        if (!nodeRequire || !dirPath) {
            return 0;
        }

        const fs = nodeRequire('fs');
        const path = nodeRequire('path');

        if (!fs.existsSync(dirPath)) {
            return 0;
        }

        let count = 0;
        const queue = [dirPath];
        while (queue.length > 0) {
            const currentDir = queue.shift();
            const entries = fs.readdirSync(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    queue.push(path.join(currentDir, entry.name));
                } else if (isSupportedImageFileName(entry.name)) {
                    count += 1;
                }
            }
        }

        return count;
    }

    async createProject(name) {
        const baseUrl = this._settings.apiUrl;
        const result = await KoharuApi.createProject(baseUrl, name);
        const projectId = result?.id || result?.project?.id || '';

        if (!projectId) {
            throw new Error('Koharu did not return a project id');
        }

        this._settings.projectId = projectId;
        this._settings.projectName = name;
        this._saveSettings();

        await this._refreshProjects();
        this._notify('project-created');

        return projectId;
    }

    async openCurrentProject() {
        const projectId = this._settings.projectId;
        if (!projectId) {
            throw new Error('No project configured');
        }

        await KoharuApi.openProject(this._settings.apiUrl, projectId);
    }

    // -----------------------------------------------------------------------
    // Page upload
    // -----------------------------------------------------------------------

    async uploadAllImages(sourceDirPath) {
        const nodeRequire = typeof globalThis.require === 'function' ? globalThis.require : null;
        if (!nodeRequire) {
            throw new Error('Filesystem API unavailable');
        }

        const fs = nodeRequire('fs');
        const path = nodeRequire('path');

        if (!sourceDirPath || !fs.existsSync(sourceDirPath)) {
            throw new Error(`Source directory does not exist: ${sourceDirPath}`);
        }

        const baseUrl = this._settings.apiUrl;

        // Collect all image files recursively
        const files = [];
        const queue = [sourceDirPath];
        while (queue.length > 0) {
            const currentDir = queue.shift();
            const entries = fs.readdirSync(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                if (entry.isDirectory()) {
                    queue.push(fullPath);
                } else if (entry.name.toLowerCase().endsWith('.png')) {
                    const relativePath = path.relative(sourceDirPath, fullPath).replace(/\\/g, '/');
                    files.push({ fullPath, relativePath, fileName: entry.name });
                }
            }
        }

        if (files.length <= 0) {
            throw new Error('No PNG images found in source directory');
        }

        // Upload in batches to avoid memory pressure
        const BATCH_SIZE = 10;
        const pageIdMappings = {};

        this._runningStepId = 'upload';
        this._stepProgress = { processed: 0, total: files.length };
        this._notify('upload-started');

        try {
            for (let offset = 0; offset < files.length; offset += BATCH_SIZE) {
                const batch = files.slice(offset, offset + BATCH_SIZE);
                const uploadPayload = batch.map((file) => ({
                    fileName: file.fileName,
                    buffer: fs.readFileSync(file.fullPath),
                }));

                const result = await KoharuApi.uploadPages(baseUrl, uploadPayload);
                const returnedPageIds = Array.isArray(result?.pages) ? result.pages : [];

                for (let index = 0; index < batch.length; index++) {
                    const file = batch[index];
                    const pageId = returnedPageIds[index] || '';
                    if (pageId) {
                        pageIdMappings[pageId] = {
                            pageId,
                            fileName: file.fileName,
                            relativePath: file.relativePath,
                        };
                    }
                }

                this._stepProgress.processed = Math.min(offset + batch.length, files.length);
                this._notify('upload-progress');
            }

            this._settings.pageIdMappings = pageIdMappings;
            this._saveSettings();
        } finally {
            this._runningStepId = '';
            this._stepProgress = { processed: 0, total: 0 };
            this._notify('upload-finished');
        }

        return { uploadedCount: files.length, pageIdMappings };
    }

    // -----------------------------------------------------------------------
    // Pipeline step execution
    // -----------------------------------------------------------------------

    _getAllPageIds() {
        const mappings = this._settings.pageIdMappings || {};
        return Object.keys(mappings);
    }

    async runDetect() {
        const steps = [
            this._settings.selectedDetector,
            this._settings.selectedSegmenter,
            this._settings.selectedBubbleSegmenter,
            this._settings.selectedFontDetector,
        ].filter(Boolean);

        return this._runKoharuPipeline('detect', steps);
    }

    async runOcr() {
        const steps = [this._settings.selectedOcr].filter(Boolean);
        return this._runKoharuPipeline('ocr', steps);
    }

    async runKoharuTranslate() {
        const steps = [this._settings.selectedTranslator].filter(Boolean);
        return this._runKoharuPipeline('translate', steps);
    }

    async runRender() {
        const steps = [this._settings.selectedInpainter, this._settings.selectedRenderer].filter(
            Boolean
        );

        return this._runKoharuPipeline('render', steps);
    }

    async _runKoharuPipeline(stepId, steps) {
        if (this._runningStepId) {
            throw new Error(`Step "${this._runningStepId}" is already running`);
        }

        const baseUrl = this._settings.apiUrl;
        const pages = this._getAllPageIds();
        const targetLanguage = this._settings.targetLanguage || 'en';

        this._runningStepId = stepId;
        this._operationId = '';
        this._stepProgress = { processed: 0, total: 0 };
        this._notify('step-started');

        try {
            const result = await KoharuApi.runPipeline(baseUrl, {
                steps,
                pages: pages.length > 0 ? pages : undefined,
                targetLanguage,
            });

            this._operationId = result?.operationId || result?.id || '';

            // Poll until completed
            await this._pollOperation(this._operationId);
        } finally {
            this._runningStepId = '';
            this._operationId = '';
            this._stepProgress = { processed: 0, total: 0 };
            this._notify('step-finished');
        }
    }

    async _pollOperation(operationId) {
        if (!operationId) {
            return;
        }

        const baseUrl = this._settings.apiUrl;
        const POLL_INTERVAL = 500;
        const MAX_POLLS = 3600; // 30 minutes max

        for (let pollCount = 0; pollCount < MAX_POLLS; pollCount++) {
            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));

            const result = await KoharuApi.getOperations(baseUrl);
            const operations = Array.isArray(result?.operations || result)
                ? result?.operations || result
                : [];

            const operation = operations.find(
                (op) => op.id === operationId || op.operationId === operationId
            );

            if (!operation) {
                // Operation not found, assume completed
                return;
            }

            const status = String(operation.status || '').toLowerCase();
            if (status === 'completed' || status === 'finished' || status === 'done') {
                return;
            }

            if (status === 'failed' || status === 'error' || status === 'cancelled') {
                throw new Error(
                    `Pipeline operation ${status}: ${operation.error || 'unknown error'}`
                );
            }

            // Update progress if available
            if (Number.isFinite(operation.progress) || Number.isFinite(operation.processed)) {
                this._stepProgress = {
                    processed: operation.processed || operation.progress || 0,
                    total: operation.total || operation.pageCount || 0,
                };
                this._notify('step-progress');
            }
        }

        throw new Error('Pipeline operation timed out');
    }

    async cancelCurrentOperation() {
        if (!this._operationId) {
            return;
        }

        try {
            await KoharuApi.cancelOperation(this._settings.apiUrl, this._operationId);
        } finally {
            this._runningStepId = '';
            this._operationId = '';
            this._stepProgress = { processed: 0, total: 0 };
            this._notify('step-cancelled');
        }
    }

    // -----------------------------------------------------------------------
    // Gather keys — extract text nodes from Koharu scene into our cache
    // -----------------------------------------------------------------------

    async gatherKeys() {
        if (this._runningStepId) {
            throw new Error(`Step "${this._runningStepId}" is already running`);
        }

        this._runningStepId = 'gather-keys';
        this._notify('step-started');

        try {
            const baseUrl = this._settings.apiUrl;
            const sceneData = await KoharuApi.getScene(baseUrl);
            const sceneRoot = sceneData?.scene || sceneData;
            const pages = sceneRoot?.pages || {};
            const textEntries = [];

            for (const [pageId, page] of Object.entries(pages)) {
                const nodes = page?.nodes || {};
                for (const [nodeId, node] of Object.entries(nodes)) {
                    const textKind = node?.kind?.text;
                    if (!textKind) {
                        continue;
                    }

                    const sourceText = String(textKind.text || '').trim();
                    if (!sourceText) {
                        continue;
                    }

                    textEntries.push({
                        pageId,
                        nodeId,
                        sourceText,
                        existingTranslation: textKind.translation || null,
                    });
                }
            }

            const translationRuntime = ensureTranslationRuntime();
            const addedCacheKeys = [];
            for (const entry of textEntries) {
                const cacheKey = translationRuntime.getCacheKey(entry.sourceText, 'koharu');
                if (translationRuntime.translationCache.has(cacheKey)) {
                    continue;
                }

                translationRuntime.setCacheValue(cacheKey, '', { persist: false });
                addedCacheKeys.push(cacheKey);
            }

            if (addedCacheKeys.length > 0) {
                translationRuntime.persistCache(addedCacheKeys);
            }

            this._stepProgress = { processed: textEntries.length, total: textEntries.length };
            this._notify('step-progress');

            return textEntries;
        } finally {
            this._runningStepId = '';
            this._notify('step-finished');
        }
    }

    // -----------------------------------------------------------------------
    // Set translations — push our translations into Koharu text nodes
    // -----------------------------------------------------------------------

    async setTranslations(translationsByKey) {
        if (this._runningStepId) {
            throw new Error(`Step "${this._runningStepId}" is already running`);
        }

        this._runningStepId = 'set-translations';
        this._notify('step-started');

        try {
            const baseUrl = this._settings.apiUrl;
            const sceneData = await KoharuApi.getScene(baseUrl);
            const pages = sceneData?.scene?.pages || {};

            const updates = [];
            for (const [pageId, page] of Object.entries(pages)) {
                const nodes = page?.nodes || {};
                for (const [nodeId, node] of Object.entries(nodes)) {
                    const textKind = node?.kind?.text;
                    if (!textKind) {
                        continue;
                    }

                    const sourceText = String(textKind.text || '').trim();
                    if (!sourceText) {
                        continue;
                    }

                    const translation = translationsByKey[sourceText];
                    if (!translation) {
                        continue;
                    }

                    updates.push({ pageId, nodeId, translation });
                }
            }

            this._stepProgress = { processed: 0, total: updates.length };
            this._notify('step-progress');

            for (let index = 0; index < updates.length; index++) {
                const update = updates[index];
                await KoharuApi.applyHistoryOp(baseUrl, {
                    updateNode: {
                        page: update.pageId,
                        id: update.nodeId,
                        patch: {
                            data: {
                                text: { translation: update.translation },
                            },
                        },
                    },
                });

                this._stepProgress.processed = index + 1;
                if ((index + 1) % 10 === 0 || index === updates.length - 1) {
                    this._notify('step-progress');
                }
            }

            return { updatedCount: updates.length };
        } finally {
            this._runningStepId = '';
            this._stepProgress = { processed: 0, total: 0 };
            this._notify('step-finished');
        }
    }

    // -----------------------------------------------------------------------
    // Import — download rendered images from Koharu, write to target folder
    // -----------------------------------------------------------------------

    async importRenderedImages() {
        if (this._runningStepId) {
            throw new Error(`Step "${this._runningStepId}" is already running`);
        }

        const nodeRequire = typeof globalThis.require === 'function' ? globalThis.require : null;
        if (!nodeRequire) {
            throw new Error('Filesystem API unavailable');
        }

        this._runningStepId = 'import';
        this._notify('step-started');

        try {
            const fs = nodeRequire('fs');
            const path = nodeRequire('path');
            const baseUrl = this._settings.apiUrl;
            const pageIdMappings = this._settings.pageIdMappings || {};
            const pageIds = Object.keys(pageIdMappings);

            if (pageIds.length <= 0) {
                throw new Error('No page mappings found. Upload images first.');
            }

            const targetDir = this.getTargetImagePath();
            if (!targetDir) {
                throw new Error(
                    'Target image path is not available. Check target language settings.'
                );
            }

            this._stepProgress = { processed: 0, total: pageIds.length };
            this._notify('step-progress');

            // Download one page at a time to avoid large ZIP in memory
            for (let index = 0; index < pageIds.length; index++) {
                const pageId = pageIds[index];
                const mapping = pageIdMappings[pageId];
                if (!mapping || !mapping.relativePath) {
                    continue;
                }

                try {
                    const response = await KoharuApi.exportRendered(baseUrl, {
                        format: 'rendered',
                        pages: [pageId],
                    });

                    const arrayBuffer = await response.arrayBuffer();
                    const BufferApi = Reflect.get(globalThis, 'Buffer');
                    const pngBuffer = BufferApi.from(arrayBuffer);

                    const targetFilePath = path.join(targetDir, mapping.relativePath);
                    fs.mkdirSync(path.dirname(targetFilePath), { recursive: true });
                    fs.writeFileSync(targetFilePath, pngBuffer);
                } catch (error) {
                    console.warn('[KoharuRuntime] Failed to import page', pageId, error);
                }

                this._stepProgress.processed = index + 1;
                if ((index + 1) % 5 === 0 || index === pageIds.length - 1) {
                    this._notify('step-progress');
                }
            }

            return { importedCount: this._stepProgress.processed };
        } finally {
            this._runningStepId = '';
            this._stepProgress = { processed: 0, total: 0 };
            this._notify('step-finished');
        }
    }

    // -----------------------------------------------------------------------
    // Orchestrated multi-step execution
    // -----------------------------------------------------------------------

    /**
     * Run selected steps sequentially.
     *
     * @param {string[]} stepIds — ordered array from PIPELINE_STEPS ids
     * @param {object} [callbacks]
     * @param {function} [callbacks.getTranslationsForKeys]
     * @param {function} [callbacks.runCheatEngineTranslation]
     */
    async runSteps(stepIds, callbacks = {}) {
        for (const stepId of stepIds) {
            switch (stepId) {
                case 'detect':
                    await this.runDetect();
                    break;
                case 'ocr':
                    await this.runOcr();
                    break;
                case 'gather-keys':
                    await this.gatherKeys();
                    break;
                case 'translate':
                    if (this._settings.selectedTranslator === CHEAT_ENGINE_TRANSLATOR_ID) {
                        // Cheat Engine translation is handled externally via callbacks
                        if (typeof callbacks.runCheatEngineTranslation === 'function') {
                            await callbacks.runCheatEngineTranslation();
                        }
                    } else {
                        await this.runKoharuTranslate();
                    }
                    break;
                case 'set-translations':
                    if (typeof callbacks.getTranslationsForKeys === 'function') {
                        const textEntries = await this.gatherKeys();
                        const keys = textEntries.map((entry) => entry.sourceText);
                        const translations = callbacks.getTranslationsForKeys(keys);
                        await this.setTranslations(translations);
                    }
                    break;
                case 'render':
                    await this.runRender();
                    break;
                case 'import':
                    await this.importRenderedImages();
                    break;
                default:
                    console.warn('[KoharuRuntime] Unknown step:', stepId);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Root-window singleton + event subscription
// ---------------------------------------------------------------------------

export function onKoharuRuntimeUpdated(handler) {
    if (typeof handler !== 'function') {
        return () => {};
    }

    return subscribeRootWindowEvent(RUNTIME_EVENT_NAME, handler);
}

export function ensureKoharuIntegrationRuntime() {
    return ensureRootWindowStateValue(ROOT_STATE_KEY, () => new KoharuIntegrationRuntime());
}

export { CHEAT_ENGINE_TRANSLATOR_ID };
