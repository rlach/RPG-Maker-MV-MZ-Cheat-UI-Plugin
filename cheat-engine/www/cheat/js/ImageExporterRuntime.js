import {
    ensureRootWindowStateValue,
    notifyRootWindowEvent,
    subscribeRootWindowEvent,
} from './RootWindowState.js';
import { isRpgMakerMv } from './RpgMakerRuntime.js';

const ROOT_RUNTIME_KEY = '__CheatImageExporterRuntime';
const ROOT_STATE_KEY = '__CheatImageExporterState';
const RUNTIME_EVENT_NAME = 'cheat:image-exporter-runtime-updated';

function toPosixPath(value) {
    return String(value || '').replace(/\\/g, '/');
}

function normalizeFolderId(value) {
    return toPosixPath(value).replace(/^\/+/, '').replace(/\/+$/, '');
}

function normalizeSelectedFolders(selectedFolders) {
    if (!Array.isArray(selectedFolders)) {
        return [];
    }

    const uniqueFolders = new Set();
    for (const value of selectedFolders) {
        const normalized = normalizeFolderId(value);
        if (normalized) {
            uniqueFolders.add(normalized);
        }
    }

    return Array.from(uniqueFolders);
}

function createDefaultState() {
    return {
        inProgress: false,
        sourceRoot: '',
        cacheRoot: '',
        targetLang: '',
        selectedFolders: [],
        totalCount: 0,
        processedCount: 0,
        failedCount: 0,
        startedAt: 0,
        finishedAt: 0,
        updatedAt: Date.now(),
        lastProgressAt: 0,
        errorMessage: '',
        version: 0,
    };
}

function ensureImageExporterState() {
    return ensureRootWindowStateValue(ROOT_STATE_KEY, () => createDefaultState());
}

function patchImageExporterState(patch, reason = 'updated') {
    const state = ensureImageExporterState();
    Object.assign(state, patch);
    state.updatedAt = Date.now();
    state.version = Number.isFinite(state.version) ? state.version + 1 : 1;

    notifyRootWindowEvent(RUNTIME_EVENT_NAME, {
        reason,
        version: state.version,
        timestamp: state.updatedAt,
    });
}

export function isSupportedImageFileName(fileName) {
    const lowerName = String(fileName || '').toLowerCase();
    return (
        lowerName.endsWith('.png') || lowerName.endsWith('.png_') || lowerName.endsWith('.rpgmvp')
    );
}

export function toLogicalRelativePath(relativeFilePath) {
    return toPosixPath(relativeFilePath).replace(/(\.png_|\.rpgmvp|\.png)$/i, '');
}

function toLogicalRelativeDirectory(relativeLogicalPath) {
    const nodeRequire = globalThis && globalThis.require;
    const path = typeof nodeRequire === 'function' ? nodeRequire('path') : null;
    if (!path) {
        const normalized = toPosixPath(relativeLogicalPath);
        const lastSlashIndex = normalized.lastIndexOf('/');
        return lastSlashIndex >= 0 ? normalized.slice(0, lastSlashIndex) : '';
    }

    return toPosixPath(path.dirname(relativeLogicalPath)).replace(/^\.$/, '');
}

export function buildExportPlanFromSourceFiles(sourceFiles, selectedFolders) {
    const selectedFolderSet = new Set(normalizeSelectedFolders(selectedFolders));
    const plan = [];

    for (const relativeFilePath of Array.isArray(sourceFiles) ? sourceFiles : []) {
        const logicalRelativePath = toLogicalRelativePath(relativeFilePath);
        const relativeDirectoryPath = toLogicalRelativeDirectory(logicalRelativePath);

        if (!selectedFolderSet.has(relativeDirectoryPath)) {
            continue;
        }

        plan.push({
            relativeFilePath,
            logicalRelativePath,
            relativeDirectoryPath,
        });
    }

    return plan;
}

class ImageExporterRuntime {
    getNodeRequire() {
        const nodeRequire = globalThis && globalThis.require;
        return typeof nodeRequire === 'function' ? nodeRequire : null;
    }

    getImageRootAbsolutePath() {
        const nodeRequire = this.getNodeRequire();
        if (!nodeRequire) {
            return '';
        }

        const path = nodeRequire('path');
        const nodeProcess = globalThis && globalThis.process;
        const cwd = nodeProcess && typeof nodeProcess.cwd === 'function' ? nodeProcess.cwd() : '.';

        return isRpgMakerMv() ? path.join(cwd, 'www', 'img') : path.join(cwd, 'img');
    }

    getStatus() {
        const state = ensureImageExporterState();
        return {
            ...state,
            selectedFolders: Array.isArray(state.selectedFolders) ? [...state.selectedFolders] : [],
        };
    }

    isExportInProgress() {
        return !!ensureImageExporterState().inProgress;
    }

    collectSourceImageFiles(rootPath) {
        const nodeRequire = this.getNodeRequire();
        if (!nodeRequire) {
            return [];
        }

        const fs = nodeRequire('fs');
        const path = nodeRequire('path');
        const queue = [rootPath];
        const relFiles = [];

        while (queue.length > 0) {
            const currentDir = queue.shift();
            const entries = fs.readdirSync(currentDir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                if (entry.isDirectory()) {
                    queue.push(fullPath);
                    continue;
                }

                if (!isSupportedImageFileName(entry.name)) {
                    continue;
                }

                relFiles.push(toPosixPath(path.relative(rootPath, fullPath)));
            }
        }

        return relFiles;
    }

    encodeRelativeLogicalPath(relativePath) {
        const safePath = toPosixPath(relativePath || '');
        const runtimeUtils =
            typeof globalThis !== 'undefined' ? Reflect.get(globalThis, 'Utils') : null;
        const encodePart =
            runtimeUtils &&
            (typeof runtimeUtils === 'object' || typeof runtimeUtils === 'function') &&
            typeof runtimeUtils.encodeURI === 'function'
                ? (part) => runtimeUtils.encodeURI(part)
                : (part) => encodeURIComponent(part);

        return safePath
            .split('/')
            .filter((part) => part !== '')
            .map((part) => encodePart(part))
            .join('/');
    }

    loadBitmapByUrl(url) {
        return new Promise((resolve, reject) => {
            const BitmapApi =
                typeof globalThis !== 'undefined' ? Reflect.get(globalThis, 'Bitmap') : null;
            if (!BitmapApi || typeof BitmapApi.load !== 'function') {
                reject(new Error('Bitmap API is unavailable'));
                return;
            }

            let settled = false;
            const bitmap = BitmapApi.load(url);
            const settle = (kind, value) => {
                if (settled) {
                    return;
                }
                settled = true;
                clearInterval(pollTimer);
                clearTimeout(timeoutTimer);
                if (kind === 'resolve') {
                    resolve(value);
                } else {
                    reject(value);
                }
            };

            const tryResolve = () => {
                if (bitmap && typeof bitmap.isReady === 'function' && bitmap.isReady()) {
                    settle('resolve', bitmap);
                    return true;
                }
                if (bitmap && typeof bitmap.isError === 'function' && bitmap.isError()) {
                    settle('reject', new Error(`Bitmap failed to load: ${url}`));
                    return true;
                }
                return false;
            };

            if (tryResolve()) {
                return;
            }

            if (bitmap && typeof bitmap.addLoadListener === 'function') {
                bitmap.addLoadListener(() => {
                    settle('resolve', bitmap);
                });
            }

            const pollTimer = setInterval(() => {
                tryResolve();
            }, 50);

            const timeoutTimer = setTimeout(() => {
                settle('reject', new Error(`Bitmap load timeout: ${url}`));
            }, 30000);
        });
    }

    bitmapToPngBuffer(bitmap) {
        const width = Number(bitmap?.width) || Number(bitmap?._image?.width) || 0;
        const height = Number(bitmap?.height) || Number(bitmap?._image?.height) || 0;
        if (width <= 0 || height <= 0) {
            throw new Error('Bitmap has invalid dimensions');
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error('Canvas context unavailable');
        }

        if (bitmap._canvas) {
            context.drawImage(bitmap._canvas, 0, 0);
        } else if (bitmap._image) {
            context.drawImage(bitmap._image, 0, 0);
        } else {
            throw new Error('Bitmap source image not available');
        }

        const dataUrl = canvas.toDataURL('image/png');
        const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
        const BufferApi =
            typeof globalThis !== 'undefined' ? Reflect.get(globalThis, 'Buffer') : null;
        if (!BufferApi || typeof BufferApi.from !== 'function') {
            throw new Error('Buffer API unavailable');
        }

        return BufferApi.from(base64, 'base64');
    }

    async startExport({ sourceRoot, cacheRoot, selectedFolders, targetLang = '' }) {
        const nodeRequire = this.getNodeRequire();
        if (!nodeRequire) {
            throw new Error('Filesystem API unavailable in this environment');
        }

        const fs = nodeRequire('fs');
        const path = nodeRequire('path');
        const normalizedSelectedFolders = normalizeSelectedFolders(selectedFolders);

        if (!sourceRoot || !fs.existsSync(sourceRoot)) {
            throw new Error('Image source directory does not exist');
        }

        if (!cacheRoot) {
            throw new Error('Image export cache directory is unavailable');
        }

        if (normalizedSelectedFolders.length <= 0) {
            throw new Error('Select at least one folder');
        }

        if (this.isExportInProgress()) {
            return {
                started: false,
                reason: 'already-running',
                status: this.getStatus(),
            };
        }

        const sourceFiles = this.collectSourceImageFiles(sourceRoot);
        const exportPlan = buildExportPlanFromSourceFiles(sourceFiles, normalizedSelectedFolders);

        patchImageExporterState(
            {
                inProgress: true,
                sourceRoot: toPosixPath(sourceRoot),
                cacheRoot: toPosixPath(cacheRoot),
                targetLang: String(targetLang || ''),
                selectedFolders: normalizedSelectedFolders,
                totalCount: exportPlan.length,
                processedCount: 0,
                failedCount: 0,
                startedAt: Date.now(),
                finishedAt: 0,
                lastProgressAt: Date.now(),
                errorMessage: '',
            },
            'started'
        );

        let processedCount = 0;
        let failedCount = 0;
        let lastProgressUpdateAt = Date.now();

        try {
            fs.mkdirSync(cacheRoot, { recursive: true });

            for (const item of exportPlan) {
                const logicalUrl = `img/${this.encodeRelativeLogicalPath(item.logicalRelativePath)}.png`;

                try {
                    const bitmap = await this.loadBitmapByUrl(logicalUrl);
                    const pngBuffer = this.bitmapToPngBuffer(bitmap);
                    const targetFilePath = path.join(cacheRoot, `${item.logicalRelativePath}.png`);
                    fs.mkdirSync(path.dirname(targetFilePath), { recursive: true });
                    fs.writeFileSync(targetFilePath, pngBuffer);
                    processedCount += 1;

                    if (bitmap && typeof bitmap.destroy === 'function') {
                        bitmap.destroy();
                    }
                } catch (error) {
                    failedCount += 1;
                    console.warn('[ImageExporterRuntime] Failed to decode image', {
                        relativeFilePath: item.relativeFilePath,
                        logicalUrl,
                        error,
                    });
                }

                const now = Date.now();
                if (now - lastProgressUpdateAt >= 1000) {
                    lastProgressUpdateAt = now;
                    patchImageExporterState(
                        {
                            processedCount,
                            failedCount,
                            lastProgressAt: now,
                        },
                        'progress'
                    );
                }
            }

            patchImageExporterState(
                {
                    inProgress: false,
                    processedCount,
                    failedCount,
                    finishedAt: Date.now(),
                    lastProgressAt: Date.now(),
                },
                'completed'
            );

            return {
                started: true,
                processedCount,
                failedCount,
                totalCount: exportPlan.length,
            };
        } catch (error) {
            const errorMessage =
                error && typeof error === 'object' && 'message' in error
                    ? String(error.message)
                    : String(error);

            patchImageExporterState(
                {
                    inProgress: false,
                    processedCount,
                    failedCount,
                    finishedAt: Date.now(),
                    lastProgressAt: Date.now(),
                    errorMessage,
                },
                'failed'
            );

            throw error;
        }
    }
}

export function onImageExporterRuntimeUpdated(handler) {
    if (typeof handler !== 'function') {
        return () => {};
    }

    ensureImageExporterState();
    return subscribeRootWindowEvent(RUNTIME_EVENT_NAME, handler);
}

export function ensureImageExporterRuntime() {
    return ensureRootWindowStateValue(ROOT_RUNTIME_KEY, () => new ImageExporterRuntime());
}
