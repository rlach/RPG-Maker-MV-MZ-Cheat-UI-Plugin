import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';

vi.mock('../../../../../cheat-engine/www/cheat/js/KoharuApiClient.js', () => ({
    uploadPages: vi.fn(),
    getScene: vi.fn(),
    ping: vi.fn(async () => true),
    getEngines: vi.fn(async () => ({})),
    getProjects: vi.fn(async () => ({ projects: [] })),
    createProject: vi.fn(),
    openProject: vi.fn(),
    runPipeline: vi.fn(),
    getOperations: vi.fn(),
    cancelOperation: vi.fn(),
    applyHistoryOp: vi.fn(),
    exportRendered: vi.fn(),
    subscribeEvents: vi.fn(),
}));

vi.mock('../../../../../cheat-engine/www/cheat/js/translation-runtime/TranslationRuntime.js', () => ({
    ensureTranslationRuntime: vi.fn(() => ({
        getSplitCacheDirectoryPath: () => './www/cheat-settings/translate-cache',
    })),
}));

vi.mock('../../../../../cheat-engine/www/cheat/js/KeyValueStorage.js', () => {
    class KeyValueStorageMock {
        constructor() {
            this._data = {};
        }

        getAll() {
            return { ...this._data };
        }

        setAll(data) {
            this._data = data && typeof data === 'object' ? { ...data } : {};
        }
    }

    return {
        KeyValueStorage: KeyValueStorageMock,
        KEY_VALUE_STORAGE: new KeyValueStorageMock(),
    };
});

function createDirent(name, kind) {
    return {
        name,
        isDirectory: () => kind === 'dir',
        isFile: () => kind === 'file',
    };
}

function createFsMock() {
    const normalizePath = (targetPath) => String(targetPath || '').replaceAll('\\', '/');

    const dirEntries = new Map([
        [
            '/src',
            [createDirent('pictures', 'dir')],
        ],
        [
            '/src/pictures',
            [createDirent('tutorial', 'dir')],
        ],
        [
            '/src/pictures/tutorial',
            [createDirent('01', 'dir'), createDirent('02', 'dir')],
        ],
        [
            '/src/pictures/tutorial/01',
            [createDirent('01.png', 'file'), createDirent('02.png', 'file')],
        ],
        [
            '/src/pictures/tutorial/02',
            [createDirent('01.png', 'file'), createDirent('02.png', 'file')],
        ],
    ]);

    return {
        existsSync: vi.fn((targetPath) => {
            const safePath = normalizePath(targetPath);
            if (targetPath === './www/cheat-settings/koharu.json') {
                return false;
            }
            return dirEntries.has(safePath);
        }),
        readdirSync: vi.fn((targetPath) => {
            const safePath = normalizePath(targetPath);
            const entries = dirEntries.get(safePath);
            if (!entries) {
                throw new Error(`Unknown directory: ${safePath}`);
            }
            return entries;
        }),
        readFileSync: vi.fn(() => Buffer.from('png-bytes')),
        writeFileSync: vi.fn(),
        renameSync: vi.fn(),
        mkdirSync: vi.fn(),
    };
}

describe('KoharuIntegrationRuntime upload mapping', () => {
    let originalWindow;
    let originalRequire;

    beforeEach(() => {
        originalWindow = globalThis.window;
        originalRequire = globalThis.require;

        globalThis.window = globalThis;
        globalThis.window.__CHEAT_EXTERNAL_WINDOW__ = false;
        globalThis.window.opener = null;

        delete globalThis.__CheatKoharuIntegrationRuntime;
    });

    afterEach(() => {
        delete globalThis.__CheatKoharuIntegrationRuntime;

        if (originalWindow === undefined) {
            delete globalThis.window;
        } else {
            globalThis.window = originalWindow;
        }

        if (originalRequire === undefined) {
            delete globalThis.require;
        } else {
            globalThis.require = originalRequire;
        }

        vi.clearAllMocks();
        vi.resetModules();
    });

    it('maps uploaded page ids by scene page name instead of upload response order', async () => {
        const fsMock = createFsMock();
        globalThis.require = (name) => {
            if (name === 'fs') {
                return fsMock;
            }
            if (name === 'path') {
                return path;
            }
            throw new Error(`Unexpected module request: ${name}`);
        };

        const KoharuApi = await import('../../../../../cheat-engine/www/cheat/js/KoharuApiClient.js');
        const { ensureKoharuIntegrationRuntime } = await import(
            '../../../../../cheat-engine/www/cheat/js/KoharuIntegrationRuntime.js'
        );

        KoharuApi.uploadPages
            .mockResolvedValueOnce({
                pages: ['id_02_a', 'id_01_a'],
            })
            .mockResolvedValueOnce({
                pages: ['id_02_b', 'id_01_b'],
            });

        KoharuApi.getScene
            .mockResolvedValueOnce({
                pages: {
                    id_01_a: { id: 'id_01_a', name: '01.png', nodes: {} },
                    id_02_a: { id: 'id_02_a', name: '02.png', nodes: {} },
                },
            })
            .mockResolvedValueOnce({
                pages: {
                    id_01_a: { id: 'id_01_a', name: '01.png', nodes: {} },
                    id_02_a: { id: 'id_02_a', name: '02.png', nodes: {} },
                    id_01_b: { id: 'id_01_b', name: '01.png', nodes: {} },
                    id_02_b: { id: 'id_02_b', name: '02.png', nodes: {} },
                },
            });

        const runtime = ensureKoharuIntegrationRuntime();
        const result = await runtime.uploadAllImages('/src');

        const mappings = runtime.getSnapshot().settings.pageIdMappings;

        // This regression guard exists because Koharu may reorder ids in /pages responses.
        // We must map using scene.json page names per uploaded folder to keep deterministic paths.
        expect(mappings).toEqual({
            id_01_a: {
                pageId: 'id_01_a',
                fileName: '01.png',
                relativePath: 'pictures/tutorial/01/01.png',
            },
            id_02_a: {
                pageId: 'id_02_a',
                fileName: '02.png',
                relativePath: 'pictures/tutorial/01/02.png',
            },
            id_01_b: {
                pageId: 'id_01_b',
                fileName: '01.png',
                relativePath: 'pictures/tutorial/02/01.png',
            },
            id_02_b: {
                pageId: 'id_02_b',
                fileName: '02.png',
                relativePath: 'pictures/tutorial/02/02.png',
            },
        });

        expect(result.uploadedCount).toBe(4);
        expect(KoharuApi.uploadPages).toHaveBeenCalledTimes(2);
        expect(KoharuApi.getScene).toHaveBeenCalledTimes(2);
    });
});
