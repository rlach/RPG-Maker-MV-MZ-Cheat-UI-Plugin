let unknownTagsMemory = [];

function cloneUnknownTagsList(list) {
    return Array.isArray(list) ? list.map((item) => ({ ...item })) : [];
}

function getUnknownTagPatternStyle(pattern) {
    const value = String(pattern || '');
    if (value.startsWith('\\')) {
        return 'escape';
    }
    if (value.startsWith('<')) {
        return 'xml';
    }
    return 'other';
}

export function filterUnknownTagsListByStyle(list, styleFilter) {
    const rows = Array.isArray(list) ? list : [];
    if (styleFilter !== 'escape' && styleFilter !== 'xml') {
        return rows;
    }
    return rows.filter((item) => getUnknownTagPatternStyle(item.pattern) === styleFilter);
}

export function getUnknownTagsCacheStringCount(cache) {
    if (!cache) {
        return 0;
    }

    let count = 0;
    const keys = cache instanceof Map ? cache.keys() : cache;
    for (const key of keys) {
        if (typeof key === 'string') {
            count += 1;
        }
    }
    return count;
}

export function guessConfigFromPattern(pattern) {
    const xmlMatch = /^<([A-Za-z][A-Za-z0-9]*)(?::(.+))?>$/.exec(pattern);
    if (xmlMatch) {
        const sym = xmlMatch[1];
        const val = xmlMatch[2];
        let type = 'withoutParameter';
        if (val === 'N') type = 'withNumericParameter';
        else if (val === '…') type = 'withCustomParameter';
        return {
            description: sym.toLowerCase(),
            tagSymbol: sym,
            style: 'xml',
            type,
            bracket: 'none',
            maskValue: false,
            requiredConsistency: false,
            reservedWidth: 0,
            extraPromptForLlm: '',
            alwaysTranslate: false,
            alwaysAddToKnowledgeBase: false,
        };
    }

    const escMatch = /^\\([A-Za-z${}|.!><^][A-Za-z0-9]*)(.*)$/.exec(pattern);
    if (escMatch) {
        const sym = escMatch[1];
        const rest = escMatch[2] || '';
        let type = 'withoutParameter';
        let bracket = '<';
        if (rest === '[N]') {
            type = 'withNumericParameter';
        } else if (rest === '[…]') {
            type = 'withCustomParameter';
            bracket = '[';
        } else if (rest === '<…>') {
            type = 'withCustomParameter';
        } else if (rest === '(…)') {
            type = 'withCustomParameter';
            bracket = '(';
        } else if (rest === '{…}') {
            type = 'withCustomParameter';
            bracket = '{';
        }
        return {
            description: sym.toLowerCase(),
            tagSymbol: sym,
            style: 'escape',
            type,
            bracket,
            maskValue: false,
            requiredConsistency: false,
            reservedWidth: 0,
            extraPromptForLlm: '',
            alwaysTranslate: false,
            alwaysAddToKnowledgeBase: false,
        };
    }

    return {
        description: '',
        tagSymbol: '',
        style: 'escape',
        type: 'withNumericParameter',
        bracket: '<',
        maskValue: false,
        requiredConsistency: false,
        reservedWidth: 0,
        extraPromptForLlm: '',
        alwaysTranslate: false,
        alwaysAddToKnowledgeBase: false,
    };
}

export default {
    name: 'UnknownTagsModal',

    props: {
        visible: {
            type: Boolean,
            default: false,
        },
        runtime: {
            type: Object,
            default: null,
        },
        resolvedPattern: {
            type: String,
            default: '',
        },
    },

    data() {
        return {
            unknownTagsList: cloneUnknownTagsList(unknownTagsMemory),
            unknownTagStyleFilter: 'both',
            unknownTagsCacheStringCount: 0,
            isScanning: false,
            unknownTagsHeaders: [
                { text: 'Pattern', value: 'pattern' },
                { text: 'Count', value: 'count', width: 90 },
                { text: 'Add', value: 'add', width: 60, sortable: false },
            ],
        };
    },

    computed: {
        filteredUnknownTagsList() {
            return filterUnknownTagsListByStyle(this.unknownTagsList, this.unknownTagStyleFilter);
        },

        escapeStyleCount() {
            return filterUnknownTagsListByStyle(this.unknownTagsList, 'escape').length;
        },

        xmlStyleCount() {
            return filterUnknownTagsListByStyle(this.unknownTagsList, 'xml').length;
        },

        totalUnknownTagsCount() {
            return this.unknownTagsList.length;
        },

        activeFilterCount() {
            return this.filteredUnknownTagsList.length;
        },

        emptyMessage() {
            if (this.totalUnknownTagsCount > 0 && this.activeFilterCount === 0) {
                return 'No tags matching current filter';
            }
            return `No unknown tags found. Click "Scan cache" to scan for unrecognized tag patterns in the translation cache. Cache size: ${this.unknownTagsCacheStringCount} strings`;
        },
    },

    watch: {
        visible(value) {
            if (!value) {
                return;
            }

            this.unknownTagStyleFilter = 'both';
            this.unknownTagsCacheStringCount = getUnknownTagsCacheStringCount(
                this.runtime?.translationCache
            );
        },

        resolvedPattern(value) {
            if (!value) {
                return;
            }

            this.unknownTagsList = this.unknownTagsList.filter((item) => item.pattern !== value);
            unknownTagsMemory = cloneUnknownTagsList(this.unknownTagsList);
        },
    },

    methods: {
        close() {
            this.$emit('update:visible', false);
            this.$emit('closed');
        },

        scanCache() {
            const engine = this.runtime?.engine;
            if (!engine || typeof engine.scanForUnknownTags !== 'function') {
                return;
            }

            this.isScanning = true;
            this.unknownTagsList = [];

            setTimeout(() => {
                try {
                    const cache = this.runtime.translationCache || new Map();
                    this.unknownTagsCacheStringCount = getUnknownTagsCacheStringCount(cache);
                    const results = engine.scanForUnknownTags(cache);
                    this.unknownTagsList = results;
                    unknownTagsMemory = cloneUnknownTagsList(results);
                } catch (err) {
                    console.warn('[TagManager] scanForUnknownTags failed:', err);
                } finally {
                    this.isScanning = false;
                }
            }, 0);
        },

        requestCreateTag(item) {
            this.$emit('create-custom-tag', {
                pattern: item.pattern,
                form: guessConfigFromPattern(item.pattern),
            });
        },
    },

    template: `
<v-dialog :value="visible" max-width="700" @keydown.stop @input="$emit('update:visible', $event)">
    <v-card dark class="pt-2">
        <v-card-title class="subtitle-1 font-weight-bold d-flex align-center">
            <span>Find Possible Unknown Tags</span>
            <v-spacer></v-spacer>
            <v-btn
                small
                outlined
                color="primary"
                :loading="isScanning"
                @click="scanCache">
                <v-icon small left>mdi-refresh</v-icon>
                Scan cache
            </v-btn>
        </v-card-title>

        <v-card-text class="pb-1">
            <v-btn-toggle
                v-model="unknownTagStyleFilter"
                mandatory
                dense
                class="mb-2">
                <v-btn small value="escape">Escape style ({{ escapeStyleCount }})</v-btn>
                <v-btn small value="xml">XML style ({{ xmlStyleCount }})</v-btn>
                <v-btn small value="both">Both ({{ totalUnknownTagsCount }})</v-btn>
            </v-btn-toggle>

            <div v-if="filteredUnknownTagsList.length === 0 && !isScanning" class="caption grey--text text--lighten-1">
                {{ emptyMessage }}
            </div>
        </v-card-text>

        <v-data-table
            v-if="filteredUnknownTagsList.length > 0"
            :headers="unknownTagsHeaders"
            :items="filteredUnknownTagsList"
            :items-per-page="20"
            :sort-by="'count'"
            :sort-desc="true"
            dense
            class="mx-4"
            style="background: transparent;">
            <template v-slot:item.pattern="{ item }">
                <span class="caption font-weight-bold" style="font-family: monospace;">{{ item.pattern }}</span>
            </template>
            <template v-slot:item.count="{ item }">
                <span class="caption">{{ item.count }}</span>
            </template>
            <template v-slot:item.add="{ item }">
                <v-btn icon x-small color="primary" @click="requestCreateTag(item)">
                    <v-icon small>mdi-plus</v-icon>
                </v-btn>
            </template>
        </v-data-table>

        <v-card-actions>
            <v-spacer></v-spacer>
            <v-btn text color="grey" @click="close">Close</v-btn>
        </v-card-actions>
    </v-card>
</v-dialog>
  `,
};
