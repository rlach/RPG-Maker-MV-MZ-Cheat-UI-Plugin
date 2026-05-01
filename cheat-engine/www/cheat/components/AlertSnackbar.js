import { Alert } from '../js/AlertHelper.js';

export default {
    name: 'ShortcutPanel',

    template: `
<v-snackbar
    app
    top
    left
    :color="color"
    v-model="showSnackbar"
    :timeout="timeout"
    class="z-index-cheat-1">
    <span 
        v-for="(line, idx) in text"
        :key="idx"
        class="font-weight-bold caption d-block">
        <span v-if="line.html" v-html="line.value"></span>
        <span v-else>{{ line.value }}</span>
    </span>
    <template v-slot:action="{ attrs }">
    <v-btn
        x-small
        style="margin:0"
        color="white"
        icon
        v-bind="attrs"
        @click="showSnackbar = false">
        <v-icon small>mdi-close</v-icon>
    </v-btn>
    </template>
</v-snackbar>
    `,

    data() {
        return {
            showSnackbar: false,
            text: [],
            timeout: 1000,
            color: 'black',
        };
    },

    mounted() {
        Alert.alertInternal = (level, msg, err = null, timeout = 1500) => {
            let color = null;
            switch (level) {
                case 'success':
                    color = 'green';
                    break;
                case 'info':
                    color = 'blue';
                    break;
                case 'warn':
                    color = 'orange';
                    break;
                case 'error':
                    color = 'red';
                    break;
                default:
                    color = 'blue-grey';
            }

            this.show({
                text: msg,
                color: color,
                timeout: timeout,
            });
        };
    },

    created() {},

    methods: {
        normalizeText(text) {
            if (typeof text === 'string') {
                return text.split('\n').map((line) => ({
                    value: line,
                    html: false,
                }));
            }

            if (text && typeof text.text === 'string') {
                return text.text.split('\n').map((line) => ({
                    value: line,
                    html: !!text.html,
                }));
            }

            return [
                {
                    value: String(text),
                    html: false,
                },
            ];
        },

        show(options) {
            this.showSnackbar = false;

            this.text = this.normalizeText(options.text);
            this.timeout = options.timeout;
            if (options.color) {
                this.color = options.color;
            }

            this.showSnackbar = true;
        },
    },
};
