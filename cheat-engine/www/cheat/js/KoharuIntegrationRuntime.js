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

function createDefaultStepProgress() {
    return {
        processed: 0,
        total: 0,
        step: '',
        currentStepIndex: 0,
        totalSteps: 0,
        overallPercent: 0,
    };
}

// ---------------------------------------------------------------------------
// Pipeline step definitions
// ---------------------------------------------------------------------------

export const PIPELINE_STEPS = Object.freeze([
    { id: 'detect', label: 'Detect' },
    { id: 'segment', label: 'Segment' },
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
        this._stepProgress = createDefaultStepProgress();
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
        } catch (error) {
            if (error) {
                // Settings load should fail safely and fall back to defaults.
            }
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

    _collectPngFiles(sourceDirPath, fs, path) {
        const files = [];
        const queue = [sourceDirPath];

        while (queue.length > 0) {
            const currentDir = queue.shift();
            const entries = fs.readdirSync(currentDir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                if (entry.isDirectory()) {
                    queue.push(fullPath);
                    continue;
                }

                if (!entry.name.toLowerCase().endsWith('.png')) {
                    continue;
                }

                const relativePath = path.relative(sourceDirPath, fullPath).replaceAll('\\', '/');
                const relativeDir = path
                    .dirname(relativePath)
                    .replaceAll('\\', '/')
                    .replace(/^\.$/, '');

                files.push({
                    fullPath,
                    relativePath,
                    relativeDir,
                    fileName: entry.name,
                });
            }
        }

        return files;
    }

    _groupFilesByDirectory(files) {
        const grouped = new Map();

        for (const file of files) {
            const key = String(file?.relativeDir || '');
            if (!grouped.has(key)) {
                grouped.set(key, []);
            }

            grouped.get(key).push(file);
        }

        return Array.from(grouped.entries())
            .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
            .map(([, groupFiles]) => groupFiles);
    }

    _extractScenePageName(page) {
        const directName = typeof page?.name === 'string' ? page.name.trim() : '';
        if (directName) {
            return directName;
        }

        const nodes = page?.nodes && typeof page.nodes === 'object' ? page.nodes : {};
        for (const node of Object.values(nodes)) {
            const imageName = node?.kind?.image?.name;
            if (typeof imageName === 'string' && imageName.trim()) {
                return imageName.trim();
            }
        }

        return '';
    }

    async _resolveUploadedPageNames(baseUrl, uploadedPageIds) {
        const expectedIds = Array.from(
            new Set(
                (Array.isArray(uploadedPageIds) ? uploadedPageIds : [])
                    .map((id) => String(id || '').trim())
                    .filter(Boolean)
            )
        );

        if (expectedIds.length === 0) {
            return {};
        }

        const maxAttempts = 20;
        const delayMs = 150;

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            const sceneData = await KoharuApi.getScene(baseUrl);
            const sceneRoot = sceneData?.scene || sceneData;
            const pages = sceneRoot?.pages || {};

            const matchedById = {};
            for (const pageId of expectedIds) {
                const page = pages[pageId];
                if (!page) {
                    continue;
                }

                const pageName = this._extractScenePageName(page);
                if (!pageName) {
                    continue;
                }

                matchedById[pageId] = pageName;
            }

            if (Object.keys(matchedById).length === expectedIds.length) {
                return matchedById;
            }

            if (attempt < maxAttempts) {
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        }

        throw new Error('Koharu scene.json did not expose uploaded page metadata in time');
    }

    _buildPageMappingsForUploadedGroup(groupFiles, uploadedPageIds, pageNameById) {
        const idsByFileName = new Map();
        const safePageNameById =
            pageNameById && typeof pageNameById === 'object' ? pageNameById : {};

        for (const pageId of uploadedPageIds) {
            const safePageId = String(pageId || '').trim();
            if (!safePageId) {
                continue;
            }

            const name = String(safePageNameById[safePageId] || '').trim();
            if (!name) {
                continue;
            }

            if (!idsByFileName.has(name)) {
                idsByFileName.set(name, []);
            }
            idsByFileName.get(name).push(safePageId);
        }

        const mappings = {};
        for (const file of groupFiles) {
            const fileName = String(file?.fileName || '').trim();
            const candidates = idsByFileName.get(fileName) || [];

            if (candidates.length !== 1) {
                const details =
                    candidates.length === 0
                        ? 'no candidate id'
                        : `${candidates.length} candidate ids`;
                throw new Error(
                    `Failed mapping uploaded file "${fileName}" (${details}) in folder "${file.relativeDir || '.'}"`
                );
            }

            const pageId = candidates[0];
            mappings[pageId] = {
                pageId,
                fileName,
                relativePath: file.relativePath,
            };
        }

        return mappings;
    }

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

        const files = this._collectPngFiles(sourceDirPath, fs, path);

        if (files.length <= 0) {
            throw new Error('No PNG images found in source directory');
        }

        const groupedByDirectory = this._groupFilesByDirectory(files);
        const pageIdMappings = {};

        this._runningStepId = 'upload';
        this._stepProgress = {
            ...createDefaultStepProgress(),
            processed: 0,
            total: files.length,
        };
        this._notify('upload-started');

        try {
            let processedCount = 0;

            for (const fileGroup of groupedByDirectory) {
                const uploadPayload = fileGroup.map((file) => ({
                    fileName: file.fileName,
                    buffer: fs.readFileSync(file.fullPath),
                }));

                const result = await KoharuApi.uploadPages(baseUrl, uploadPayload);
                const uploadedPageIds = Array.isArray(result?.pages) ? result.pages : [];
                const pageNameById = await this._resolveUploadedPageNames(baseUrl, uploadedPageIds);
                const groupMappings = this._buildPageMappingsForUploadedGroup(
                    fileGroup,
                    uploadedPageIds,
                    pageNameById
                );

                for (const [pageId, mapping] of Object.entries(groupMappings)) {
                    pageIdMappings[pageId] = mapping;
                }

                processedCount += fileGroup.length;
                this._stepProgress.processed = Math.min(processedCount, files.length);
                this._notify('upload-progress');
            }

            this._settings.pageIdMappings = pageIdMappings;
            this._saveSettings();
        } finally {
            this._runningStepId = '';
            this._stepProgress = createDefaultStepProgress();
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
        const steps = [this._settings.selectedDetector].filter(Boolean);

        return this._runKoharuPipeline('detect', steps);
    }

    async runSegment() {
        const steps = [
            this._settings.selectedSegmenter,
            this._settings.selectedBubbleSegmenter,
            this._settings.selectedFontDetector,
        ].filter(Boolean);

        return this._runKoharuPipeline('segment', steps);
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
        this._stepProgress = createDefaultStepProgress();
        this._notify('step-started');

        try {
            const result = await KoharuApi.runPipeline(baseUrl, {
                steps,
                pages: pages.length > 0 ? pages : undefined,
                targetLanguage,
            });

            this._operationId = result?.operationId || result?.id || '';
            await this._waitForPipelineCompletionByEvents(this._operationId);
        } finally {
            this._runningStepId = '';
            this._operationId = '';
            this._stepProgress = createDefaultStepProgress();
            this._notify('step-finished');
        }
    }

    _extractPipelineStatus(payload) {
        const rawStatus = payload?.status;
        let statusText = '';
        if (typeof rawStatus === 'string') {
            statusText = rawStatus;
        } else if (typeof rawStatus?.status === 'string') {
            statusText = rawStatus.status;
        }

        return String(statusText || '')
            .trim()
            .toLowerCase();
    }

    _isTerminalSuccessStatus(status) {
        return status === 'completed' || status === 'finished' || status === 'done';
    }

    _isTerminalErrorStatus(status) {
        return status === 'failed' || status === 'error' || status === 'cancelled';
    }

    _applyPipelineProgressFromEvent(payload) {
        const processed = Number(payload?.currentPage) || 0;
        const total = Number(payload?.totalPages) || 0;
        const currentStepIndex = Number(payload?.currentStepIndex) || 0;
        const totalSteps = Number(payload?.totalSteps) || 0;
        const overallPercent = Number(payload?.overallPercent);
        const step = typeof payload?.step === 'string' ? payload.step : '';

        this._stepProgress = {
            ...createDefaultStepProgress(),
            processed,
            total,
            step,
            currentStepIndex,
            totalSteps,
            overallPercent: Number.isFinite(overallPercent) ? overallPercent : 0,
        };
        this._notify('step-progress');
    }

    async _waitForPipelineCompletionByEvents(operationId) {
        const baseUrl = this._settings.apiUrl;

        if (typeof KoharuApi.subscribeEvents !== 'function') {
            await this._pollOperation(operationId);
            return;
        }

        await new Promise((resolve, reject) => {
            const timeoutMs = 30 * 60 * 1000;
            const expectedId = String(operationId || '').trim();
            let activeJobId = '';
            let settled = false;

            let unsubscribe = () => {};
            const timeoutId = setTimeout(() => {
                finish(
                    reject,
                    new Error('Pipeline operation timed out while waiting for event stream')
                );
            }, timeoutMs);

            const cleanup = () => {
                clearTimeout(timeoutId);
                unsubscribe();
            };

            const finish = (handler, payload) => {
                if (settled) {
                    return;
                }
                settled = true;
                cleanup();
                handler(payload);
            };

            const isMatchingPipelineJob = (payloadJobId) => {
                const safePayloadJobId = String(payloadJobId || '').trim();
                if (!safePayloadJobId) {
                    return false;
                }

                if (activeJobId) {
                    return safePayloadJobId === activeJobId;
                }

                if (expectedId && safePayloadJobId === expectedId) {
                    activeJobId = safePayloadJobId;
                    return true;
                }

                activeJobId = safePayloadJobId;
                return true;
            };

            const handlePayload = (payload) => {
                const eventName = String(payload?.event || '').trim();
                if (!eventName) {
                    return;
                }

                if (eventName === 'jobStarted') {
                    const startedKind = String(payload?.kind || '')
                        .trim()
                        .toLowerCase();
                    if (startedKind !== 'pipeline') {
                        return;
                    }

                    const startedId = payload?.jobId || payload?.id;
                    isMatchingPipelineJob(startedId);
                    return;
                }

                if (eventName === 'jobProgress') {
                    const progressJobId = payload?.jobId || payload?.id;
                    if (!isMatchingPipelineJob(progressJobId)) {
                        return;
                    }

                    this._applyPipelineProgressFromEvent(payload);

                    const status = this._extractPipelineStatus(payload);
                    if (this._isTerminalSuccessStatus(status)) {
                        finish(resolve);
                        return;
                    }

                    if (this._isTerminalErrorStatus(status)) {
                        finish(reject, new Error(`Pipeline operation ${status}`));
                    }
                    return;
                }

                if (
                    eventName === 'jobFinished' ||
                    eventName === 'jobCompleted' ||
                    eventName === 'jobFailed' ||
                    eventName === 'jobCancelled'
                ) {
                    const finalJobId = payload?.jobId || payload?.id;
                    if (!isMatchingPipelineJob(finalJobId)) {
                        return;
                    }

                    const status = this._extractPipelineStatus(payload) || eventName.toLowerCase();
                    if (
                        eventName === 'jobCompleted' ||
                        eventName === 'jobFinished' ||
                        this._isTerminalSuccessStatus(status)
                    ) {
                        finish(resolve);
                        return;
                    }

                    const reason = payload?.error || status || 'unknown error';
                    finish(reject, new Error(`Pipeline operation failed: ${reason}`));
                }
            };

            try {
                unsubscribe = KoharuApi.subscribeEvents(baseUrl, {
                    onEvent: handlePayload,
                    onError: (error) => {
                        finish(
                            reject,
                            new Error(
                                `Koharu event stream error: ${String(error?.message || error)}`
                            )
                        );
                    },
                });
            } catch (error) {
                finish(reject, error);
            }
        });
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
            this._stepProgress = createDefaultStepProgress();
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
            this._stepProgress = createDefaultStepProgress();
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
            const sceneRoot = sceneData?.scene || sceneData;
            const pages = sceneRoot?.pages || {};

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

            this._stepProgress = {
                ...createDefaultStepProgress(),
                processed: 0,
                total: updates.length,
            };
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
            this._stepProgress = createDefaultStepProgress();
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

            this._stepProgress = {
                ...createDefaultStepProgress(),
                processed: 0,
                total: pageIds.length,
            };
            this._notify('step-progress');

            // Download one page at a time to avoid large ZIP in memory
            for (let index = 0; index < pageIds.length; index++) {
                const pageId = pageIds[index];
                const mapping = pageIdMappings[pageId];
                if (!mapping?.relativePath) {
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
            this._stepProgress = createDefaultStepProgress();
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
                case 'segment':
                    await this.runSegment();
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
