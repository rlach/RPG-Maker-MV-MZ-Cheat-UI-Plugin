import { MESSAGE_LOG } from '../js/MessageLogStore.js';

export default {
    name: 'TextLogPanel',

    template: `
<v-card flat class="ma-0 pa-0" style="background: transparent; height: 100%; overflow: hidden; display: flex; flex-direction: column;">
    <v-card-subtitle class="pb-0 font-weight-bold">Text Log</v-card-subtitle>
    <div class="py-1 px-4 caption" style="margin: 0;">
      Latest messages are at the bottom. Text is selectable and can be copied.
    </div>
    <div class="py-1 px-2 d-flex align-center" style="margin: 0;">
      <v-spacer></v-spacer>
      <v-btn
        small
        text
        color="primary"
        :disabled="!hasSelection"
        @click="onCopy"
        style="opacity: 1 !important;">
        <span :style="!hasSelection ? 'color: rgba(255,255,255,0.4)' : ''">Copy</span>
      </v-btn>
      <v-btn
        small
        text
        color="red"
        @click="onClearMessages">
        Clear Log
      </v-btn>
    </div>
    <div style="flex: 1 1 0%; min-height: 0; padding: 0 8px 0 8px; display: flex; flex-direction: column;">
      <div
        ref="messageLogContainer"
        style="flex: 1 1 0%; min-height: 0; overflow-y: auto; background: white; color: black; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; padding: 8px; user-select: text;">
        <pre
          v-for="(entry, index) in messageEntries"
          :key="entry.id"
          :style="{ 'background-color': index % 2 === 0 ? 'white' : '#f5f5f5', marginBottom: '2px' }"
          style="white-space: pre-wrap; margin: 0; font-family: 'Fira Code', 'Consolas', monospace; font-size: 12px;">
{{ formatMessageEntry(entry) }}
        </pre>
      </div>
    </div>
  </div>
</v-card>
    `,

    data() {
        return {
            messageEntries: [],
            messageUnsubscribe: null,
            hasSelection: false,
        };
    },

    created() {
        this.messageUnsubscribe = MESSAGE_LOG.subscribe((entries) => {
            this.messageEntries = entries;
            this.$nextTick(() => this.scrollToBottom());
        });

        document.addEventListener('selectionchange', this.onSelectionChange);
    },

    beforeDestroy() {
        if (this.messageUnsubscribe) {
            this.messageUnsubscribe();
            this.messageUnsubscribe = null;
        }

        document.removeEventListener('selectionchange', this.onSelectionChange);
    },

    methods: {
        formatMessageEntry(entry) {
            const date = new Date(entry.timestamp);
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');
            const speaker = entry.speakerName ? ` ${entry.speakerName}: ` : ' ';
            return `[${hours}:${minutes}:${seconds}]${speaker}${entry.text}`;
        },

        scrollToBottom() {
            const container = this.$refs.messageLogContainer;
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        },

        async onCopy() {
            const selection = window.getSelection();
            const text = selection ? selection.toString() : '';

            if (!text || !this.hasSelection) {
                return;
            }

            try {
                if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(text);
                } else {
                    const textarea = document.createElement('textarea');
                    textarea.value = text;
                    textarea.style.position = 'fixed';
                    textarea.style.top = '-1000px';
                    document.body.appendChild(textarea);
                    textarea.focus();
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                }
            } catch (err) {
                console.warn('[TextLogPanel] Failed to copy log', err);
            }
        },

        onClearMessages() {
            MESSAGE_LOG.clear();
        },

        onSelectionChange() {
            try {
                const sel = window.getSelection();
                const text = sel ? sel.toString() : '';
                if (!text) {
                    this.hasSelection = false;
                    return;
                }

                const messageContainer = this.$refs.messageLogContainer;
                if (!messageContainer) {
                    this.hasSelection = false;
                    return;
                }

                const anchorNode = sel.anchorNode;
                const focusNode = sel.focusNode;

                const withinMessage =
                    messageContainer &&
                    anchorNode &&
                    messageContainer.contains(anchorNode) &&
                    focusNode &&
                    messageContainer.contains(focusNode);

                this.hasSelection = withinMessage && text.trim().length > 0;
            } catch (err) {
                this.hasSelection = false;
            }
        },
    },
};
