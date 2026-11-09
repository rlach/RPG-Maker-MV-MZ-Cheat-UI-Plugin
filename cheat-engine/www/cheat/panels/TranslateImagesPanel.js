import { Alert } from '../js/AlertHelper.js';
import { ensureTranslationRuntime } from '../js/translation-runtime/TranslationRuntime.js';
import { ensureImageExporterRuntime, toLogicalRelativePath } from '../js/ImageExporterRuntime.js';

function toPosixPath(value) {
    return String(value || '').replace(/\\/g, '/');
}

export default {
    name: 'TranslateImagesPanel',

    template: `
<v-card flat class="cheat-export-panel ma-0 pa-0 fill-height d-flex flex-column">
    <v-card-title class="text-subtitle-1 font-weight-bold pb-1">Images Exporter</v-card-title>

    <v-card-text class="pt-0 pb-2">
        <div class="text-caption mb-2">
            Select folders or images from the game image directory and export decoded PNG files to translation cache.
        </div>


        <div class="d-flex align-center cheat-export-toolbar">
            <v-select
                v-model="selectedTargetLang"
                :items="languageOptions"
                label="Target language"
                item-title="text"
                item-value="value" density="compact" variant="outlined"
                hide-details
                style="width: 200px; min-width: 180px; flex: 0 0 200px;"
                @keydown.stop>
            </v-select>

            <v-btn
                color="primary"
                :disabled="isExportButtonDisabled()"
                @click="decompressSelectedImagesToPng">
                {{ exportButtonLabel() }}
            </v-btn>
        </div>

        <div class="d-flex align-center flex-wrap mt-2" style="gap:16px">
            <v-checkbox v-model="showImages" label="Show images" hide-details density="compact" />
            <v-checkbox v-model="hideExported" label="Hide already exported" hide-details density="compact" />
            <v-text-field v-model="filterText" placeholder="Filter images" hide-details density="compact" @keydown.stop />
        </div>
        <div class="text-caption mt-2 text-grey-lighten-1">
            Source: {{ sourceImageRootDisplay }}
        </div>
    </v-card-text>

    <v-divider></v-divider>

    <v-card-text class="cheat-export-tree pt-2 pb-2" style="min-height: 0; overflow-y: auto;">
        <v-virtual-scroll :items="visibleRows" :item-height="40" height="100%">
            <template #default="{ item }">
                <div class="d-flex align-center" :style="{ height: '40px', paddingLeft: (item.depth * 20) + 'px' }">
                    <v-btn v-if="item.folder" variant="text" size="small" icon
                        :aria-label="expanded.has(item.id) ? 'Collapse folder' : 'Expand folder'"
                        @click="toggleExpanded(item.id)">
                        <v-icon>{{ expanded.has(item.id) ? 'mdi-chevron-down' : 'mdi-chevron-right' }}</v-icon>
                    </v-btn>
                    <span v-else style="width:40px;flex-shrink:0"></span>
                    <v-btn variant="text" size="small" icon aria-label="Toggle selection" @click="toggleSelection(item)">
                        <v-icon>{{ selectionIcon(item) }}</v-icon>
                    </v-btn>
                    <span class="text-caption text-truncate" :title="item.id">{{ item.name }}{{ item.folder ? ' (' + item.count + ')' : '' }}</span>
                </div>
            </template>
        </v-virtual-scroll>
        <div v-if="!visibleRows.length" class="text-caption">No matching images.</div>
    </v-card-text>
</v-card>
    `,

    data() {
        return {
            languageOptions: [],
            selectedTargetLang: 'en',
            sourceImageRootDisplay: '',
            sourceFiles: Object.freeze([]),
            selectedFiles: new Set(),
            expanded: new Set(),
            exportedFiles: new Set(),
            showImages: false,
            hideExported: false,
            filterText: '',
            appliedFilter: '',
            exportTotalCount: 0,
            exportProcessedCount: 0,
            isExportInProgress: false,
            _progressPollIntervalId: 0,
        };
    },

    computed: {
        eligibleFiles() {
            return this.sourceFiles.filter(
                (file) => !this.hideExported || !this.exportedFiles.has(toLogicalRelativePath(file))
            );
        },
        matchingFiles() {
            const filter = this.appliedFilter.toLowerCase();
            return this.eligibleFiles.filter((file) => file.toLowerCase().includes(filter));
        },
        folderStats() {
            const stats = new Map();
            for (const file of this.matchingFiles) {
                const parts = file.split('/');
                parts.pop();
                let id = '';
                for (const part of parts) {
                    id = id ? id + '/' + part : part;
                    const stat = stats.get(id) || { count: 0, selected: 0 };
                    stat.count++;
                    if (this.selectedFiles.has(file)) stat.selected++;
                    stats.set(id, stat);
                }
            }
            return stats;
        },
        visibleRows() {
            const children = new Map();
            const add = (parent, row) => {
                if (!children.has(parent)) children.set(parent, []);
                children.get(parent).push(row);
            };
            for (const [id, stat] of this.folderStats) {
                const parts = id.split('/');
                add(parts.slice(0, -1).join('/'), {
                    id,
                    name: parts[parts.length - 1],
                    folder: true,
                    count: stat.count,
                    depth: parts.length - 1,
                });
            }
            if (this.showImages) {
                for (const id of this.matchingFiles) {
                    const parts = id.split('/');
                    add(parts.slice(0, -1).join('/'), {
                        id,
                        name: parts[parts.length - 1],
                        folder: false,
                        depth: parts.length - 1,
                    });
                }
            }
            const rows = [];
            const visit = (parent) => {
                const entries = children.get(parent) || [];
                entries.sort(
                    (a, b) => Number(b.folder) - Number(a.folder) || a.name.localeCompare(b.name)
                );
                for (const row of entries) {
                    rows.push(row);
                    if (row.folder && this.expanded.has(row.id)) visit(row.id);
                }
            };
            visit('');
            return rows;
        },
        selectedExportFiles() {
            return this.eligibleFiles.filter((file) => this.selectedFiles.has(file));
        },
    },
    watch: {
        filterText(value) {
            clearTimeout(this._filterTimeout);
            this._filterTimeout = setTimeout(() => {
                this.appliedFilter = value;
            }, 180);
        },
        selectedTargetLang() {
            this.refreshExportedFiles();
        },
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

    beforeUnmount() {
        clearTimeout(this._filterTimeout);
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
            this.sourceImageRootDisplay = toPosixPath(
                this._imageExporterRuntime.getImageRootAbsolutePath()
            );
            this.sourceFiles = Object.freeze(
                this._imageExporterRuntime.collectSourceImageFiles(this.sourceImageRootDisplay)
            );
            this.selectedFiles = new Set(
                this.sourceFiles.filter((file) => file.startsWith('pictures/'))
            );
            const expanded = new Set();
            for (const file of this.sourceFiles) {
                const parts = file.split('/');
                parts.pop();
                if (parts[0] === 'pictures') expanded.add(parts.join('/'));
                parts.pop();
                while (parts.length) {
                    expanded.add(parts.join('/'));
                    parts.pop();
                }
            }
            this.expanded = expanded;
            this.refreshExportedFiles();
        },
        getCacheRoot() {
            const nodeRequire = this.getNodeRequire();
            if (!nodeRequire || !this._runtime) return '';
            return nodeRequire('path').join(
                this._runtime.getSplitCacheDirectoryPath(),
                'img',
                this.selectedTargetLang
            );
        },
        refreshExportedFiles() {
            if (!this._imageExporterRuntime) return;
            const root = this.getCacheRoot();
            this.exportedFiles = new Set(
                root
                    ? this._imageExporterRuntime
                          .collectSourceImageFiles(root)
                          .filter((file) => /\.png$/i.test(file))
                          .map(toLogicalRelativePath)
                    : []
            );
        },
        toggleExpanded(id) {
            const next = new Set(this.expanded);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            this.expanded = next;
        },
        selectionIcon(item) {
            if (!item.folder)
                return this.selectedFiles.has(item.id)
                    ? 'mdi-checkbox-marked'
                    : 'mdi-checkbox-blank-outline';
            const stat = this.folderStats.get(item.id);
            if (stat.selected === stat.count) return 'mdi-checkbox-marked';
            return stat.selected ? 'mdi-minus-box' : 'mdi-checkbox-blank-outline';
        },
        toggleSelection(item) {
            const files = item.folder
                ? this.matchingFiles.filter((file) => file.startsWith(item.id + '/'))
                : [item.id];
            const select = item.folder
                ? this.folderStats.get(item.id).selected !== files.length
                : !this.selectedFiles.has(item.id);
            const next = new Set(this.selectedFiles);
            for (const file of files) {
                if (select) next.add(file);
                else next.delete(file);
            }
            this.selectedFiles = next;
        },
        getSelectedExportImageCount() {
            return this.selectedExportFiles.length;
        },
        isExportButtonDisabled() {
            return this.isExportInProgress || !this.selectedExportFiles.length;
        },
        exportButtonLabel() {
            return this.isExportInProgress
                ? `Exporting. Progress: ${this.exportProcessedCount} of ${this.exportTotalCount}`
                : `Decompress images to png (${this.selectedExportFiles.length})`;
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

            const selectedFiles = this.selectedExportFiles.slice();
            if (!selectedFiles.length) {
                Alert.warn('Select at least one image or folder');
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
                    selectedFolders: [],
                    selectedFiles,
                    skipExisting: this.hideExported,
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
            this.refreshExportedFiles();
        },
    },
};
