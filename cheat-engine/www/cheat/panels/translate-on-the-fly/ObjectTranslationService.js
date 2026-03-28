import { Alert } from "../../js/AlertHelper.js";
import { ensureTranslationRuntime } from "./TranslationRuntime.js";

const makeObservable = (value) => {
  if (window.Vue && typeof window.Vue.observable === "function") {
    return window.Vue.observable(value);
  }

  return value;
};

class ObjectTranslationService {
  constructor() {
    this.state = makeObservable({
      dialogVisible: false,
      modalStats: [],
      modalExtraStats: [],
      selection: {},
      mapEventsDialogVisible: false,
      mapEventsLoading: false,
      mapEventsSearch: "",
      mapEventDetails: [],
      mapEventDraftSelection: {},
    });
  }

  ensureRuntime() {
    try {
      return ensureTranslationRuntime();
    } catch (error) {
      console.warn(
        "[ObjectTranslationService] Failed to ensure runtime",
        error,
      );
      return null;
    }
  }

  openModal() {
    const runtime = this.ensureRuntime();
    if (!runtime) {
      Alert.error("Translation runtime not initialized");
      return;
    }

    if (runtime.objectTranslationJob && runtime.objectTranslationJob.active) {
      Alert.warn("Object translation is already in progress");
      return;
    }

    if (
      typeof runtime.isNonOtfTranslationProcessActive === "function" &&
      runtime.isNonOtfTranslationProcessActive()
    ) {
      const activeLabel =
        typeof runtime.getActiveNonOtfTranslationProcessLabel === "function"
          ? runtime.getActiveNonOtfTranslationProcessLabel()
          : "translation";
      Alert.warn(
        `Another translation is already in progress (${activeLabel}).`,
      );
      return;
    }

    if (runtime.checkIfDataIsLoaded && runtime.checkIfDataIsLoaded()) {
      Alert.warn("Game data is not fully loaded yet");
      return;
    }

    const stats =
      typeof runtime.getObjectTranslationStats === "function"
        ? runtime.getObjectTranslationStats()
        : [];
    const extraIds = new Set(["commonEvents", "mapEvents"]);
    const commonEventsStats =
      stats.find((item) => item.id === "commonEvents") ||
      (runtime.countCommonEventsStats
        ? runtime.countCommonEventsStats()
        : { totalStrings: 0, leftStrings: 0 });
    const mapEventsStats =
      stats.find((item) => item.id === "mapEvents") ||
      (runtime.countMapEventsStats
        ? runtime.countMapEventsStats()
        : { total: 0 });
    const selectedMapIds = runtime.getSelectedObjectTranslationMapIds
      ? runtime.getSelectedObjectTranslationMapIds()
      : [];

    this.state.modalStats = stats.filter((item) => !extraIds.has(item.id));
    this.state.modalExtraStats = [
      {
        id: "commonEvents",
        label: "CommonEvents",
        metaText: `${commonEventsStats.leftStrings} of ${commonEventsStats.totalStrings}`,
        total: commonEventsStats.totalStrings,
      },
      {
        id: "mapEvents",
        label: "Map events",
        metaText: runtime.getObjectTranslationMapEventsMetaText
          ? runtime.getObjectTranslationMapEventsMetaText(
              mapEventsStats.total,
              selectedMapIds.length,
            )
          : `${mapEventsStats.total || 0} maps`,
        total: mapEventsStats.total,
      },
    ];

    for (const item of this.state.modalStats) {
      if (this.state.selection[item.id] === undefined) {
        this.state.selection[item.id] = item.left > 0;
      }
    }

    for (const item of this.state.modalExtraStats) {
      if (this.state.selection[item.id] === undefined) {
        this.state.selection[item.id] = item.total > 0;
      }
    }

    this.state.dialogVisible = true;
  }

  closeModal() {
    this.state.dialogVisible = false;
  }

  async openMapSelection() {
    const runtime = this.ensureRuntime();
    if (
      !runtime ||
      typeof runtime.buildObjectTranslationMapEventDetails !== "function"
    ) {
      Alert.error("Translation runtime not initialized");
      return;
    }

    this.state.mapEventsDialogVisible = true;
    this.state.mapEventsLoading = true;
    this.state.mapEventsSearch = "";

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
      Alert.error("Translation runtime not initialized");
      return;
    }

    const selectedMapIds = this.state.mapEventDetails
      .filter(
        (item) =>
          item.totalStrings > 0 && !!this.state.mapEventDraftSelection[item.id],
      )
      .map((item) => item.id);

    runtime.objectTranslationSelectedMapIds = selectedMapIds;
    this.state.selection.mapEvents = selectedMapIds.length > 0;

    const mapEventsItem = this.state.modalExtraStats.find(
      (item) => item.id === "mapEvents",
    );
    if (mapEventsItem && runtime.getObjectTranslationMapEventsMetaText) {
      mapEventsItem.metaText = runtime.getObjectTranslationMapEventsMetaText(
        mapEventsItem.total,
        selectedMapIds.length,
      );
    }

    this.closeMapSelection();
  }

  async startTranslation(dryRun = false) {
    const runtime = this.ensureRuntime();
    if (!runtime || typeof runtime.runObjectTranslationJob !== "function") {
      Alert.error("Translation runtime not initialized");
      return;
    }

    if (
      typeof runtime.isNonOtfTranslationProcessActive === "function" &&
      runtime.isNonOtfTranslationProcessActive()
    ) {
      const activeLabel =
        typeof runtime.getActiveNonOtfTranslationProcessLabel === "function"
          ? runtime.getActiveNonOtfTranslationProcessLabel()
          : "translation";
      Alert.warn(
        `Another translation is already in progress (${activeLabel}).`,
      );
      return;
    }

    const selected = [];
    const stats = [...this.state.modalStats, ...this.state.modalExtraStats];
    for (const item of stats) {
      const checked = !!this.state.selection[item.id];
      this.state.selection[item.id] = checked;
      if (checked) {
        selected.push(item.id);
      }
    }

    if (!selected.length) {
      Alert.warn("Select at least one type to translate");
      return;
    }

    this.closeModal();
    await runtime.runObjectTranslationJob(selected, { dryRun });
  }

  async startObjectTranslationFromModal(dryRun = false) {
    this.closeModal();
    await this.startTranslation(dryRun);
  }
}

export const OBJECT_TRANSLATION_SERVICE = new ObjectTranslationService();
