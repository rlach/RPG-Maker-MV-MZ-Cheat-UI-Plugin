import { Key } from '../js/KeyCodes.js';

export default {
    name: 'ShortcutPanel',

    template: `
<v-text-field
    :model-value="showingText"
    :label="label"
    :single-line="solo"
    :variant="solo ? 'solo' : outlined ? 'outlined' : 'filled'"
    :bg-color="backgroundColor" density="compact"
    hide-details
    @keydown.stop.prevent="onShortcutInput"
    @focus="$event.target.select()">
    <template v-slot:append-inner>
        <v-btn class="cheat-shortcut-clear" variant="text"
            v-if="deletable"
            :disabled="shortcut.isEmpty()" size="small"
            :style="deleteBtnStyle"
            icon
            @click="onDeleteClick">
            <v-icon size="small">mdi-close-circle</v-icon>
        </v-btn>
    </template>
</v-text-field>
    `,

    data() {
        return {};
    },

    emits: ['update:shortcut', 'change'],

    props: {
        shortcut: {
            type: Key,
            default: () => Key.createEmpty(),
        },

        deletable: {
            type: Boolean,
            default: true,
        },

        label: {
            type: String,
            default: '',
        },

        solo: {
            type: Boolean,
            default: false,
        },

        outlined: {
            type: Boolean,
            default: false,
        },

        backgroundColor: {
            type: String,
            default: undefined,
        },

        combiningKeyAlone: {
            type: Boolean,
            default: false,
        },
    },

    computed: {
        deleteBtnStyle() {
            return `opacity: ${this.shortcut.isEmpty() ? 0 : 0.7}`;
        },

        showingText() {
            return this.shortcut.asDisplayString();
        },
    },

    methods: {
        onDeleteClick() {
            const eventKey = Key.createEmpty();
            this.$emit('change', eventKey);
            this.$emit('update:shortcut', eventKey);
        },

        onShortcutInput(e) {
            const eventKey = Key.fromEvent(e);

            if (eventKey.isCombiningKey() && !this.combiningKeyAlone) {
                return;
            }

            if (!eventKey.equals(this.shortcut)) {
                this.$emit('change', eventKey);
            }

            this.$emit('update:shortcut', eventKey);
        },
    },
};
