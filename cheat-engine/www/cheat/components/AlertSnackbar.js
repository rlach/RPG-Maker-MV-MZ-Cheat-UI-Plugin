import { Alert } from '../js/AlertHelper.js';

export default {
    name: 'ShortcutPanel',

    template: `
<v-snackbar
    :key="activeNotification ? activeNotification.id : 0"
    app
    top
    left
    :color="color"
    v-model="showSnackbar"
    :timeout="-1"
    @input="onVisibilityChange"
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
        @click="dismiss()">
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
            notifications: [],
            activeNotification: null,
            nextNotificationId: 0,
            dismissalTimer: null,
        };
    },

    mounted() {
        this.previousAlertHandler = Alert.alertInternal;
        this.alertHandler = (level, msg, err = null, timeout = 1500) => {
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
        Alert.alertInternal = this.alertHandler;
    },

    beforeDestroy() {
        clearTimeout(this.dismissalTimer);
        this.notifications = [];
        this.activeNotification = null;
        if (Alert.alertInternal === this.alertHandler)
            Alert.alertInternal = this.previousAlertHandler;
    },

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
            this.notifications.push({
                ...options,
                id: ++this.nextNotificationId,
                text: this.normalizeText(options.text),
            });
            this.showNext();
        },
        showNext() {
            if (this.activeNotification || !this.notifications.length) return;
            const notification = this.notifications.shift();
            this.activeNotification = notification;
            this.text = notification.text;
            this.color = notification.color || 'black';
            this.timeout = notification.timeout ?? 1500;
            this.showSnackbar = true;
            this.$nextTick(() => {
                if (this.activeNotification?.id !== notification.id || this.timeout <= 0) return;
                this.dismissalTimer = setTimeout(() => this.dismiss(notification.id), this.timeout);
            });
        },
        dismiss(id = this.activeNotification?.id) {
            if (!this.activeNotification || this.activeNotification.id !== id) return;
            clearTimeout(this.dismissalTimer);
            this.dismissalTimer = null;
            this.showSnackbar = false;
            this.activeNotification = null;
            this.$nextTick(() => this.showNext());
        },
        onVisibilityChange(visible) {
            if (!visible) this.dismiss();
        },
    },
};
