import { Alert } from '../../js/AlertHelper.js';
import { ensureTranslationRuntime } from './TranslationRuntime.js';

const makeObservable = (value) => {
    if (window.Vue && typeof window.Vue.observable === 'function') {
        return window.Vue.observable(value);
    }

    return value;
};

class ObjectTranslationService {
    constructor() {
        this.state = makeObservable({
            dialogVisible: false,
            modalDataGathering: false,
            modalStats: [],
            selection: {},
            cacheEmptyStringsRepeatUntilSuccess: false,
            mapEventsDialogVisible: false,
            mapEventsLoading: false,
            mapEventsSearch: '',
            mapEventDetails: [],
            mapEventDraftSelection: {},
            pluginsDialogVisible: false,
            pluginsLoading: false,
            pluginsSearch: '',
            pluginDetails: [],
            pluginDraftSelection: {},
        });
    }

    ensureRuntime() {
        try {
            return ensureTranslationRuntime();
        } catch (error) {
            console.warn('[ObjectTranslationService] Failed to ensure runtime', error);
            return null;
        }
    }

    async openModal() {
        const runtime = this.ensureRuntime();
        if (!runtime) {
            Alert.error('Translation runtime not initialized');
            return;
        }

        if (runtime.objectTranslationJob && runtime.objectTranslationJob.active) {
            Alert.warn('Object translation is already in progress');
            return;
        }

        if (runtime.isNonOtfTranslationProcessActive()) {
            const activeLabel = runtime.getActiveNonOtfTranslationProcessLabel();
            Alert.warn(`Another translation is already in progress (${activeLabel}).`);
            return;
        }

        if (runtime.checkIfDataIsLoaded()) {
            Alert.warn('Game data is not fully loaded yet');
            return;
        }

        this.state.dialogVisible = true;
        this.state.modalDataGathering = true;

        try {
            const stats = runtime.getObjectTranslationStats();
            const commonEventsStats =
                stats.find((item) => item.id === 'commonEvents') || runtime.countCommonEventsStats();
            const mapEventsStats =
                stats.find((item) => item.id === 'mapEvents') || runtime.countMapEventsStats();
            const selectedMapIds = runtime.getSelectedObjectTranslationMapIds();
            const pluginDetails = await runtime.buildObjectTranslationPluginDetails();
            const selectedPluginsCount = pluginDetails.filter((item) => item && item.selected).length;

            this.state.modalStats = stats
                .map((item) => {
                    if (item.id === 'commonEvents') {
                        return {
                            ...item,
                            metaText: `${commonEventsStats.leftStrings} of ${commonEventsStats.totalStrings}`,
                            total: commonEventsStats.totalStrings,
                            left: commonEventsStats.leftStrings,
                        };
                    }

                    if (item.id === 'mapEvents') {
                        return {
                            ...item,
                            metaText: runtime.getObjectTranslationMapEventsMetaText(
                                mapEventsStats.total,
                                selectedMapIds.length
                            ),
                            total: mapEventsStats.total,
                        };
                    }

                    if (item.id === 'plugins') {
                        return {
                            ...item,
                            total: pluginDetails.length,
                            left: pluginDetails.filter((entry) => entry.leftStrings > 0).length,
                            totalStrings: pluginDetails.reduce(
                                (acc, entry) => acc + (Number(entry.totalStrings) || 0),
                                0
                            ),
                            leftStrings: pluginDetails.reduce(
                                (acc, entry) => acc + (Number(entry.leftStrings) || 0),
                                0
                            ),
                            metaText: runtime.getObjectTranslationPluginsMetaText(
                                pluginDetails.length,
                                selectedPluginsCount
                            ),
                        };
                    }

                    return {
                        ...item,
                        metaText: '',
                    };
                })
                .filter((item) => item.id !== 'plugins' || pluginDetails.length > 0);

            const nextSelection = {};
            for (const item of this.state.modalStats) {
                if (typeof this.state.selection[item.id] === 'boolean') {
                    nextSelection[item.id] = this.state.selection[item.id];
                } else {
                    nextSelection[item.id] = item.left > 0;
                }
            }
            this.state.selection = nextSelection;

            this.state.cacheEmptyStringsRepeatUntilSuccess =
                !!runtime.cacheEmptyStringsRepeatUntilSuccess;
        } catch (error) {
            this.state.dialogVisible = false;
            throw error;
        } finally {
            this.state.modalDataGathering = false;
        }
    }

    setCacheEmptyStringsRepeatUntilSuccess(value) {
        this.state.cacheEmptyStringsRepeatUntilSuccess = !!value;
        const runtime = this.ensureRuntime();
        if (runtime) {
            runtime.cacheEmptyStringsRepeatUntilSuccess = !!value;
            runtime.saveSettings();
        }
    }

    closeModal() {
        if (this.state.modalDataGathering) {
            return;
        }
        this.state.dialogVisible = false;
    }

    async openMapSelection() {
        const runtime = this.ensureRuntime();
        if (!runtime) {
            Alert.error('Translation runtime not initialized');
            return;
        }

        this.state.mapEventsDialogVisible = true;
        this.state.mapEventsLoading = true;
        this.state.mapEventsSearch = '';

        try {
            const details = await runtime.buildObjectTranslationMapEventDetails();
            this.state.mapEventDetails = details;

            const draft = {};
            for (const item of details) {
                draft[item.id] = !!item.selected;
            }
            this.state.mapEventDraftSelection = draft;
        } finally {
            this.state.mapEventsLoading = false;
        }
    }

    async openPluginSelection() {
        const runtime = this.ensureRuntime();
        if (!runtime) {
            Alert.error('Translation runtime not initialized');
            return;
        }

        this.state.pluginsDialogVisible = true;
        this.state.pluginsLoading = true;
        this.state.pluginsSearch = '';

        try {
            const details = await runtime.buildObjectTranslationPluginDetails();
            this.state.pluginDetails = details;

            const draft = {};
            for (const item of details) {
                draft[item.id] = !!item.selected;
            }
            this.state.pluginDraftSelection = draft;
        } finally {
            this.state.pluginsLoading = false;
        }
    }

    closePluginSelection() {
        this.state.pluginsDialogVisible = false;
    }

    selectAllPlugins() {
        const next = { ...this.state.pluginDraftSelection };
        for (const item of this.state.pluginDetails) {
            next[item.id] = true;
        }
        this.state.pluginDraftSelection = next;
    }

    deselectAllPlugins() {
        const next = { ...this.state.pluginDraftSelection };
        for (const item of this.state.pluginDetails) {
            next[item.id] = false;
        }
        this.state.pluginDraftSelection = next;
    }

    savePluginSelection() {
        const runtime = this.ensureRuntime();
        if (!runtime) {
            Alert.error('Translation runtime not initialized');
            return;
        }

        for (const item of this.state.pluginDetails) {
            runtime.setPluginTranslatorEnabled(
                item.id,
                !!this.state.pluginDraftSelection[item.id],
                { persist: false }
            );
        }

        runtime.saveSettings();

        const selectedPluginsCount = this.state.pluginDetails.filter(
            (item) => !!this.state.pluginDraftSelection[item.id]
        ).length;
        this.state.selection.plugins = selectedPluginsCount > 0;

        const pluginsItem = this.state.modalStats.find((item) => item.id === 'plugins');
        if (pluginsItem) {
            pluginsItem.metaText = runtime.getObjectTranslationPluginsMetaText(
                this.state.pluginDetails.length,
                selectedPluginsCount
            );
        }

        this.closePluginSelection();
    }

    closeMapSelection() {
        this.state.mapEventsDialogVisible = false;
    }

    selectAllMaps() {
        const next = { ...this.state.mapEventDraftSelection };
        for (const item of this.state.mapEventDetails) {
            if (item.totalStrings > 0) {
                next[item.id] = true;
            }
        }
        this.state.mapEventDraftSelection = next;
    }

    deselectAllMaps() {
        const next = { ...this.state.mapEventDraftSelection };
        for (const item of this.state.mapEventDetails) {
            next[item.id] = false;
        }
        this.state.mapEventDraftSelection = next;
    }

    saveMapSelection() {
        const runtime = this.ensureRuntime();
        if (!runtime) {
            Alert.error('Translation runtime not initialized');
            return;
        }

        const selectedMapIds = this.state.mapEventDetails
            .filter((item) => item.totalStrings > 0 && !!this.state.mapEventDraftSelection[item.id])
            .map((item) => item.id);

        runtime.objectTranslationSelectedMapIds = selectedMapIds;
        this.state.selection.mapEvents = selectedMapIds.length > 0;

        const mapEventsItem = this.state.modalStats.find((item) => item.id === 'mapEvents');
        if (mapEventsItem) {
            mapEventsItem.metaText = runtime.getObjectTranslationMapEventsMetaText(
                mapEventsItem.total,
                selectedMapIds.length
            );
        }

        this.closeMapSelection();
    }

    async startTranslation(dryRun = false) {
        const runtime = this.ensureRuntime();
        if (!runtime) {
            Alert.error('Translation runtime not initialized');
            return;
        }

        if (runtime.isNonOtfTranslationProcessActive()) {
            const activeLabel = runtime.getActiveNonOtfTranslationProcessLabel();
            Alert.warn(`Another translation is already in progress (${activeLabel}).`);
            return;
        }

        const selected = [];
        const stats = [...this.state.modalStats];
        for (const item of stats) {
            const checked = !!this.state.selection[item.id];
            this.state.selection[item.id] = checked;
            if (checked) {
                const isDryRunOnlyExcludedKind = dryRun && item.id === 'cacheEmptyStrings';
                if (!isDryRunOnlyExcludedKind) {
                    selected.push(item.id);
                }
            }
        }

        if (!selected.length) {
            Alert.warn('Select at least one type to translate');
            return;
        }

        this.closeModal();
        await runtime.runObjectTranslationJob(selected, { dryRun });
    }

    async startObjectTranslationFromModal(dryRun = false) {
        this.closeModal();
        await this.startTranslation(dryRun);
    }

    reorderModalItem(fromIndex, toIndex) {
        const from = Number(fromIndex);
        const to = Number(toIndex);
        if (
            !Number.isInteger(from) ||
            !Number.isInteger(to) ||
            from < 0 ||
            to < 0 ||
            from >= this.state.modalStats.length ||
            to >= this.state.modalStats.length ||
            from === to
        ) {
            return;
        }

        const fromItem = this.state.modalStats[from];
        const toItem = this.state.modalStats[to];
        if ((fromItem && fromItem.noDragDrop) || (toItem && toItem.noDragDrop)) {
            return;
        }

        const reordered = this.state.modalStats.slice();
        const [moved] = reordered.splice(from, 1);
        reordered.splice(to, 0, moved);
        this.state.modalStats = reordered;

        const runtime = this.ensureRuntime();
        if (runtime) {
            runtime.setObjectTranslationTypeOrder(reordered.map((item) => item.id));
        }
    }
}

export const OBJECT_TRANSLATION_SERVICE = new ObjectTranslationService();
