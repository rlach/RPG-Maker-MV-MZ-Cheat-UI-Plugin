import GeneralPanel from './panels/GeneralPanel.js';
import HealthSettingPanel from './panels/HealthSettingPanel.js';
import StatsSettingPanel from './panels/StatsSettingPanel.js';
import ItemSettingPanel from './panels/ItemSettingPanel.js';
import WeaponSettingPanel from './panels/WeaponSettingPanel.js';
import ArmorSettingPanel from './panels/ArmorSettingPanel.js';
import VariableSettingPanel from './panels/VariableSettingPanel.js';
import SwitchSettingPanel from './panels/SwitchSettingPanel.js';
import SaveRecallPanel from './panels/SaveRecallPanel.js';
import TeleportPanel from './panels/TeleportPanel.js';
import TextLogPanel from './panels/TextLogPanel.js';
import ShortcutPanel from './panels/ShortcutPanel.js';
import TranslateOnTheFlyPanel from './panels/TranslateOnTheFlyPanel.js';
import TranslateNamesPanel from './panels/TranslateNamesPanel.js';
import TranslateCacheManagerPanel from './panels/TranslateCacheManagerPanel.js';
import TranslateImagesPanel from './panels/TranslateImagesPanel.js';
import TranslateKnowledgePanel from './panels/TranslateKnowledgePanel.js';
import TranslateTagManagerPanel from './panels/TranslateTagManagerPanel.js';
import HacksPanel from './panels/HacksPanel.js';
import { CHEAT_WINDOW_MANAGER } from './js/CheatWindowManager.js';

export default {
    name: 'CheatModal',

    components: {
        GeneralPanel,
        HealthSettingPanel,
        StatsSettingPanel,
        ItemSettingPanel,
        WeaponSettingPanel,
        ArmorSettingPanel,
        VariableSettingPanel,
        SwitchSettingPanel,
        SaveRecallPanel,
        TeleportPanel,
        TextLogPanel,
        ShortcutPanel,
        TranslateOnTheFlyPanel,
        TranslateNamesPanel,
        TranslateCacheManagerPanel,
        TranslateImagesPanel,
        TranslateKnowledgePanel,
        TranslateTagManagerPanel,
        HacksPanel,
    },

    template: `
<v-card
    dark
    class="z-index-cheat-0 resizable-overlay"
    :width="overlayWidth"
    :height="overlayHeight">
    <v-row
        class="fill-height ma-0 pa-0">
        <div
            :style="'width: ' + navWidth + 'px;'"
            class="fill-height d-inline pa-2 overflow-y-auto hide-scrollbar">
            <v-treeview
                :active.sync="navTreeModel"
                transition
                return-object
                open-all
                dense
                :items="navTreeItems"
                activatable
                item-key="name"
                open-on-click
                @update:active="onNavTreeUpdate">
                <template v-slot:label="{item}">
                    <v-icon v-text="item.icon" small class="mx-0 px-0 align-self-center"></v-icon>
                    <span class="subtitle-2">{{item.name}}</span>
                </template>
            </v-treeview>
        </div>
        <v-divider vertical></v-divider>
        <div
            :style="'width: calc(100% - ' + navWidth + 'px - 1px);'"
            class="fill-height d-inline pa-2 overflow-y-auto hide-scrollbar">
            <keep-alive>
                <component :is="currentComponentName"></component>
            </keep-alive>
        </div>
    </v-row>
</v-card>
    `,

    model: {
        prop: 'currentComponentName',
        event: 'change',
    },

    props: {
        currentComponentName: {
            type: String,
        },
    },

    data() {
        return {
            navWidth: 200,

            navTreeModel: undefined,

            navTreeItems: [
                {
                    name: 'General',
                    icon: 'mdi-hammer-screwdriver',
                    component: 'general-panel',
                },
                {
                    name: 'Shortcuts',
                    icon: 'mdi-keyboard-outline',
                    component: 'shortcut-panel',
                },
                {
                    name: 'HP/MP/Battle',
                    icon: 'mdi-battery-70',
                    component: 'health-setting-panel',
                },
                {
                    name: 'Stats/Level',
                    icon: 'mdi-sword-cross',
                    component: 'stats-setting-panel',
                },
                {
                    name: 'Items',
                    icon: 'mdi-bag-personal-outline',
                    children: [
                        {
                            name: 'Item',
                            icon: 'mdi-flask-empty-plus',
                            component: 'item-setting-panel',
                        },
                        {
                            name: 'Weapon',
                            icon: 'mdi-sword',
                            component: 'weapon-setting-panel',
                        },
                        {
                            name: 'Armor',
                            icon: 'mdi-shield-plus',
                            component: 'armor-setting-panel',
                        },
                    ],
                },
                {
                    name: 'Variables',
                    icon: 'mdi-variable',
                    component: 'variable-setting-panel',
                },
                {
                    name: 'Switches',
                    icon: 'mdi-toggle-switch',
                    component: 'switch-setting-panel',
                },
                {
                    name: 'Save Locations',
                    icon: 'mdi-map-marker-plus',
                    component: 'save-recall-panel',
                },
                {
                    name: 'Teleport',
                    icon: 'mdi-run-fast',
                    component: 'teleport-panel',
                },
                {
                    name: 'Text Log',
                    icon: 'mdi-text-box-outline',
                    component: 'text-log-panel',
                },
                {
                    name: 'Translations',
                    icon: 'mdi-cog',
                    children: [
                        {
                            name: 'Settings',
                            icon: 'mdi-translate',
                            component: 'translate-on-the-fly-panel',
                        },
                        {
                            name: 'Names Manager',
                            icon: 'mdi-account-edit',
                            component: 'translate-names-panel',
                        },
                        {
                            name: 'Tag Manager',
                            icon: 'mdi-tag-multiple',
                            component: 'translate-tag-manager-panel',
                        },
                        {
                            name: 'Cache Manager',
                            icon: 'mdi-table-search',
                            component: 'translate-cache-manager-panel',
                        },
                        {
                            name: 'Knowledge',
                            icon: 'mdi-book-open-variant',
                            component: 'translate-knowledge-panel',
                        },
                        {
                            name: 'Images',
                            icon: 'mdi-folder-image',
                            component: 'translate-images-panel',
                        },
                    ],
                },
                {
                    name: 'Hacks',
                    icon: 'mdi-wrench-cog',
                    component: 'hacks-panel',
                },
            ],
            overlayWidth: 700,
            overlayHeight: 400,
            resizeObserver: null,
        };
    },

    computed: {
        componentNameToNavItem() {
            const ret = {};
            this.iterateLeaf(this.navTreeItems, (item) => {
                ret[item.component] = item;
            });
            return ret;
        },
    },

    mounted() {
        const size = CHEAT_WINDOW_MANAGER.getOverlaySize();
        if (size && Number.isFinite(size.width) && Number.isFinite(size.height)) {
            this.overlayWidth = size.width;
            this.overlayHeight = size.height;
        }

        this.initResizeObserver();

        let navItem = this.componentNameToNavItem[this.currentComponentName];

        if (!navItem) {
            navItem = Object.values(this.componentNameToNavItem)[0];
            this.$emit('change', navItem.component);
        }
        this.navTreeModel = [navItem];
    },

    methods: {
        initResizeObserver() {
            if (!window.ResizeObserver) {
                return;
            }

            this.resizeObserver = new ResizeObserver((entries) => {
                if (!entries || !entries.length) return;
                const rect = entries[0].contentRect;
                if (!rect) return;
                const newWidth = Math.round(rect.width);
                const newHeight = Math.round(rect.height);

                const changed = newWidth !== this.overlayWidth || newHeight !== this.overlayHeight;
                this.overlayWidth = newWidth;
                this.overlayHeight = newHeight;

                if (changed) {
                    CHEAT_WINDOW_MANAGER.setOverlaySize(newWidth, newHeight);
                }
            });

            this.$nextTick(() => {
                if (this.$el && this.resizeObserver) {
                    this.resizeObserver.observe(this.$el);
                }
            });
        },

        onNavTreeUpdate(data) {
            if (data && data.length === 1) {
                this.$emit('change', data[0].component);
            }
        },

        iterateLeaf(node, leafFunc) {
            if (Array.isArray(node)) {
                for (const item of node) {
                    this.iterateLeaf(item, leafFunc);
                }
            } else if (Object.hasOwnProperty.call(node, 'children')) {
                this.iterateLeaf(node.children, leafFunc);
            } else {
                leafFunc(node);
            }
        },
    },

    beforeDestroy() {
        if (this.resizeObserver && this.$el) {
            try {
                this.resizeObserver.unobserve(this.$el);
            } catch (_e) { /* observer cleanup */ }
        }
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
    },
};
