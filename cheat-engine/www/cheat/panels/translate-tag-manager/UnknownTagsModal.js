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

export function findTagExamples(cache, pattern) {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let source = escaped
        .replace(/…/g, '[^\\n]*?')
        .replace(/\\\[N\\\]$/, '\\[\\d+\\]')
        .replace(/:N>$/, ':\\d+>');
    if (pattern.startsWith('\\')) source = '(?:\\\\|\\x1b)' + source.slice(2);
    const hasParameter = /[>\])}]$/.test(pattern);
    const regex = new RegExp(source + (hasParameter ? '' : '(?![A-Za-z0-9\\[<({])'), 'gi');
    const examples = [];
    for (const key of cache?.keys() || []) {
        if (typeof key !== 'string') continue;
        const text = key.replace(/^[^:]+:[^-]+-[^-]+-/, '');
        const parts = [];
        let end = 0;
        for (const match of text.matchAll(regex)) {
            parts.push({ text: text.slice(end, match.index), highlighted: false });
            parts.push({ text: match[0], highlighted: true });
            end = match.index + match[0].length;
        }
        if (!parts.length) continue;
        parts.push({ text: text.slice(end), highlighted: false });
        examples.push(parts);
    }
    return examples;
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
            exampleOpen: false,
            examplePattern: '',
            examples: [],
            exampleIndex: -1,
            unknownTagsHeaders: [
                { text: 'Pattern', value: 'pattern' },
                { text: 'Count', value: 'count', width: 90 },
                { text: 'Actions', value: 'add', width: 100, sortable: false },
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
            const total = this.unknownTagsList.length;
            const active = this.filteredUnknownTagsList.length;
            if (total > 0 && active === 0) {
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

        showExamples(item) {
            this.examplePattern = item.pattern;
            this.examples = findTagExamples(this.runtime?.translationCache, item.pattern);
            this.exampleIndex = -1;
            this.recycleExample();
            this.$emit('update:visible', false);
            this.$nextTick(() => {
                this.exampleOpen = true;
            });
        },

        recycleExample() {
            const count = this.examples.length;
            if (!count) return;
            const skip = this.exampleIndex >= 0 && count > 1;
            let index = Math.floor(Math.random() * (count - (skip ? 1 : 0)));
            if (skip && index >= this.exampleIndex) index++;
            this.exampleIndex = index;
        },

        closeExample(value) {
            if (value) return;
            this.exampleOpen = false;
            this.$nextTick(() => {
                this.$emit('update:visible', true);
            });
        },

        requestCreateTag(item) {
            this.$emit('create-custom-tag', {
                pattern: item.pattern,
                form: guessConfigFromPattern(item.pattern),
            });
        },
    },

    template: `
<v-dialog :model-value="visible" max-width="700" @keydown.stop @update:model-value="$emit('update:visible', $event)">
    <v-card class="pt-2">
        <v-card-title class="text-subtitle-1 font-weight-bold d-flex align-center">
            <span>Find Possible Unknown Tags</span>
            <v-spacer></v-spacer>
            <v-btn size="small" variant="outlined"
                color="primary"
                :loading="isScanning"
                @click="scanCache">
                <v-icon size="small" left>mdi-refresh</v-icon>
                Scan cache
            </v-btn>
        </v-card-title>

        <v-card-text class="pb-1">
            <v-btn-toggle
                v-model="unknownTagStyleFilter"
                mandatory density="compact"
                class="mb-2">
                <v-btn size="small" value="escape">Escape style ({{ escapeStyleCount }})</v-btn>
                <v-btn size="small" value="xml">XML style ({{ xmlStyleCount }})</v-btn>
                <v-btn size="small" value="both">Both ({{ totalUnknownTagsCount }})</v-btn>
            </v-btn-toggle>

            <div v-if="filteredUnknownTagsList.length === 0 && !isScanning" class="text-caption text-grey-lighten-1">
                {{ emptyMessage }}
            </div>
        </v-card-text>

        <v-data-table return-object
            v-if="filteredUnknownTagsList.length > 0"
            :headers="uiTableHeaders(unknownTagsHeaders)"
            :items="filteredUnknownTagsList"
            :items-per-page="20"
            :sort-by="uiTableSort('count', true)" density="compact"
            class="cheat-unknown-tags-table mx-4"
            style="background: transparent;">
            <template v-slot:item.pattern="{ item }">
                <span class="text-caption font-weight-bold" style="font-family: monospace;">{{ item.pattern }}</span>
            </template>
            <template v-slot:item.count="{ item }">
                <span class="text-caption">{{ item.count }}</span>
            </template>
            <template v-slot:item.add="{ item }">
                <div class="d-flex flex-nowrap">
                <v-btn variant="text" icon size="x-small" color="primary" aria-label="Show usage examples" @click="showExamples(item)">
                    <v-icon size="small">mdi-text-search</v-icon>
                </v-btn>
                <v-btn variant="text" icon size="x-small" color="primary" aria-label="Add custom tag" @click="requestCreateTag(item)">
                    <v-icon size="small">mdi-plus</v-icon>
                </v-btn>
                </div>
            </template>
        </v-data-table>

        <v-card-actions>
            <v-spacer></v-spacer>
            <v-btn variant="text" color="grey" @click="close">Close</v-btn>
        </v-card-actions>
    </v-card>
</v-dialog>
<v-dialog :model-value="exampleOpen" max-width="800" @keydown.stop @update:model-value="closeExample">
    <v-card>
        <v-card-title>Usage examples — {{ examplePattern }}</v-card-title>
        <v-card-text>
            <p v-if="!examples.length">No matching examples remain in the cache.</p>
            <pre v-else class="pa-4 rounded border" style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:55vh;overflow:auto"><template v-for="(part, index) in examples[exampleIndex]" :key="index"><mark v-if="part.highlighted" style="background:#ffeb3b;color:#111">{{ part.text }}</mark><span v-else>{{ part.text }}</span></template></pre>
        </v-card-text>
        <v-card-actions>
            <v-btn variant="text" :disabled="examples.length < 2" @click="recycleExample"><v-icon start>mdi-recycle</v-icon>Another example</v-btn>
            <v-spacer></v-spacer>
            <v-btn variant="text" @click="closeExample(false)">Close</v-btn>
        </v-card-actions>
    </v-card>
</v-dialog>
  `,
};
