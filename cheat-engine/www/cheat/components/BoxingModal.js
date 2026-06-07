import { parseCacheKeyForLangPair } from '../js/TranslateCacheRuntime.js';
import { ensureTranslationRuntime } from '../js/translation-runtime/TranslationRuntime.js';
import { DEFAULT_BOXING_PROMPT, TAG_CONFIGS } from '../translate-engines/ai-engine/constants.js';
import { createTranslationBatchManager } from '../translate-engines/batch-manager/TranslationBatchManagerFactory.js';

const DESCRIPTION_TYPES = [
    'item_description',
    'armor_description',
    'weapon_description',
    'skill_description',
    'actor_profile',
];

// Maps base entity type → short LLM key prefix
const BASE_TYPE_TO_PREFIX = {
    item: 'i',
    armor: 'a',
    weapon: 'w',
    skill: 's',
    class: 'c',
    enemy: 'e',
    actor: 'r',
    map: 'mp',
    state: 'st',
};

function getTypePrefix(cacheType) {
    if (cacheType.endsWith('_description')) {
        const base = cacheType.slice(0, -'_description'.length);
        return BASE_TYPE_TO_PREFIX[base] || base[0] || '?';
    }
    return BASE_TYPE_TO_PREFIX[cacheType] || cacheType[0] || '?';
}

function createEmptyTypeStat(type) {
    return { type, translatedCount: 0, untranslatedCount: 0 };
}

function shouldIncludeType(type, showAllTypes) {
    return showAllTypes || DESCRIPTION_TYPES.includes(type);
}

function ensureTypeStat(statsMap, type) {
    if (!statsMap[type]) {
        statsMap[type] = createEmptyTypeStat(type);
    }

    return statsMap[type];
}

function tallyCacheEntry(statsMap, parsed, value) {
    const typeStat = ensureTypeStat(statsMap, parsed.type);
    const currentValue = typeof value === 'string' ? value : '';

    if (currentValue === '') {
        const original = typeof parsed.original === 'string' ? parsed.original.trim() : '';
        if (original) {
            typeStat.untranslatedCount++;
        }
        return;
    }

    typeStat.translatedCount++;
}

function makeObservable(value) {
    if (globalThis.Vue && typeof globalThis.Vue.observable === 'function') {
        return globalThis.Vue.observable(value);
    }
    return value;
}

function buildBtagInfo() {
    // Find tags with reservedWidth > 0 (excluding simpleN/sn which is handled separately)
    const withWidth = TAG_CONFIGS.filter(
        (t) => typeof t.reservedWidth === 'number' && t.reservedWidth > 0
    );

    let base =
        'You must not edit [b=...] tags. Tags with a <value> part (e.g. [b=na<Name>]) count as the length of their <value> in characters. All other [b=...] tags count as 0 characters';

    if (withWidth.length > 0) {
        const exceptions = withWidth
            .map((t) => `[b=${t.tagSymbol}] (${t.reservedWidth} chars)`)
            .join(', ');
        base += `, with exception of: ${exceptions}`;
    }

    return base + '.';
}

function buildBoxingSystemMessage(basePrompt, cacheTypes, widthInChars, maxRows) {
    const presentTypes = cacheTypes.filter((t) => t.endsWith('_description'));

    // Build type prefix hints for types present in the request
    const typeHints = presentTypes
        .map((t) => {
            const base = t.slice(0, -'_description'.length);
            const prefix = getTypePrefix(t);
            return `Keys starting with '${prefix}' are ${base} descriptions`;
        })
        .join(', ');

    const btagInfo = buildBtagInfo();

    const dynamicSuffix =
        `\n\nBox size for descriptions is ${widthInChars}x${maxRows}.` +
        (typeHints ? `\n${typeHints}.` : '') +
        `\n\n${btagInfo}`;

    const promptBase = typeof basePrompt === 'string' ? basePrompt : DEFAULT_BOXING_PROMPT;
    return promptBase + dynamicSuffix;
}

function removeShortNewlines(text, maxCount) {
    if (typeof text !== 'string' || text === '') {
        return '';
    }

    if (!Number.isFinite(maxCount) || maxCount <= 0) {
        return text;
    }

    const pattern = String.raw`(?<!\n)\n{1,` + maxCount + String.raw`}(?!\n)`;
    const regex = new RegExp(pattern, 'g');
    return text.replace(regex, ' ');
}

class BoxingService {
    constructor() {
        this.state = makeObservable({
            dialogVisible: false,
            typeStats: [], // [{ type, translatedCount, untranslatedCount }]
            selection: {}, // type -> boolean
            showAllTypes: false,
            llmPrompt: DEFAULT_BOXING_PROMPT,
            onlyReformatWithoutLlm: false,
            isRunning: false,
        });
    }

    _buildTypeStats(runtime, showAllTypes = false) {
        const statsMap = {};

        if (!showAllTypes) {
            for (const type of DESCRIPTION_TYPES) {
                statsMap[type] = createEmptyTypeStat(type);
            }
        }

        for (const [cacheKey, value] of runtime.translationCache.entries()) {
            const parsed = parseCacheKeyForLangPair(
                cacheKey,
                runtime.sourceLang,
                runtime.targetLang
            );
            if (!parsed || !shouldIncludeType(parsed.type, showAllTypes)) {
                continue;
            }

            tallyCacheEntry(statsMap, parsed, value);
        }

        return Object.values(statsMap).filter(
            (s) => s.translatedCount > 0 || s.untranslatedCount > 0
        );
    }

    refreshTypeStats(runtime) {
        const typeStats = this._buildTypeStats(runtime, this.state.showAllTypes);
        const selection = { ...this.state.selection };

        for (const stat of typeStats) {
            if (!(stat.type in selection)) {
                selection[stat.type] =
                    stat.translatedCount > 0 && DESCRIPTION_TYPES.includes(stat.type);
            }
        }

        this.state.typeStats = typeStats;
        this.state.selection = selection;
    }

    setShowAllTypes(showAllTypes) {
        const nextValue = !!showAllTypes;
        if (this.state.showAllTypes === nextValue) {
            return;
        }

        this.state.showAllTypes = nextValue;

        let runtime;
        try {
            runtime = ensureTranslationRuntime();
        } catch {
            return;
        }

        this.refreshTypeStats(runtime);
    }

    openModal() {
        let runtime;
        try {
            runtime = ensureTranslationRuntime();
        } catch {
            console.error('[BoxingService] Translation runtime not initialized');
            return;
        }

        if (runtime.isNonOtfTranslationProcessActive()) {
            const label = runtime.getActiveNonOtfTranslationProcessLabel();
            runtime.notify('warn', `Another translation is already in progress (${label}).`);
            return;
        }

        if (!runtime.translationCache || !runtime.sourceLang || !runtime.targetLang) {
            runtime.notify('warn', 'Translation runtime is not ready.');
            return;
        }

        this.state.showAllTypes = false;
        this.state.selection = {};
        this.refreshTypeStats(runtime);
        this.state.llmPrompt = DEFAULT_BOXING_PROMPT;
        this.state.onlyReformatWithoutLlm = false;
        this.state.isRunning = false;
        this.state.dialogVisible = true;
    }

    closeModal() {
        this.state.dialogVisible = false;
    }

    runLocalReformat(runtime, selectedTypes) {
        const typeSet = new Set(selectedTypes);
        const widthInChars = runtime.descriptionMaxLineWidth || runtime.maxLineWidth || 59;
        const removeShortCount = Number(runtime.removeNewlinesBeforeWrappingMaxCount);
        let updatedCount = 0;

        for (const [cacheKey, value] of runtime.translationCache.entries()) {
            const parsed = parseCacheKeyForLangPair(
                cacheKey,
                runtime.sourceLang,
                runtime.targetLang
            );
            if (!parsed || !typeSet.has(parsed.type)) {
                continue;
            }

            const currentValue = typeof value === 'string' ? value : '';
            if (currentValue === '') {
                continue;
            }

            const newlineNormalized = removeShortNewlines(currentValue, removeShortCount);
            const wrapped = runtime.wrapText(
                runtime.cleanTranslatedText(newlineNormalized),
                widthInChars
            );

            if (wrapped === currentValue) {
                continue;
            }

            runtime.setCacheValue(cacheKey, wrapped, {
                persist: false,
                notify: false,
            });
            updatedCount += 1;
        }

        if (updatedCount > 0) {
            runtime.persistCache();
            runtime.notifyCacheRuntime('cache-set');
        }

        runtime.notify('info', `Reformatted ${updatedCount} cached descriptions without LLM.`);
    }

    async runLlmBoxing(runtime, selectedTypes, widthInChars, maxRows) {
        const boxingSystemMessage = buildBoxingSystemMessage(
            this.state.llmPrompt,
            selectedTypes,
            widthInChars,
            maxRows
        );

        if (!runtime.beginNonOtfTranslationProcess('descriptions cleanup')) {
            return;
        }

        this.state.isRunning = true;
        this.state.dialogVisible = false;

        try {
            if (!runtime.batchManager) {
                runtime.batchManager = createTranslationBatchManager(runtime);
            }

            const maxItems =
                Number(runtime.batchItemsLimit) > 0 ? Number(runtime.batchItemsLimit) : 300;
            const maxChars = Number(runtime.charLimit) > 0 ? Number(runtime.charLimit) : 1500;

            await runtime.batchManager.runBatchedTranslation([
                {
                    kind: 'descriptionsCleanup',
                    cacheTypes: selectedTypes,
                    boxingSystemMessage,
                    backgroundJob: false,
                    itemLimit: maxItems,
                    charLimit: maxChars,
                    showSummary: true,
                },
            ]);
        } catch (error) {
            console.error('[BoxingService] Boxing failed', error);
            const message = error instanceof Error ? error.message : String(error);
            runtime.notify('error', 'Boxing failed: ' + message);
        } finally {
            this.state.isRunning = false;
            runtime.endNonOtfTranslationProcess();
        }
    }

    runLocalBoxing(runtime, selectedTypes) {
        this.state.isRunning = true;
        this.state.dialogVisible = false;

        try {
            this.runLocalReformat(runtime, selectedTypes);
        } catch (error) {
            console.error('[BoxingService] Local reformat failed', error);
            const message = error instanceof Error ? error.message : String(error);
            runtime.notify('error', 'Local reformat failed: ' + message);
        } finally {
            this.state.isRunning = false;
        }
    }

    async startBoxing() {
        let runtime;
        try {
            runtime = ensureTranslationRuntime();
        } catch {
            console.error('[BoxingService] Translation runtime not initialized');
            return;
        }

        if (runtime.isNonOtfTranslationProcessActive()) {
            const label = runtime.getActiveNonOtfTranslationProcessLabel();
            runtime.notify('warn', `Another translation is already in progress (${label}).`);
            return;
        }

        const selectedTypes = this.state.typeStats
            .filter((stat) => this.state.selection[stat.type])
            .map((stat) => stat.type);

        if (!selectedTypes.length) {
            runtime.notify('warn', 'No description types selected.');
            return;
        }

        const widthInChars = runtime.descriptionMaxLineWidth || 59;
        const maxRows = runtime.descriptionMaxRows || 2;

        if (this.state.onlyReformatWithoutLlm) {
            this.runLocalBoxing(runtime, selectedTypes);
            return;
        }

        await this.runLlmBoxing(runtime, selectedTypes, widthInChars, maxRows);
    }
}

export const BOXING_SERVICE = new BoxingService();

export default {
    name: 'BoxingModal',

    template: `
<div>
  <v-dialog
    v-model="dialogVisible"
    max-width="640"
    @keydown.stop
    @mousedown.stop
    @mouseup.stop
    @click.stop
    @wheel.stop
  >
    <v-card dark>
      <v-card-title class="subtitle-1 font-weight-bold">Boxing</v-card-title>
      <v-card-text class="caption pb-1">
        Ask the LLM to reformat existing description translations to fit within a given box size.
        Only works for already-translated cache entries. Untranslated entries won't be processed.
      </v-card-text>

      <v-card-text class="pt-1 pb-0">
        <div class="subtitle-2 mb-2">Entries to adjust:</div>
        <template v-if="typeStats.length === 0">
          <div class="caption grey--text">No translated description entries found for current language pair.</div>
        </template>
        <template v-else>
                    <div class="d-flex align-center mb-2">
                        <v-checkbox
                            v-model="showAllTypes"
                            label="Show all types"
                            hide-details
                            dense
                            class="ma-0 pa-0"
                        ></v-checkbox>
                    </div>
          <div
            v-for="stat in typeStats"
            :key="stat.type"
            class="d-flex align-center justify-space-between py-1"
          >
            <v-checkbox
              v-model="selection[stat.type]"
              :label="stat.type"
              :disabled="stat.translatedCount === 0"
              hide-details
              dense
              class="ma-0 pa-0"
            ></v-checkbox>
            <span class="caption grey--text text--lighten-1 ml-2">
              <template v-if="stat.untranslatedCount > 0">
                ({{ stat.translatedCount }}) ({{ stat.untranslatedCount }} still untranslated, won't be processed)
              </template>
              <template v-else>
                ({{ stat.translatedCount }})
              </template>
            </span>
          </div>
        </template>
      </v-card-text>

      <v-card-text class="pt-2">
        <div class="subtitle-2 mb-2">LLM Prompt:</div>
                <v-checkbox
                    v-model="onlyReformatWithoutLlm"
                    label="Only reformat, without LLM"
                    hide-details
                    dense
                    class="ma-0 mb-2 pa-0"
                ></v-checkbox>
        <v-textarea
          v-model="llmPrompt"
                    :disabled="onlyReformatWithoutLlm"
          outlined
          dense
          rows="8"
          hide-details
          background-color="grey darken-3"
          @keydown.stop
        ></v-textarea>
      </v-card-text>

      <v-card-text class="pt-0">
        <div class="subtitle-2 mb-2">Box size:</div>
        <div class="d-flex align-center" style="gap: 8px;">
          <v-text-field
            v-model.number="descriptionMaxLineWidth"
            label="Width (chars)"
            outlined
            dense
            type="number"
            min="20"
            max="200"
            hide-details
            background-color="grey darken-3"
            @keydown.self.stop
            @focus="$event.target.select()"
            style="flex: 1 1 auto;">
          </v-text-field>
          <v-text-field
            v-model.number="descriptionMaxRows"
            label="Max rows"
            outlined
            dense
            type="number"
            min="1"
            max="20"
            hide-details
            background-color="grey darken-3"
            @keydown.self.stop
            @focus="$event.target.select()"
            style="flex: 0 0 120px; max-width: 120px;">
          </v-text-field>
        </div>
      </v-card-text>

      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn text color="grey" @click="closeModal">Cancel</v-btn>
        <v-btn
          text
          color="primary"
          :disabled="!hasSelection"
          @click="startBoxing">
          Start
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</div>
`,

    computed: {
        dialogVisible: {
            get() {
                return BOXING_SERVICE.state.dialogVisible;
            },
            set(v) {
                if (!v) BOXING_SERVICE.closeModal();
            },
        },
        typeStats() {
            return BOXING_SERVICE.state.typeStats;
        },
        selection() {
            return BOXING_SERVICE.state.selection;
        },
        showAllTypes: {
            get() {
                return BOXING_SERVICE.state.showAllTypes;
            },
            set(v) {
                BOXING_SERVICE.setShowAllTypes(v);
            },
        },
        llmPrompt: {
            get() {
                return BOXING_SERVICE.state.llmPrompt;
            },
            set(v) {
                BOXING_SERVICE.state.llmPrompt = v;
            },
        },
        onlyReformatWithoutLlm: {
            get() {
                return BOXING_SERVICE.state.onlyReformatWithoutLlm;
            },
            set(v) {
                BOXING_SERVICE.state.onlyReformatWithoutLlm = !!v;
            },
        },
        descriptionMaxLineWidth: {
            get() {
                try {
                    return ensureTranslationRuntime().descriptionMaxLineWidth;
                } catch {
                    return 59;
                }
            },
            set(v) {
                try {
                    ensureTranslationRuntime().descriptionMaxLineWidth = v;
                } catch {
                    /* ignore */
                }
            },
        },
        descriptionMaxRows: {
            get() {
                try {
                    return ensureTranslationRuntime().descriptionMaxRows;
                } catch {
                    return 2;
                }
            },
            set(v) {
                try {
                    ensureTranslationRuntime().descriptionMaxRows = v;
                } catch {
                    /* ignore */
                }
            },
        },
        hasSelection() {
            return BOXING_SERVICE.state.typeStats.some(
                (stat) => BOXING_SERVICE.state.selection[stat.type]
            );
        },
    },

    methods: {
        closeModal() {
            BOXING_SERVICE.closeModal();
        },
        startBoxing() {
            BOXING_SERVICE.startBoxing();
        },
    },
};
