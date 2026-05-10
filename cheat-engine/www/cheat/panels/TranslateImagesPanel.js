import { Alert } from '../js/AlertHelper.js';
import { ensureTranslationRuntime } from './translate-on-the-fly/TranslationRuntime.js';
import { isRpgMakerMv } from '../js/RpgMakerRuntime.js';

function sortByName(a, b) {
    return String(a.name || '').localeCompare(String(b.name || ''));
}

function toPosixPath(value) {
    return String(value || '').replace(/\\/g, '/');
}

export default {
    name: 'TranslateImagesPanel',

    template: `
<v-card flat class="ma-0 pa-0 fill-height">
    <v-card-title class="subtitle-1 font-weight-bold pb-1">Images</v-card-title>

    <v-card-text class="pt-0 pb-2">
        <div class="caption mb-2">
            Select folders from game image directory and export decoded PNG files to translation cache.
        </div>

        <div class="d-flex align-center" style="gap: 8px;">
            <v-select
                v-model="selectedTargetLang"
                :items="languageOptions"
                label="Target language"
                item-text="text"
                item-value="value"
                dense
                outlined
                hide-details
                style="max-width: 240px;"
                @keydown.stop>
            </v-select>

            <v-btn
                color="primary"
                :loading="isDecompressing"
                :disabled="isDecompressing || selectedFolderIds.length === 0"
                @click="decompressSelectedImagesToPng">
                Decompress images to png
            </v-btn>
        </div>

        <div class="caption mt-2 grey--text text--lighten-1">
            Source: {{ sourceImageRootDisplay }}
        </div>
    </v-card-text>

    <v-divider></v-divider>

    <v-card-text class="pt-2 pb-2" style="max-height: calc(100vh - 320px); overflow-y: auto;">
        <v-treeview
            v-if="folderTreeItems.length > 0"
            v-model="selectedFolderIds"
            :items="folderTreeItems"
            item-key="id"
            selectable
            selection-type="independent"
            open-all
            dense>
            <template v-slot:label="{ item }">
                <span class="caption">{{ item.name }}</span>
            </template>
        </v-treeview>

        <div v-else class="caption grey--text text--lighten-1">
            No folders found in image directory.
        </div>
    </v-card-text>
</v-card>
    `,

    data() {
        return {
            languageOptions: [],
            selectedTargetLang: 'en',
            sourceImageRootDisplay: '',
            folderTreeItems: [],
            selectedFolderIds: [],
            isDecompressing: false,
        };
    },

    created() {
        this._runtime = ensureTranslationRuntime();

        const runtimeOptions = Array.isArray(this._runtime?.languageOptions)
            ? this._runtime.languageOptions
            : [];
        this.languageOptions = runtimeOptions.map((item) => ({ ...item }));

        if (
            this._runtime &&
            typeof this._runtime.targetLang === 'string' &&
            this._runtime.targetLang
        ) {
            this.selectedTargetLang = this._runtime.targetLang;
        }

        if (!this.languageOptions.some((item) => item.value === this.selectedTargetLang)) {
            this.languageOptions.unshift({
                text: this.selectedTargetLang,
                value: this.selectedTargetLang,
            });
        }

        this.refreshFolderTree();
    },

    methods: {
        getNodeRequire() {
            const nodeRequire = globalThis && globalThis.require;
            return typeof nodeRequire === 'function' ? nodeRequire : null;
        },

        getImageRootAbsolutePath() {
            const nodeRequire = this.getNodeRequire();
            if (!nodeRequire) {
                return '';
            }

            const path = nodeRequire('path');
            const nodeProcess = globalThis && globalThis.process;
            const cwd =
                nodeProcess && typeof nodeProcess.cwd === 'function' ? nodeProcess.cwd() : '.';
            return isRpgMakerMv() ? path.join(cwd, 'www', 'img') : path.join(cwd, 'img');
        },

        refreshFolderTree() {
            const nodeRequire = this.getNodeRequire();
            if (!nodeRequire) {
                this.folderTreeItems = [];
                this.selectedFolderIds = [];
                this.sourceImageRootDisplay = '(filesystem unavailable)';
                return;
            }

            const fs = nodeRequire('fs');
            const path = nodeRequire('path');
            const rootPath = this.getImageRootAbsolutePath();
            this.sourceImageRootDisplay = toPosixPath(rootPath);

            if (!rootPath || !fs.existsSync(rootPath)) {
                this.folderTreeItems = [];
                this.selectedFolderIds = [];
                return;
            }

            const buildNode = (absolutePath, relativePath) => {
                const directoryEntries = fs
                    .readdirSync(absolutePath, { withFileTypes: true })
                    .filter((entry) => entry.isDirectory())
                    .map((entry) =>
                        buildNode(
                            path.join(absolutePath, entry.name),
                            `${relativePath}/${entry.name}`
                        )
                    );

                directoryEntries.sort(sortByName);

                return {
                    id: relativePath,
                    relPath: relativePath,
                    name: relativePath.split('/').pop() || relativePath,
                    children: directoryEntries,
                };
            };

            const topLevelItems = fs
                .readdirSync(rootPath, { withFileTypes: true })
                .filter((entry) => entry.isDirectory())
                .map((entry) => buildNode(path.join(rootPath, entry.name), entry.name));

            topLevelItems.sort(sortByName);
            this.folderTreeItems = topLevelItems;

            const defaultSelection = [];
            const walk = (items) => {
                for (const item of items) {
                    if (item.relPath === 'pictures' || item.relPath.startsWith('pictures/')) {
                        defaultSelection.push(item.id);
                    }
                    if (Array.isArray(item.children) && item.children.length > 0) {
                        walk(item.children);
                    }
                }
            };
            walk(topLevelItems);
            this.selectedFolderIds = defaultSelection;
        },

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

                    const lowerName = entry.name.toLowerCase();
                    if (
                        lowerName.endsWith('.png') ||
                        lowerName.endsWith('.png_') ||
                        lowerName.endsWith('.rpgmvp')
                    ) {
                        const relativePath = toPosixPath(path.relative(rootPath, fullPath));
                        relFiles.push(relativePath);
                    }
                }
            }

            return relFiles;
        },

        toLogicalRelativePath(relativeFilePath) {
            return toPosixPath(relativeFilePath).replace(/(\.png_|\.rpgmvp|\.png)$/i, '');
        },

        isSelectedByFolderPrefix(relativeDirectoryPath, selectedFolders) {
            const safeDir = toPosixPath(relativeDirectoryPath || '');
            for (const folderPath of selectedFolders) {
                if (!folderPath) {
                    continue;
                }
                if (safeDir === folderPath || safeDir.startsWith(`${folderPath}/`)) {
                    return true;
                }
            }
            return false;
        },

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
        },

        loadBitmapByUrl(url) {
            return new Promise((resolve, reject) => {
                const BitmapApi = globalThis && globalThis.Bitmap;
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
        },

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
            const BufferApi = globalThis && globalThis.Buffer;
            if (!BufferApi || typeof BufferApi.from !== 'function') {
                throw new Error('Buffer API unavailable');
            }
            return BufferApi.from(base64, 'base64');
        },

        async decompressSelectedImagesToPng() {
            if (this.isDecompressing) {
                return;
            }

            const nodeRequire = this.getNodeRequire();
            if (!nodeRequire) {
                Alert.error('Filesystem API unavailable in this environment');
                return;
            }

            const selectedFolders = Array.isArray(this.selectedFolderIds)
                ? this.selectedFolderIds
                      .map((value) => toPosixPath(value).replace(/^\/+/, '').replace(/\/+$/, ''))
                      .filter((value) => value)
                : [];

            if (selectedFolders.length === 0) {
                Alert.warn('Select at least one folder');
                return;
            }

            const fs = nodeRequire('fs');
            const path = nodeRequire('path');
            const sourceRoot = this.getImageRootAbsolutePath();
            if (!sourceRoot || !fs.existsSync(sourceRoot)) {
                Alert.error('Image source directory does not exist');
                return;
            }

            const runtime = this._runtime || ensureTranslationRuntime();
            if (!runtime || typeof runtime.getSplitCacheDirectoryPath !== 'function') {
                Alert.error('Translation runtime is unavailable');
                return;
            }

            const cacheRoot = path.join(
                runtime.getSplitCacheDirectoryPath(),
                'img',
                this.selectedTargetLang
            );

            this.isDecompressing = true;

            let decodedCount = 0;
            let failedCount = 0;

            try {
                fs.mkdirSync(cacheRoot, { recursive: true });
                for (const selectedFolder of selectedFolders) {
                    fs.mkdirSync(path.join(cacheRoot, selectedFolder), { recursive: true });
                }

                const sourceFiles = this.collectSourceImageFiles(sourceRoot);
                for (const relativeFilePath of sourceFiles) {
                    const logicalRelativePath = this.toLogicalRelativePath(relativeFilePath);
                    const relativeDir = toPosixPath(path.dirname(logicalRelativePath)).replace(
                        /^\.$/,
                        ''
                    );

                    if (!this.isSelectedByFolderPrefix(relativeDir, selectedFolders)) {
                        continue;
                    }

                    const logicalUrl = `img/${this.encodeRelativeLogicalPath(logicalRelativePath)}.png`;

                    try {
                        const bitmap = await this.loadBitmapByUrl(logicalUrl);
                        const pngBuffer = this.bitmapToPngBuffer(bitmap);
                        const targetFilePath = path.join(cacheRoot, `${logicalRelativePath}.png`);
                        fs.mkdirSync(path.dirname(targetFilePath), { recursive: true });
                        fs.writeFileSync(targetFilePath, pngBuffer);
                        decodedCount += 1;

                        if (bitmap && typeof bitmap.destroy === 'function') {
                            bitmap.destroy();
                        }
                    } catch (error) {
                        failedCount += 1;
                        console.warn('[TranslateImagesPanel] Failed to decode image', {
                            relativeFilePath,
                            logicalUrl,
                            error,
                        });
                    }
                }

                if (failedCount > 0) {
                    Alert.info(
                        `Decoded ${decodedCount} images to png (${failedCount} failed)`,
                        null,
                        2200
                    );
                } else {
                    Alert.info(`Decoded ${decodedCount} images to png`, null, 2200);
                }
            } catch (error) {
                const errorMessage =
                    error && typeof error === 'object' && 'message' in error
                        ? String(error.message)
                        : String(error);
                Alert.error(`Failed to decompress images to png: ${errorMessage}`, null, 2200);
            } finally {
                this.isDecompressing = false;
            }
        },
    },
};
