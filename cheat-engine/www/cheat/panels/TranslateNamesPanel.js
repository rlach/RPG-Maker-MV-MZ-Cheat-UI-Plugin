import { ensureTranslationRuntime } from "./translate-on-the-fly/TranslationRuntime.js";

export default {
  name: "TranslateNamesPanel",

  template: `
<v-card flat class="ma-0 pa-0">
    <v-tabs v-model="activeTab" dark background-color="grey darken-3">
        <v-tab>Cached Names</v-tab>
        <v-tab>Database Names</v-tab>
    </v-tabs>

    <v-tabs-items v-model="activeTab" dark>
        <!-- TAB 1: Cached Names -->
        <v-tab-item>
            <v-card-title class="subtitle-1 font-weight-bold">Cached Speaker Names</v-card-title>
            <v-card-text class="py-0">
                <div class="caption">
                    Edit cached speaker name translations (keys prefixed with name_).
                </div>
                <div class="mt-2 d-flex align-center">
                    <v-btn small outlined color="primary" class="mr-2" @click="refresh" :loading="loading">
                        <v-icon small left>mdi-refresh</v-icon>
                        Refresh
                    </v-btn>
                    <v-text-field
                        v-model="filter"
                        label="Filter"
                        dense
                        hide-details
                        clearable
                        @keydown.stop
                        style="max-width: 220px;">
                    </v-text-field>
                </div>
            </v-card-text>

            <v-card-text class="py-0">
                <div v-if="!loading && filteredEntries.length === 0" class="caption text--secondary mt-2">
                    No cached speaker names found.
                </div>

                <v-simple-table v-else dense class="mt-2">
                    <thead>
                        <tr>
                            <th class="text-left caption" style="width: 40%;">Original Name</th>
                            <th class="text-left caption" style="width: 40%;">Translated Value</th>
                            <th class="text-left caption" style="width: 20%;">Save</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="entry in filteredEntries" :key="entry.key">
                            <td class="caption white--text">{{ entry.originalName }}</td>
                            <td>
                                <v-text-field
                                    v-model="entry.value"
                                    dense
                                    hide-details
                                    @change="onEntryChange(entry)"
                                    @keydown.stop
                                    class="mt-0 pt-0">
                                </v-text-field>
                            </td>
                            <td>
                                <v-btn
                                    x-small
                                    outlined
                                    color="primary"
                                    :loading="entry.saving"
                                    @click="saveEntry(entry)">
                                    Save
                                </v-btn>
                            </td>
                        </tr>
                    </tbody>
                </v-simple-table>
            </v-card-text>
        </v-tab-item>

        <!-- TAB 2: Database Names -->
        <v-tab-item>
            <v-card-title class="subtitle-1 font-weight-bold">Actor Database Names</v-card-title>
            <v-card-text class="py-0">
                <div class="caption">
                    Edit actor names directly from the database. Changes are applied immediately.
                </div>
                <div class="mt-2 d-flex align-center">
                    <v-text-field
                        v-model="dbFilter"
                        label="Filter"
                        dense
                        hide-details
                        clearable
                        @keydown.stop
                        style="max-width: 220px;">
                    </v-text-field>
                </div>
            </v-card-text>

            <v-card-text class="py-0">
                <div v-if="filteredDatabaseNames.length === 0" class="caption text--secondary mt-2">
                    No actors found in database.
                </div>

                <v-simple-table v-else dense class="mt-2">
                    <thead>
                        <tr>
                            <th class="text-left caption" style="width: 15%;">ID</th>
                            <th class="text-left caption" style="width: 50%;">Actor Name</th>
                            <th class="text-left caption" style="width: 35%;">Edit</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="actor in filteredDatabaseNames" :key="actor.id">
                            <td class="caption white--text">{{ actor.id }}</td>
                            <td class="caption white--text">{{ actor.originalName }}</td>
                            <td>
                                <v-text-field
                                    v-model="actor.name"
                                    dense
                                    hide-details
                                    @input="onDatabaseNameChange(actor)"
                                    @keydown.stop
                                    class="mt-0 pt-0">
                                </v-text-field>
                            </td>
                        </tr>
                    </tbody>
                </v-simple-table>
            </v-card-text>
        </v-tab-item>
    </v-tabs-items>
</v-card>
    `,

  data() {
    return {
      activeTab: 0,
      loading: false,
      filter: "",
      dbFilter: "",
      entries: [],
      databaseNames: [],
    };
  },

  created() {
    this.refresh();
    this.loadDatabaseNames();
  },

  computed: {
    filteredEntries() {
      console.log("filtering entries with term:", this.entries);
      const term = (this.filter || "").toLowerCase();
      if (!term) {
        return this.entries;
      }

      return this.entries.filter((entry) => {
        return (
          entry.key.toLowerCase().includes(term) ||
          entry.originalName.toLowerCase().includes(term) ||
          (entry.value && entry.value.toLowerCase().includes(term))
        );
      });
    },

    filteredDatabaseNames() {
      const term = (this.dbFilter || "").toLowerCase();
      if (!term) {
        return this.databaseNames;
      }

      return this.databaseNames.filter((actor) => {
        return (
          actor.id.toString().includes(term) ||
          actor.originalName.toLowerCase().includes(term) ||
          (actor.name && actor.name.toLowerCase().includes(term))
        );
      });
    },
  },

  methods: {
    refresh() {
      this.loading = true;
      try {
        const cache = window.__TranslateOnTheFlyCache;
        this.entries = this.buildNameEntries(cache);
      } catch (err) {
        console.warn("[TranslateNamesPanel] Failed to load cache", err);
        this.entries = [];
      } finally {
        this.loading = false;
      }
    },

    loadDatabaseNames() {
      try {
        this.databaseNames = [];
        const dataActors = window.$dataActors;

        if (typeof dataActors !== "undefined" && Array.isArray(dataActors)) {
          const cache = window.__TranslateOnTheFlyCache;
          for (let i = 1; i < dataActors.length; i++) {
            const actor = dataActors[i];
            if (actor && actor.name) {
              const originalName = actor._translateOriginal
                ? actor._translateOriginal.name
                : actor.name;
              // Try to get cached name translation
              const cacheKey = `actor_name:ja-en-${originalName}`;
              const cachedName = cache ? cache.get(cacheKey) : null;

              this.databaseNames.push({
                id: i,
                originalName: originalName,
                name: cachedName || actor.name,
                cacheKey: cacheKey,
                _actor: actor,
              });
            }
          }
        }
      } catch (err) {
        console.warn(
          "[TranslateNamesPanel] Failed to load database names",
          err,
        );
        this.databaseNames = [];
      }
    },

    buildNameEntries(map) {
      const result = [];
      if (!map || typeof map.entries !== "function") {
        return result;
      }
      for (const [key, value] of map.entries()) {
        if (!this.isSpeakerNameKey(key)) {
          continue;
        }
        result.push({
          key,
          value,
          originalName: this.extractOriginalName(key),
          saving: false,
        });
      }
      return result;
    },

    isSpeakerNameKey(key) {
      return (
        typeof key === "string" &&
        key.startsWith("speaker:") &&
        key.includes("name_")
      );
    },

    extractOriginalName(key) {
      if (typeof key !== "string") {
        return "";
      }

      return key.replace(/.*name_/, "");
    },

    onEntryChange(entry) {
      entry.dirty = true;
    },

    onDatabaseNameChange(actor) {
      const runtime = ensureTranslationRuntime();

      // Update the database actor directly
      if (actor._actor) {
        actor._actor.name = actor.name;
      }

      // Update game actor instance if it exists
      if (
        window.$gameActors &&
        typeof window.$gameActors.actor === "function"
      ) {
        const gameActor = window.$gameActors.actor(actor.id);
        if (gameActor) {
          gameActor._name = actor.name;
        }
      }

      // Save to cache
      if (runtime && actor.cacheKey) {
        runtime.setCacheValue(actor.cacheKey, actor.name);
      }
    },

    saveEntry(entry) {
      if (!entry || !entry.key) {
        return;
      }

      const runtime = ensureTranslationRuntime();
      entry.saving = true;
      const valueToSave = entry.value || "";

      runtime.setCacheValue(entry.key, valueToSave);

      entry.saving = false;
      entry.dirty = false;
    },
  },
};
