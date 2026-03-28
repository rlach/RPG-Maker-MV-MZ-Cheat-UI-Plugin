import { OBJECT_TRANSLATION_SERVICE } from "../panels/translate-on-the-fly/ObjectTranslationService.js";

export default {
  name: "ObjectTranslationModalHost",

  template: `
<div>
  <v-dialog v-model="objectTranslationDialogVisible" max-width="640">
    <v-card dark>
      <v-card-title class="subtitle-1 font-weight-bold">Object Translation</v-card-title>
      <v-card-text class="caption pb-1">Select what to translate. Counts show remaining objects and total.</v-card-text>
      <v-card-text class="pt-1">
        <div
          v-for="item in objectTranslationModalStats"
          :key="item.id"
          class="d-flex align-center justify-space-between py-1"
        >
          <v-checkbox
            v-model="objectTranslationSelection[item.id]"
            :label="item.label"
            :disabled="item.total <= 0"
            hide-details
            dense
            class="ma-0 pa-0"
          ></v-checkbox>
          <span class="caption grey--text text--lighten-1">left {{item.left}} of {{item.total}}</span>
        </div>

        <v-divider class="my-3"></v-divider>

        <div
          v-for="item in objectTranslationModalExtraStats"
          :key="item.id"
          class="d-flex align-center justify-space-between py-1"
        >
          <v-checkbox
            v-model="objectTranslationSelection[item.id]"
            :label="item.label"
            :disabled="item.total <= 0"
            hide-details
            dense
            class="ma-0 pa-0"
          ></v-checkbox>
          <div class="d-flex align-center">
            <span class="caption grey--text text--lighten-1 mr-2">{{item.metaText}}</span>
            <v-btn
              v-if="item.id === 'mapEvents'"
              icon
              x-small
              color="grey lighten-1"
              :disabled="item.total <= 0"
              @click.stop="openMapEventsSelectionModal"
            >
              <v-icon small>mdi-cog</v-icon>
            </v-btn>
          </div>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn text color="grey" @click="closeObjectTranslationModal">Cancel</v-btn>
        <v-btn text color="orange" @click="startObjectTranslationFromModal(true)">Dry Run</v-btn>
        <v-btn text color="primary" @click="startObjectTranslationFromModal(false)">Start</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="objectTranslationMapEventsDialogVisible" max-width="760">
    <v-card dark>
      <v-card-title class="subtitle-1 font-weight-bold">Map events selection</v-card-title>
      <v-card-text class="caption pb-1">Choose which maps should be included in object translation.</v-card-text>
      <v-card-text class="pt-1">
        <v-text-field
          v-model="objectTranslationMapEventsSearch"
          label="Search maps"
          solo
          dense
          hide-details
          background-color="grey darken-3"
          class="mb-2"
          @keydown.self.stop
          @focus="$event.target.select()"
        ></v-text-field>

        <div class="d-flex justify-end mb-2">
          <v-btn text small color="primary" @click="selectAllMapEventsForObjectTranslation">Select all</v-btn>
          <v-btn text small color="grey lighten-1" @click="deselectAllMapEventsForObjectTranslation">Deselect all</v-btn>
        </div>

        <div v-if="objectTranslationMapEventsLoading" class="caption grey--text text--lighten-1 py-4 text-center">
          Loading map statistics...
        </div>

        <div v-else style="max-height: 420px; overflow-y: auto;">
          <div
            v-for="item in filteredObjectTranslationMapEventDetails"
            :key="item.id"
            class="d-flex align-center justify-space-between py-1"
          >
            <v-checkbox
              v-model="objectTranslationMapEventDraftSelection[item.id]"
              :label="item.label"
              :disabled="item.totalStrings <= 0"
              hide-details
              dense
              class="ma-0 pa-0"
            ></v-checkbox>
            <span class="caption grey--text text--lighten-1">left {{item.leftStrings}} of {{item.totalStrings}}</span>
          </div>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn text color="grey" @click="closeMapEventsSelectionModal">Cancel</v-btn>
        <v-btn text color="primary" :disabled="objectTranslationMapEventsLoading" @click="saveMapEventsSelection">Save</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</div>
  `,

  data() {
    return {
      service: OBJECT_TRANSLATION_SERVICE,
    };
  },

  computed: {
    objectTranslationDialogVisible: {
      get() {
        return this.service.state.dialogVisible;
      },
      set(value) {
        this.service.state.dialogVisible = !!value;
      },
    },

    objectTranslationMapEventsDialogVisible: {
      get() {
        return this.service.state.mapEventsDialogVisible;
      },
      set(value) {
        this.service.state.mapEventsDialogVisible = !!value;
      },
    },

    objectTranslationMapEventsSearch: {
      get() {
        return this.service.state.mapEventsSearch;
      },
      set(value) {
        this.service.state.mapEventsSearch = value;
      },
    },

    objectTranslationModalStats() {
      return this.service.state.modalStats;
    },

    objectTranslationModalExtraStats() {
      return this.service.state.modalExtraStats;
    },

    objectTranslationSelection() {
      return this.service.state.selection;
    },

    objectTranslationMapEventsLoading() {
      return this.service.state.mapEventsLoading;
    },

    objectTranslationMapEventDraftSelection() {
      return this.service.state.mapEventDraftSelection;
    },

    filteredObjectTranslationMapEventDetails() {
      const items = Array.isArray(this.service.state.mapEventDetails)
        ? this.service.state.mapEventDetails
        : [];
      const search = (this.objectTranslationMapEventsSearch || "")
        .trim()
        .toLowerCase();
      if (!search) {
        return items;
      }

      return items.filter((item) => {
        const label = String(item.label || "").toLowerCase();
        const id = String(item.id || "").toLowerCase();
        return label.includes(search) || id.includes(search);
      });
    },
  },

  methods: {
    openMapEventsSelectionModal() {
      this.service.openMapSelection();
    },

    closeObjectTranslationModal() {
      this.service.closeModal();
    },

    startObjectTranslationFromModal(dryRun = false) {
      this.service.startObjectTranslationFromModal(!!dryRun);
    },

    closeMapEventsSelectionModal() {
      this.service.closeMapSelection();
    },

    selectAllMapEventsForObjectTranslation() {
      this.service.selectAllMaps();
    },

    deselectAllMapEventsForObjectTranslation() {
      this.service.deselectAllMaps();
    },

    saveMapEventsSelection() {
      this.service.saveMapSelection();
    },
  },
};
