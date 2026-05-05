import { OBJECT_TRANSLATION_SERVICE } from '../panels/translate-on-the-fly/ObjectTranslationService.js';

export default {
    name: 'ObjectTranslationModalHost',

    template: `
<div>
  <v-dialog
    v-model="objectTranslationDialogVisible"
    :persistent="objectTranslationDataGathering"
    max-width="640"
    content-class="object-translation-dialog"
    @keydown.stop
    @mousedown.stop
    @mouseup.stop
    @click.stop
    @wheel.stop
  >
    <v-card dark>
      <v-card-title class="subtitle-1 font-weight-bold">Mass Translation</v-card-title>
      <template v-if="objectTranslationDataGathering">
        <v-card-text class="pt-6 pb-8 d-flex flex-column align-center justify-center" style="min-height: 240px;">
          <div class="subtitle-2 mb-4">Gathering data</div>
          <v-progress-circular
            indeterminate
            color="primary"
            size="48"
            width="4"
          ></v-progress-circular>
        </v-card-text>
      </template>
      <template v-else>
      <v-card-text class="caption pb-1">Select what to translate. Counts show remaining objects and total.</v-card-text>
      <v-card-text class="pt-1">
        <template
          v-for="(item, index) in objectTranslationModalStats"
        >
          <div
            :key="item.id"
            class="d-flex align-center justify-space-between py-1"
            @dragover.prevent="onItemDragOver($event, index)"
            @drop.prevent="onItemDrop($event, index)"
          >
            <div class="d-flex align-center" style="min-width: 0; flex: 1;">
              <div
                class="mr-1 d-flex align-center"
                :draggable="!item.noDragDrop"
                :style="item.noDragDrop ? 'visibility: hidden;' : 'cursor: grab;'"
                title="Drag to reorder"
                @dragstart="onItemDragStart($event, index)"
                @dragend="onItemDragEnd"
              >
                <v-icon small color="grey lighten-1">mdi-drag-vertical</v-icon>
              </div>
              <v-checkbox
                v-model="objectTranslationSelection[item.id]"
                :label="item.label"
                :disabled="item.id !== 'cacheEmptyStrings' && item.total <= 0"
                hide-details
                dense
                class="ma-0 pa-0"
              ></v-checkbox>
            </div>
            <div class="d-flex align-center">
              <span class="caption grey--text text--lighten-1 mr-2">{{item.metaText || ('left ' + item.left + ' of ' + item.total)}}</span>
              <v-btn
                v-if="item.id === 'mapEvents' || item.id === 'plugins'"
                icon
                x-small
                color="grey lighten-1"
                :disabled="item.total <= 0"
                @click.stop="openObjectTranslationSubSelection(item.id)"
              >
                <v-icon small>mdi-cog</v-icon>
              </v-btn>
            </div>
          </div>
          <div
            v-if="item.id === 'cacheEmptyStrings'"
            :key="'repeat-' + item.id"
            class="pl-8 pb-1"
          >
            <v-checkbox
              v-model="cacheEmptyStringsRepeatUntilSuccess"
              label="Repeat until success"
              :disabled="!objectTranslationSelection['cacheEmptyStrings']"
              hide-details
              dense
              class="ma-0 pa-0"
            ></v-checkbox>
          </div>
        </template>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn text color="grey" @click="closeObjectTranslationModal">Cancel</v-btn>
        <v-btn text color="orange" @click="startObjectTranslationFromModal(true)">Dry Run</v-btn>
        <v-btn text color="primary" @click="startObjectTranslationFromModal(false)">Start</v-btn>
      </v-card-actions>
      </template>
    </v-card>
  </v-dialog>

  <v-dialog
    v-model="objectTranslationPluginsDialogVisible"
    max-width="760"
    content-class="object-translation-plugins-dialog"
    @keydown.stop
    @mousedown.stop
    @mouseup.stop
    @click.stop
    @wheel.stop
  >
    <v-card dark>
      <v-card-title class="subtitle-1 font-weight-bold">Plugins selection</v-card-title>
      <v-card-text class="caption pb-1">Choose which detected plugins should be included in object translation.</v-card-text>
      <v-card-text class="pt-1">
        <v-text-field
          v-model="objectTranslationPluginsSearch"
          label="Search plugins"
          solo
          dense
          hide-details
          background-color="grey darken-3"
          class="mb-2"
          @keydown.self.stop
          @focus="$event.target.select()"
        ></v-text-field>

        <div class="d-flex justify-end mb-2">
          <v-btn text small color="primary" @click="selectAllPluginsForObjectTranslation">Select all</v-btn>
          <v-btn text small color="grey lighten-1" @click="deselectAllPluginsForObjectTranslation">Deselect all</v-btn>
        </div>

        <div v-if="objectTranslationPluginsLoading" class="caption grey--text text--lighten-1 py-4 text-center">
          Loading plugins...
        </div>

        <div v-else style="max-height: 420px; overflow-y: auto;">
          <div
            v-for="item in filteredObjectTranslationPluginDetails"
            :key="item.id"
            class="d-flex align-center justify-space-between py-1"
          >
            <v-checkbox
              v-model="objectTranslationPluginDraftSelection[item.id]"
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
        <v-btn text color="grey" @click="closePluginsSelectionModal">Cancel</v-btn>
        <v-btn text color="primary" :disabled="objectTranslationPluginsLoading" @click="savePluginsSelection">Save</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog
    v-model="objectTranslationMapEventsDialogVisible"
    max-width="760"
    content-class="object-translation-map-events-dialog"
    @keydown.stop
    @mousedown.stop
    @mouseup.stop
    @click.stop
    @wheel.stop
  >
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
            dragSourceIndex: -1,
        };
    },

    computed: {
        objectTranslationDialogVisible: {
            get() {
                return this.service.state.dialogVisible;
            },
            set(value) {
            if (this.service.state.modalDataGathering) {
              return;
            }
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

        objectTranslationPluginsDialogVisible: {
            get() {
                return this.service.state.pluginsDialogVisible;
            },
            set(value) {
                this.service.state.pluginsDialogVisible = !!value;
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

        objectTranslationPluginsSearch: {
            get() {
                return this.service.state.pluginsSearch;
            },
            set(value) {
                this.service.state.pluginsSearch = value;
            },
        },

        objectTranslationModalStats() {
            return this.service.state.modalStats;
        },

        objectTranslationDataGathering() {
          return !!this.service.state.modalDataGathering;
        },

        objectTranslationSelection() {
            return this.service.state.selection;
        },

        cacheEmptyStringsRepeatUntilSuccess: {
            get() {
                return !!this.service.state.cacheEmptyStringsRepeatUntilSuccess;
            },
            set(v) {
                this.service.setCacheEmptyStringsRepeatUntilSuccess(!!v);
            },
        },

        objectTranslationMapEventsLoading() {
            return this.service.state.mapEventsLoading;
        },

        objectTranslationMapEventDraftSelection() {
            return this.service.state.mapEventDraftSelection;
        },

        objectTranslationPluginsLoading() {
            return this.service.state.pluginsLoading;
        },

        objectTranslationPluginDraftSelection() {
            return this.service.state.pluginDraftSelection;
        },

        filteredObjectTranslationMapEventDetails() {
            const items = Array.isArray(this.service.state.mapEventDetails)
                ? this.service.state.mapEventDetails
                : [];
            const search = (this.objectTranslationMapEventsSearch || '').trim().toLowerCase();
            if (!search) {
                return items;
            }

            return items.filter((item) => {
                const label = String(item.label || '').toLowerCase();
                const id = String(item.id || '').toLowerCase();
                return label.includes(search) || id.includes(search);
            });
        },

        filteredObjectTranslationPluginDetails() {
            const items = Array.isArray(this.service.state.pluginDetails)
                ? this.service.state.pluginDetails
                : [];
            const search = (this.objectTranslationPluginsSearch || '').trim().toLowerCase();
            if (!search) {
                return items;
            }

            return items.filter((item) => {
                const label = String(item.label || '').toLowerCase();
                const id = String(item.id || '').toLowerCase();
                return label.includes(search) || id.includes(search);
            });
        },
    },

    methods: {
        openMapEventsSelectionModal() {
            this.service.openMapSelection();
        },

        openPluginsSelectionModal() {
            this.service.openPluginSelection();
        },

        openObjectTranslationSubSelection(typeId) {
            if (typeId === 'mapEvents') {
                this.openMapEventsSelectionModal();
                return;
            }

            if (typeId === 'plugins') {
                this.openPluginsSelectionModal();
            }
        },

        closeObjectTranslationModal() {
          if (this.objectTranslationDataGathering) {
            return;
          }
            this.service.closeModal();
        },

        startObjectTranslationFromModal(dryRun = false) {
          if (this.objectTranslationDataGathering) {
            return;
          }
            this.service.startObjectTranslationFromModal(!!dryRun);
        },

        closeMapEventsSelectionModal() {
            this.service.closeMapSelection();
        },

        closePluginsSelectionModal() {
            this.service.closePluginSelection();
        },

        selectAllMapEventsForObjectTranslation() {
            this.service.selectAllMaps();
        },

        deselectAllMapEventsForObjectTranslation() {
            this.service.deselectAllMaps();
        },

        selectAllPluginsForObjectTranslation() {
            this.service.selectAllPlugins();
        },

        deselectAllPluginsForObjectTranslation() {
            this.service.deselectAllPlugins();
        },

        saveMapEventsSelection() {
            this.service.saveMapSelection();
        },

        savePluginsSelection() {
            this.service.savePluginSelection();
        },

        onItemDragStart(event, index) {
          if (this.objectTranslationDataGathering) {
            if (event) {
              event.preventDefault();
            }
            return;
          }
            const item = this.objectTranslationModalStats[index];
            if (item && item.noDragDrop) {
                if (event) {
                    event.preventDefault();
                }
                return;
            }
            this.dragSourceIndex = index;
            if (event && event.dataTransfer) {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', String(index));
            }
        },

        onItemDragOver(event, index) {
            if (this.dragSourceIndex < 0 || this.dragSourceIndex === index) {
                return;
            }

            if (event && event.dataTransfer) {
                event.dataTransfer.dropEffect = 'move';
            }
        },

        onItemDrop(event, index) {
            let fromIndex = this.dragSourceIndex;
            if (event && event.dataTransfer) {
                const raw = event.dataTransfer.getData('text/plain');
                const parsed = Number(raw);
                if (Number.isFinite(parsed)) {
                    fromIndex = parsed;
                }
            }

            this.dragSourceIndex = -1;
            this.service.reorderModalItem(fromIndex, index);
        },

        onItemDragEnd() {
            this.dragSourceIndex = -1;
        },
    },
};
