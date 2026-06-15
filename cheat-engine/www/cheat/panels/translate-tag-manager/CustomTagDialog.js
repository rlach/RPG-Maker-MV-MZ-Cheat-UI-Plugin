import { TAG_OVERRIDABLE_FIELDS } from '../../translate-engines/ai-engine/constants.js';

export default {
    name: 'CustomTagDialog',

    props: {
        visible: {
            type: Boolean,
            default: false,
        },
        form: {
            type: Object,
            required: true,
        },
        editIndex: {
            type: Number,
            default: -1,
        },
        readOnlyMode: {
            type: Boolean,
            default: false,
        },
        tagStyleOptions: {
            type: Array,
            default: () => [],
        },
        tagTypeOptions: {
            type: Array,
            default: () => [],
        },
        tagBracketOptions: {
            type: Array,
            default: () => [],
        },
    },

    computed: {
        title() {
            if (this.readOnlyMode) {
                return 'Edit Tag Overrides';
            }
            return this.editIndex >= 0 ? 'Edit Custom Tag' : 'Add Custom Tag';
        },

        bracketOptionsForStyle() {
            if (this.form.style === 'xml') {
                return this.tagBracketOptions;
            }
            return this.tagBracketOptions.filter((item) => item.value !== 'none');
        },
    },

    methods: {
        isFieldDisabled(fieldName) {
            return this.readOnlyMode && !TAG_OVERRIDABLE_FIELDS.includes(fieldName);
        },

        cancel() {
            this.$emit('update:visible', false);
            this.$emit('cancel');
        },

        save() {
            this.$emit('save');
        },
    },

    template: `
<v-dialog :value="visible" max-width="560" scrollable @keydown.stop @input="$emit('update:visible', $event)">
    <v-card dark class="pt-2">
        <v-card-title class="subtitle-1 font-weight-bold">
            {{ title }}
        </v-card-title>
        <v-card-text style="max-height: 62vh; overflow-y: auto;">
            <v-text-field
                v-model="form.description"
                label="Description"
                outlined
                dense
                hide-details
                :disabled="isFieldDisabled('description')"
                @keydown.stop
                class="mb-2"
            ></v-text-field>

            <v-text-field
                v-model="form.tagSymbol"
                label="Tag Symbol"
                outlined
                dense
                hide-details
                :disabled="isFieldDisabled('tagSymbol')"
                @keydown.stop
                class="mb-2"
            ></v-text-field>

            <v-select
                v-model="form.style"
                :items="tagStyleOptions"
                label="Style"
                outlined
                dense
                hide-details
                :disabled="isFieldDisabled('style')"
                @keydown.stop
                class="mb-2"
            ></v-select>

            <v-select
                v-model="form.type"
                :items="tagTypeOptions"
                label="Type"
                outlined
                dense
                hide-details
                :disabled="isFieldDisabled('type')"
                @keydown.stop
                class="mb-2"
            ></v-select>

            <v-checkbox
                v-model="form.requiredConsistency"
                label="Required consistency"
                hide-details
                :disabled="isFieldDisabled('requiredConsistency')"
                class="mt-0 mb-2"
            ></v-checkbox>

            <v-text-field
                v-model.number="form.reservedWidth"
                type="number"
                min="0"
                step="1"
                label="Reserved width"
                outlined
                dense
                hide-details
                @keydown.stop
                class="mb-2"
            ></v-text-field>

            <v-textarea
                v-model="form.extraPromptForLlm"
                label="Extra prompt for LLM"
                outlined
                dense
                hide-details
                rows="3"
                auto-grow
                @keydown.stop
                class="mb-2"
            ></v-textarea>
            <div class="caption grey--text text--lighten-1 mb-2">
                Tag name will be listed before the description.
            </div>

            <template v-if="form.type === 'withCustomParameter'">
                <v-select
                    v-model="form.bracket"
                    :items="bracketOptionsForStyle"
                    label="Bracket"
                    outlined
                    dense
                    hide-details
                    :disabled="isFieldDisabled('bracket')"
                    @keydown.stop
                    class="mb-2"
                ></v-select>

                <v-checkbox
                    v-model="form.maskValue"
                    label="Mask value (preserve exact value, LLM cannot change it)"
                    hide-details
                    :disabled="isFieldDisabled('maskValue')"
                    class="mt-0 mb-2"
                ></v-checkbox>

                <v-checkbox
                    v-model="form.alwaysTranslate"
                    :disabled="form.maskValue || isFieldDisabled('alwaysTranslate')"
                    label="Prompt LLM to always translate"
                    hide-details
                    class="mt-0 mb-2"
                ></v-checkbox>

                <v-checkbox
                    v-model="form.alwaysAddToKnowledgeBase"
                    :disabled="form.maskValue || isFieldDisabled('alwaysAddToKnowledgeBase')"
                    label="Ask LLM to always add translations to knowledge base"
                    hide-details
                    class="mt-0 mb-2"
                ></v-checkbox>
            </template>
        </v-card-text>
        <v-card-actions>
            <v-spacer></v-spacer>
            <v-btn text color="grey" @click="cancel">Cancel</v-btn>
            <v-btn text color="primary" @click="save">Save</v-btn>
        </v-card-actions>
    </v-card>
</v-dialog>
  `,
};
