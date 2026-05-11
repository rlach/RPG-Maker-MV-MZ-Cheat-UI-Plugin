import { Alert } from '../js/AlertHelper.js';
import { ensureTranslationRuntime } from '../js/translation-runtime/TranslationRuntime.js';
import {
    ensureImageExporterRuntime,
    isSupportedImageFileName,
} from '../js/ImageExporterRuntime.js';

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
                :disabled="isExportButtonDisabled()"
                @click="decompressSelectedImagesToPng">
                {{ exportButtonLabel() }}
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
            :items="folderTreeItems"
            item-key="id"
            open-all
            dense>
            <template v-slot:prepend="{ item }">
                <v-icon small @click.stop="toggleFolderSelection(item.id)">
                    {{ checkboxIconForFolder(item.id) }}
                </v-icon>
            </template>

            <template v-slot:label="{ item }">
                <span class="caption">{{ item.name }} ({{ item.directImageCount }})</span>
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
            folderSelectionById: {},
            folderChildrenById: {},
            directImageCountByFolderId: {},
            exportTotalCount: 0,
            exportProcessedCount: 0,
            isExportInProgress: false,
            _progressPollIntervalId: 0,
        };
    },

    created() {
        this._runtime = ensureTranslationRuntime();
        this._imageExporterRuntime = ensureImageExporterRuntime();

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
        this.refreshExportStatus();
        this._progressPollIntervalId = setInterval(() => {
            this.refreshExportStatus();
        }, 1000);
    },

    beforeDestroy() {
        if (this._progressPollIntervalId) {
            clearInterval(this._progressPollIntervalId);
            this._progressPollIntervalId = 0;
        }
    },

    methods: {
        getNodeRequire() {
            const nodeRequire = globalThis && globalThis.require;
            return typeof nodeRequire === 'function' ? nodeRequire : null;
        },

        refreshFolderTree() {
            const nodeRequire = this.getNodeRequire();
            if (!nodeRequire) {
                this.folderTreeItems = [];
                this.folderSelectionById = {};
                this.folderChildrenById = {};
                this.directImageCountByFolderId = {};
                this.sourceImageRootDisplay = '(filesystem unavailable)';
                return;
            }

            const fs = nodeRequire('fs');
            const path = nodeRequire('path');
            const rootPath = this._imageExporterRuntime.getImageRootAbsolutePath();
            this.sourceImageRootDisplay = toPosixPath(rootPath);

            if (!rootPath || !fs.existsSync(rootPath)) {
                this.folderTreeItems = [];
                this.folderSelectionById = {};
                this.folderChildrenById = {};
                this.directImageCountByFolderId = {};
                return;
            }

            const folderChildrenById = {};
            const directImageCountByFolderId = {};
            const folderSelectionById = {};

            const buildNode = (absolutePath, relativePath) => {
                const directoryEntriesRaw = fs.readdirSync(absolutePath, { withFileTypes: true });
                const directoryEntries = directoryEntriesRaw
                    .filter((entry) => entry.isDirectory())
                    .map((entry) => {
                        const childPath = `${relativePath}/${entry.name}`;
                        return buildNode(path.join(absolutePath, entry.name), childPath);
                    });

                directoryEntries.sort(sortByName);

                const directImageCount = directoryEntriesRaw.filter(
                    (entry) => entry.isFile() && isSupportedImageFileName(entry.name)
                ).length;

                folderChildrenById[relativePath] = directoryEntries.map((entry) => entry.id);
                directImageCountByFolderId[relativePath] = directImageCount;
                folderSelectionById[relativePath] = false;

                return {
                    id: relativePath,
                    relPath: relativePath,
                    name: relativePath.split('/').pop() || relativePath,
                    directImageCount,
                    children: directoryEntries,
                };
            };

            const topLevelItems = fs
                .readdirSync(rootPath, { withFileTypes: true })
                .filter((entry) => entry.isDirectory())
                .map((entry) => buildNode(path.join(rootPath, entry.name), entry.name));

            topLevelItems.sort(sortByName);
            this.folderTreeItems = topLevelItems;

            this.folderSelectionById = folderSelectionById;
            this.folderChildrenById = folderChildrenById;
            this.directImageCountByFolderId = directImageCountByFolderId;

            if (Object.prototype.hasOwnProperty.call(this.folderSelectionById, 'pictures')) {
                this.setSubtreeSelection('pictures', true);
            }
        },

        getFolderChildren(folderId) {
            return Array.isArray(this.folderChildrenById[folderId])
                ? this.folderChildrenById[folderId]
                : [];
        },

        collectSubtreeFolderIds(folderId) {
            const result = [];
            const stack = [folderId];

            while (stack.length > 0) {
                const currentId = stack.pop();
                if (!Object.prototype.hasOwnProperty.call(this.folderSelectionById, currentId)) {
                    continue;
                }

                result.push(currentId);
                const childIds = this.getFolderChildren(currentId);
                for (let index = childIds.length - 1; index >= 0; index -= 1) {
                    stack.push(childIds[index]);
                }
            }

            return result;
        },

        isFolderSelected(folderId) {
            return !!this.folderSelectionById[folderId];
        },

        getSelectedFolderIds() {
            return Object.keys(this.folderSelectionById).filter((folderId) =>
                this.isFolderSelected(folderId)
            );
        },

        getSelectedExportImageCount() {
            let total = 0;
            const selectedFolderIds = this.getSelectedFolderIds();
            for (const folderId of selectedFolderIds) {
                total += Number(this.directImageCountByFolderId[folderId] || 0);
            }
            return total;
        },

        isExportButtonDisabled() {
            return this.isExportInProgress || this.getSelectedExportImageCount() <= 0;
        },

        exportButtonLabel() {
            if (this.isExportInProgress) {
                return `Exporting. Progress: ${this.exportProcessedCount} of ${this.exportTotalCount}`;
            }

            return `Decompress images to png (${this.getSelectedExportImageCount()})`;
        },

        hasAnySelectionInSubtree(folderId) {
            if (this.isFolderSelected(folderId)) {
                return true;
            }

            const childIds = this.getFolderChildren(folderId);
            for (const childId of childIds) {
                if (this.hasAnySelectionInSubtree(childId)) {
                    return true;
                }
            }

            return false;
        },

        isSubtreeFullySelected(folderId) {
            if (!this.isFolderSelected(folderId)) {
                return false;
            }

            const childIds = this.getFolderChildren(folderId);
            for (const childId of childIds) {
                if (!this.isSubtreeFullySelected(childId)) {
                    return false;
                }
            }

            return true;
        },

        isFolderPartiallySelected(folderId) {
            const childIds = this.getFolderChildren(folderId);
            if (childIds.length <= 0) {
                return false;
            }

            const selfSelected = this.isFolderSelected(folderId);
            const anyChildSelected = childIds.some((childId) =>
                this.hasAnySelectionInSubtree(childId)
            );

            if (!selfSelected && anyChildSelected) {
                return true;
            }

            if (!selfSelected) {
                return false;
            }

            return childIds.some((childId) => !this.isSubtreeFullySelected(childId));
        },

        checkboxIconForFolder(folderId) {
            if (this.isFolderPartiallySelected(folderId)) {
                return 'mdi-minus-box';
            }
            return this.isFolderSelected(folderId)
                ? 'mdi-checkbox-marked'
                : 'mdi-checkbox-blank-outline';
        },

        setSubtreeSelection(folderId, selected) {
            const subtreeFolderIds = this.collectSubtreeFolderIds(folderId);
            if (subtreeFolderIds.length <= 0) {
                return;
            }

            const nextSelection = { ...this.folderSelectionById };
            for (const subtreeFolderId of subtreeFolderIds) {
                nextSelection[subtreeFolderId] = selected;
            }

            this.folderSelectionById = nextSelection;
        },

        toggleFolderSelection(folderId) {
            if (!Object.prototype.hasOwnProperty.call(this.folderSelectionById, folderId)) {
                return;
            }

            const shouldSelectWholeSubtree = !this.isSubtreeFullySelected(folderId);
            this.setSubtreeSelection(folderId, shouldSelectWholeSubtree);
        },

        refreshExportStatus() {
            const status = this._imageExporterRuntime.getStatus();
            this.isExportInProgress = !!status.inProgress;
            this.exportTotalCount = Number(status.totalCount) || 0;
            this.exportProcessedCount = Number(status.processedCount) || 0;
        },

        async decompressSelectedImagesToPng() {
            if (this._imageExporterRuntime.isExportInProgress()) {
                return;
            }

            const nodeRequire = this.getNodeRequire();
            if (!nodeRequire) {
                Alert.error('Filesystem API unavailable in this environment');
                return;
            }

            const selectedFolders = this.getSelectedFolderIds()
                .map((folderId) => toPosixPath(folderId).replace(/^\/+/, '').replace(/\/+$/, ''))
                .filter((folderId) => folderId);

            if (selectedFolders.length === 0) {
                Alert.warn('Select at least one folder');
                return;
            }

            const path = nodeRequire('path');
            const sourceRoot = this._imageExporterRuntime.getImageRootAbsolutePath();

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

            try {
                const exportPromise = this._imageExporterRuntime.startExport({
                    sourceRoot,
                    cacheRoot,
                    selectedFolders,
                    targetLang: this.selectedTargetLang,
                });

                this.refreshExportStatus();

                const result = await exportPromise;
                if (!result || !result.started) {
                    Alert.warn('Image export is already running');
                    return;
                }

                if (result.failedCount > 0) {
                    Alert.info(
                        `Decoded ${result.processedCount} images to png (${result.failedCount} failed)`,
                        null,
                        2200
                    );
                } else {
                    Alert.info(`Decoded ${result.processedCount} images to png`, null, 2200);
                }
            } catch (error) {
                const errorMessage =
                    error && typeof error === 'object' && 'message' in error
                        ? String(error.message)
                        : String(error);
                Alert.error(`Failed to decompress images to png: ${errorMessage}`, null, 2200);
            }

            this.refreshExportStatus();
        },
    },
};
