import { MESSAGE_LOG } from "../js/MessageLogStore.js";
import { CONSOLE_LOG } from "../js/ConsoleLogStore.js";

export default {
  name: "TextLogPanel",

  template: `
<v-card flat class="ma-0 pa-0" style="background: transparent; height: 100%; display: grid; grid-template-rows: auto auto 1fr;">
    <v-card-subtitle class="pb-0 font-weight-bold">Text Log</v-card-subtitle>
    
    <v-tabs v-model="activeTab" dense class="flex-shrink-0">
        <v-tab>Messages</v-tab>
        <v-tab>Console</v-tab>
    </v-tabs>

    <v-tabs-items v-model="activeTab" style="background: transparent; overflow: hidden; height: 100%;">
        <!-- Messages Tab -->
        <v-tab-item style="height: 100%;">
            <div style="height: 100%; display: flex; flex-direction: column; gap: 6px; padding: 0 0 6px 0;">
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
                <div style="flex: 1; min-height: 0; padding: 0 8px 0 8px;">
                    <div
                        ref="messageLogContainer"
                        style="height: 100%; overflow-y: auto; background: white; color: black; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; padding: 8px; user-select: text;">
                        <pre
                            v-for="(entry, index) in messageEntries"
                            :key="entry.id"
                            :style="{ 'background-color': index % 2 === 0 ? 'white' : '#f5f5f5' }"
                            style="white-space: pre-wrap; margin: 0; font-family: 'Fira Code', 'Consolas', monospace; font-size: 12px; margin-bottom: -18px;">
{{ formatMessageEntry(entry) }}
                        </pre>
                    </div>
                </div>
            </div>
        </v-tab-item>

        <!-- Console Tab -->
        <v-tab-item style="height: 100%;">
            <div style="height: 100%; display: flex; flex-direction: column; gap: 6px; padding: 0 0 6px 0;">
                <div class="py-1 px-4 caption" style="margin: 0;">
                    Console logs are captured here. Latest logs at the bottom.
                </div>
                <div class="py-1 px-2 d-flex align-center" style="margin: 0;">
                    <span style="font-size: 12px; white-space: nowrap; color: white;">Max logs:</span>
                    <v-text-field
                        v-model.number="consoleLogLimit"
                        type="text"
                        inputmode="numeric"
                        dense
                        outlined
                        hide-details
                        class="ml-2"
                        style="max-width: 80px; font-size: 12px; color: white;"
                        @keydown="onConsoleLogLimitKeydown"
                        @change="onConsoleLogLimitChange"
                    ></v-text-field>
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
                        @click="onClearConsole">
                        Clear Log
                    </v-btn>
                </div>
                <div style="flex: 1; min-height: 0; padding: 0 8px 0 8px;">
                    <div
                        ref="consoleLogContainer"
                        style="height: 100%; overflow-y: auto; background: white; color: black; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; padding: 8px; user-select: text;">
                        <pre
                            v-for="entry in consoleEntries"
                            :key="entry.id"
                            :style="getConsoleEntryStyle(entry)"
                            style="white-space: pre-wrap; margin: 0 0 6px 0; font-family: 'Fira Code', 'Consolas', monospace; font-size: 12px;">
{{ formatConsoleEntry(entry) }}
                        </pre>
                    </div>
                </div>
            </div>
        </v-tab-item>
    </v-tabs-items>
</v-card>
    `,

  data() {
    return {
      activeTab: 0,
      messageEntries: [],
      consoleEntries: [],
      messageUnsubscribe: null,
      consoleUnsubscribe: null,
      hasSelection: false,
      consoleLogLimit: 100,
    };
  },

  created() {
    this.messageUnsubscribe = MESSAGE_LOG.subscribe((entries) => {
      this.messageEntries = entries;
      this.$nextTick(() => this.scrollToBottom("message"));
    });

    this.consoleUnsubscribe = CONSOLE_LOG.subscribe((entries) => {
      this.consoleEntries = entries;
      this.$nextTick(() => this.scrollToBottom("console"));
    });

    document.addEventListener("selectionchange", this.onSelectionChange);
  },

  beforeDestroy() {
    if (this.messageUnsubscribe) {
      this.messageUnsubscribe();
      this.messageUnsubscribe = null;
    }

    if (this.consoleUnsubscribe) {
      this.consoleUnsubscribe();
      this.consoleUnsubscribe = null;
    }

    document.removeEventListener("selectionchange", this.onSelectionChange);
  },

  methods: {
    formatMessageEntry(entry) {
      const date = new Date(entry.timestamp);
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      const seconds = String(date.getSeconds()).padStart(2, "0");
      const speaker = entry.speakerName ? ` ${entry.speakerName}: ` : " ";
      return `[${hours}:${minutes}:${seconds}]${speaker}${entry.text}`;
    },

    formatConsoleEntry(entry) {
      const date = new Date(entry.timestamp);
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      const seconds = String(date.getSeconds()).padStart(2, "0");
      const millis = String(date.getMilliseconds()).padStart(3, "0");
      const level = entry.level.toUpperCase().padEnd(5, " ");

      // Format arguments
      const formattedArgs = entry.args
        .map((arg) => {
          if (typeof arg === "object" && arg !== null) {
            try {
              return JSON.stringify(arg, null, 2);
            } catch (e) {
              return String(arg);
            }
          }
          return String(arg);
        })
        .join(" ");

      const source = entry && entry.source ? `\n@ ${entry.source}` : "";
      return `[${hours}:${minutes}:${seconds}.${millis}][${level}] ${formattedArgs}${source}`;
    },

    getConsoleEntryStyle(entry) {
      const colors = {
        log: "color: #000000",
        info: "color: #0066cc",
        warn: "color: #ff8800",
        error: "color: #cc0000",
        debug: "color: #666666",
      };
      return colors[entry.level] || colors.log;
    },

    scrollToBottom(type) {
      const container =
        type === "console"
          ? this.$refs.consoleLogContainer
          : this.$refs.messageLogContainer;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    },

    async onCopy() {
      const selection = window.getSelection();
      const text = selection ? selection.toString() : "";

      if (!text || !this.hasSelection) {
        return;
      }

      try {
        if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          const textarea = document.createElement("textarea");
          textarea.value = text;
          textarea.style.position = "fixed";
          textarea.style.top = "-1000px";
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          document.execCommand("copy");
          document.body.removeChild(textarea);
        }
      } catch (err) {
        console.warn("[TextLogPanel] Failed to copy log", err);
      }
    },

    onClearMessages() {
      MESSAGE_LOG.clear();
    },

    onClearConsole() {
      CONSOLE_LOG.clear();
    },

    onSelectionChange() {
      try {
        const sel = window.getSelection();
        const text = sel ? sel.toString() : "";
        if (!text) {
          this.hasSelection = false;
          return;
        }

        const messageContainer = this.$refs.messageLogContainer;
        const consoleContainer = this.$refs.consoleLogContainer;
        if (!messageContainer && !consoleContainer) {
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
        const withinConsole =
          consoleContainer &&
          anchorNode &&
          consoleContainer.contains(anchorNode) &&
          focusNode &&
          consoleContainer.contains(focusNode);

        this.hasSelection =
          (withinMessage || withinConsole) && text.trim().length > 0;
      } catch (err) {
        this.hasSelection = false;
      }
    },

    onConsoleLogLimitKeydown(event) {
      const char = event.key;
      const isNumber = /[0-9]/.test(char);
      const isControl = [
        "Backspace",
        "Delete",
        "ArrowLeft",
        "ArrowRight",
        "Home",
        "End",
        "Tab",
      ].includes(char);
      const isCopy = (event.ctrlKey || event.metaKey) && char === "c";
      const isPaste = (event.ctrlKey || event.metaKey) && char === "v";

      // Allow numbers, control keys, copy/paste, and Ctrl+A
      if (
        !isNumber &&
        !isControl &&
        !isCopy &&
        !isPaste &&
        !(event.ctrlKey && char === "a")
      ) {
        event.preventDefault();
      }
    },

    onConsoleLogLimitChange() {
      let value = parseInt(this.consoleLogLimit, 10);

      // Validate: must be 1-1000
      if (isNaN(value) || value < 1) {
        value = 1;
      } else if (value > 1000) {
        value = 1000;
      }

      this.consoleLogLimit = value;

      // Update CONSOLE_LOG maxLogs
      if (CONSOLE_LOG) {
        CONSOLE_LOG.maxLogs = value;
      }
    },
  },
};
