import { KEY_VALUE_STORAGE } from '../js/KeyValueStorage.js';
import { TRANSLATE_SETTINGS, TRANSLATOR } from '../js/TranslateHelper.js';
import { getRowsPerPage, setRowsPerPage } from '../js/TableSettings.js';

export default {
    name: 'SaveRecallPanel',

    template: `
<v-card flat class="cheat-refresh-panel ma-0 pa-0 fill-height panel-with-sticky-table">
    <v-card-text  class="cheat-panel-header pt-1 pb-1">
        <v-card-subtitle class="ma-0 pa-n2 pb-2">Save Location</v-card-subtitle>
        <span class="body-2 text-green">Map : {{currentMapName}}</span>
        <v-text-field
            ref="locationAliasField"
            label="Location Alias" variant="solo" single-line
            bg-color="grey-darken-3"
            v-model="locationAliasInput" density="compact"
            hide-details
            class="mt-2"
            @keydown.stop="onLocationAliasKeyDown"
            @focus="$event.target.select()">
            <template v-slot:append>
                <cheat-tooltip location="bottom">
                    <span>Save current location</span>
                    <template v-slot:activator="{ props: activatorProps }">
                        <v-btn variant="elevated" aria-label="Save current location"
                            class="mt-n1"
                            color="teal" size="small" icon

                            v-bind="activatorProps"
                            @click="onAddLocation">
                            <v-icon>mdi-plus</v-icon>
                        </v-btn>
                    </template>
                </cheat-tooltip>
            </template>
        </v-text-field>
    </v-card-text>

    <v-card-subtitle class="ma-0 pa-0 mt-2">Recall Location</v-card-subtitle>
    <v-card-text class="pt-1 pb-1">
        <v-text-field
            label="Search..." variant="solo" single-line
            bg-color="grey-darken-3"
            v-model="search" density="compact"
            hide-details
            @keydown.stop
            @focus="$event.target.select()">
        </v-text-field>
    </v-card-text>
    <v-data-table return-object
        v-if="tableHeaders"
        class="table-with-sticky-footer"
        :headers="uiTableHeaders(tableHeaders)"
        :items="tableItems"
        :search="search"
        :custom-filter="(value, query, item) => tableItemFilter(value, query, item.raw)"
        v-model:items-per-page="rowsPerPage">
        <template
            v-slot:item.coord="{ item }">
            {{ item.coord.x }}, {{ item.coord.y }}
        </template>
        <template
            v-slot:item.actions="{ item, index }">

            <cheat-tooltip location="bottom">
                <span>Teleport</span>
                <template v-slot:activator="{ props: activatorProps }">
                    <v-btn variant="text"
                        color="green" size="x-small" icon
                        v-bind="activatorProps"

                        @click="teleportLocation(item.mapId, item.coord.x, item.coord.y)">
                        <v-icon size="small">mdi-map-marker</v-icon>
                    </v-btn>
                </template>
            </cheat-tooltip>


            <cheat-tooltip location="bottom">
                <span>Delete location</span>
                <template v-slot:activator="{ props: activatorProps }">
                    <v-btn variant="text"
                        color="red"
                        class="ml-2" size="x-small" icon
                        v-bind="activatorProps"

                        @click="removeLocation(index)">
                        <v-icon size="small">mdi-delete</v-icon>
                    </v-btn>
                </template>
            </cheat-tooltip>
        </template>
    </v-data-table>

    <cheat-tooltip location="bottom">
        <span>Reload from game data</span>
        <template v-slot:activator="{ props: activatorProps }">
            <v-btn class="cheat-refresh" variant="elevated"

                color="pink" aria-label="Reload from game data" size="small" icon
                v-bind="activatorProps"

                @click="initializeVariables">
                <v-icon>mdi-refresh</v-icon>
            </v-btn>
        </template>
    </cheat-tooltip>
</v-card>
    `,

    data() {
        return {
            locationAliasInput: '',

            search: '',

            rowsPerPage: getRowsPerPage(),

            locations: [],

            currentMapName: '',

            tableHeaders: [
                {
                    text: 'Name',
                    value: 'name',
                },
                {
                    text: 'Map',
                    value: 'mapName',
                },
                {
                    text: 'Coord',
                    value: 'coord',
                },
                {
                    text: 'Actions',
                    value: 'actions',
                },
            ],
        };
    },

    mounted() {
        this.initializeVariables();
        this.$refs.locationAliasField.focus();
    },

    watch: {
        rowsPerPage(val) {
            const parsed = Number(val);
            if (!Number.isFinite(parsed) || parsed <= 0) {
                return;
            }

            if (parsed !== val) {
                this.rowsPerPage = parsed;
                return;
            }

            setRowsPerPage(parsed);
        },
    },

    computed: {
        tableItems() {
            return this.locations.map((location, idx) => {
                return {
                    name: location.name,
                    mapName: $dataMapInfos[location.mapId]
                        ? $dataMapInfos[location.mapId].name
                        : 'NULL',
                    mapId: location.mapId,
                    coord: {
                        x: location.x,
                        y: location.y,
                    },
                };
            });
        },

        filteredTableItems() {
            return this.tableItems.filter((item) => {
                if (this.excludeNameless && !item.name) {
                    return false;
                }

                return true;
            });
        },
    },

    methods: {
        async initializeVariables() {
            this.loadLocations();
            this.currentMapName = await this.getMapFullPath($gameMap.mapId());
        },

        async getMapFullPath(id) {
            if (!id || !$dataMapInfos[id]) {
                return 'NULL';
            }

            let fullPath = [];
            this.getMapAncestors(id, fullPath);

            fullPath = fullPath.map((id) => $dataMapInfos[id].name).join(' / ');

            if (TRANSLATE_SETTINGS.isMapTranslateEnabled()) {
                return await TRANSLATOR.translate(fullPath);
            }

            return fullPath;
        },

        getMapAncestors(id, path) {
            path.push(id);
            if ($dataMapInfos[id].parentId === 0) {
                path.reverse();
                return;
            }

            this.getMapAncestors($dataMapInfos[id].parentId, path);
        },

        saveLocations() {
            KEY_VALUE_STORAGE.setItem('cheat.locations', JSON.stringify(this.locations));
        },

        loadLocations() {
            const data = KEY_VALUE_STORAGE.getItem('cheat.locations');

            if (!data) {
                this.locations = [];
                return;
            }

            this.locations = JSON.parse(data);
        },

        onLocationAliasKeyDown(e) {
            if (e.code === 'Enter') {
                this.onAddLocation();
            }
        },

        onAddLocation() {
            this.addLocation(this.locationAliasInput);
            this.locationAliasInput = '';
            this.$refs.locationAliasField.blur();
        },

        addLocation(locationAlias) {
            this.locations.push({
                name: locationAlias,
                mapId: $gameMap.mapId(),
                x: $gamePlayer.x,
                y: $gamePlayer.y,
            });
            this.saveLocations();
        },

        removeLocation(index) {
            this.locations.splice(index, 1);
            this.saveLocations();
        },

        teleportLocation(mapId, x, y) {
            $gamePlayer.reserveTransfer(mapId, x, y, $gamePlayer.direction(), 0);
            $gamePlayer.setPosition(x, y);
        },

        tableItemFilter(value, search, item) {
            if (search === null || search.trim() === '') {
                return true;
            }

            search = search.toLowerCase();

            return (
                item.name.toLowerCase().includes(search) ||
                item.mapName.toLowerCase().includes(search) ||
                String(item.value).toLowerCase().includes(search)
            );
        },
    },
};
