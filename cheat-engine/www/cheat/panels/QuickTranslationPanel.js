import {
    getTextLayoutCapacities,
    getManualTextLayoutCapacities,
    TEXT_LAYOUT_CHANGED_EVENT,
} from '../js/translation-runtime/TextLayoutProviders.js';
import { ensureTranslationRuntime } from '../js/translation-runtime/TranslationRuntime.js';
import { onTranslateCacheRuntimeChanged } from '../js/TranslateCacheRuntime.js';
import { getRootWindow, subscribeRootWindowEvent } from '../js/RootWindowState.js';
import { GLOBAL_SHORTCUT } from '../js/GlobalShortcut.js';
import TranslationConnection from '../components/TranslationConnection.js';
import {
    getQuickTranslationState,
    QUICK_TRANSLATION_EVENT,
    quickTranslate,
} from '../js/translation-runtime/QuickTranslation.js';

const TEXT_LAYOUT_FIELDS = [
    ['message', 'Dialogue'],
    ['message_portrait', 'Dialogue with portrait'],
    ['description', 'Descriptions'],
];

export default {
    name: 'QuickTranslationPanel',
    components: { TranslationConnection },

    template: `
        <v-card flat>
            <v-card-title>Quick Start</v-card-title>
            <v-card-text>
                <translation-connection />
                <v-select
                    :model-value="sourceLang"
                    :items="languageOptions"
                    :disabled="status.active"
                    item-title="text"
                    label="Source Language"
                    variant="outlined"
                    density="compact"
                    @update:model-value="updateLanguage('sourceLang', $event)"
                />
                <v-select
                    :model-value="targetLang"
                    :items="languageOptions"
                    :disabled="status.active"
                    item-title="text"
                    label="Target Language"
                    variant="outlined"
                    density="compact"
                    @update:model-value="updateLanguage('targetLang', $event)"
                />
                <v-table density="compact" class="mb-3">
                    <caption class="text-left">
                        Detected digits per line
                        <span v-if="manualTextWidths"> · Manual widths in use
                            <v-btn variant="text" size="x-small" @click="showDetectedValues = !showDetectedValues">
                                {{ showDetectedValues ? 'Hide detected values' : 'Show detected values' }}
                            </v-btn>
                        </span>
                    </caption>
                    <thead>
                        <tr>
                            <th scope="col">Text</th>
                            <th scope="col" class="text-end">−1</th>
                            <th scope="col" class="text-end font-weight-bold">Base</th>
                            <th scope="col" class="text-end">+1</th>
                            <th scope="col" class="text-end">+2</th>
                            <th scope="col" class="text-end">Rows</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="row in textLayouts" :key="row.label">
                            <th scope="row" class="font-weight-regular">{{ row.label }}</th>
                            <td v-for="size in ['minus1', 'base', 'plus1', 'plus2']" :key="size"
                                class="text-end" :class="{ 'font-weight-bold': size === 'base' }">
                                {{ row[size] ?? '—' }}
                                <small v-if="manualTextWidths && showDetectedValues" class="text-medium-emphasis font-weight-regular">({{ row.detected[size] ?? '—' }})</small>
                            </td>
                            <td class="text-end">{{ row.maxRows ?? '—' }}</td>
                        </tr>
                    </tbody>
                </v-table>
                <v-btn color="primary" :loading="status.active" @click="start">
                    Quick translate
                </v-btn>
                <div v-if="status.message" class="mt-3" :class="{ 'text-error': status.error }"
                    role="status" aria-live="polite" style="white-space: pre-line">
                    {{ status.message }}
                    <div v-if="status.showWidthPreview">
                        Replace current message with width preview ({{ widthPreviewShortcut }})
                    </div>
                </div>
                <v-alert v-if="status.suspicions?.total" type="warning" variant="tonal" class="mt-3"
                    :title="status.suspicions.total + ' suspicious translations'">
                    <v-table density="compact" class="my-2">
                        <thead><tr><th scope="col">Issue</th><th scope="col">Occurrences</th></tr></thead>
                        <tbody>
                            <tr v-for="issue in status.suspicions.issues" :key="issue.id">
                                <td>{{ issue.label }}</td><td>{{ issue.count }}</td>
                            </tr>
                        </tbody>
                    </v-table>
                    Open Cache Manager and set Suspicious to Only to review the flagged translations.
                </v-alert>
                <div v-else-if="status.suspicions" class="mt-3">0 suspicious translations</div>
            </v-card-text>
        </v-card>
    `,

    data() {
        return {
            status: {},
            sourceLang: '',
            targetLang: '',
            languageOptions: [],
            widthPreviewShortcut: '',
            textLayouts: [],
            manualTextWidths: false,
            showDetectedValues: false,
        };
    },

    created() {
        this._runtime = ensureTranslationRuntime();
        this._unsubscribeQuickTranslation = subscribeRootWindowEvent(
            QUICK_TRANSLATION_EVENT,
            this.refresh
        );
        this._unsubscribeLanguages = onTranslateCacheRuntimeChanged(({ reason }) => {
            if (reason === 'settings-language' || reason === 'settings-text-wrapping')
                this.refresh();
        });
        this._unsubscribeTextLayouts = subscribeRootWindowEvent(
            TEXT_LAYOUT_CHANGED_EVENT,
            this.refresh
        );
        this.refresh();
    },

    activated() {
        this.refresh();
    },

    beforeUnmount() {
        this._unsubscribeQuickTranslation();
        this._unsubscribeLanguages();
        this._unsubscribeTextLayouts();
    },

    methods: {
        refresh() {
            this.status = { ...getQuickTranslationState() };
            this.sourceLang = this._runtime.sourceLang;
            this.targetLang = this._runtime.targetLang;
            this.languageOptions = this._runtime.languageOptions;
            this.manualTextWidths = this._runtime.manuallySetTextWidths;
            this.textLayouts = TEXT_LAYOUT_FIELDS.map(([type, label]) => {
                const layout = this._runtime.getAutomaticTextLayout(type, { preview: true });
                const detected = getTextLayoutCapacities(layout);
                const runtime = this._runtime;
                const width =
                    type === 'message_portrait'
                        ? runtime.maxLineWidthWithPortrait
                        : type === 'description' && !runtime.linkDescriptionMaxWidthToDialogue
                          ? runtime.descriptionMaxLineWidth
                          : runtime.maxLineWidth;
                return {
                    label,
                    ...(this.manualTextWidths
                        ? getManualTextLayoutCapacities(width, runtime.textWrapFontScaleMultiplier)
                        : detected),
                    detected,
                    maxRows: layout?.maxRows,
                };
            });
            if (this.status.showWidthPreview) {
                const shortcuts = getRootWindow().GLOBAL_SHORTCUT || GLOBAL_SHORTCUT;
                const key = shortcuts.getShortcut('replaceCurrentMessageWithWidthPreview');
                this.widthPreviewShortcut =
                    key && !key.isEmpty() ? key.asDisplayString() : 'Unassigned';
            }
        },

        updateLanguage(field, language) {
            if (getQuickTranslationState().active) return;
            this._runtime[field] = language;
            if (field === 'sourceLang') this._runtime.onChangeSourceLang();
            else this._runtime.onChangeTargetLang();
            this.refresh();
        },

        async start() {
            await quickTranslate(this._runtime);
        },
    },
};
