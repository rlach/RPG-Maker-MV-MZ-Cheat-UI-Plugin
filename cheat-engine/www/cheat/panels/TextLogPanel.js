import {MESSAGE_LOG} from '../js/MessageLogStore.js'

export default {
    name: 'TextLogPanel',

    template: `
<v-card flat class="ma-0 pa-0">
    <v-card-subtitle class="pb-0 font-weight-bold">Text Log</v-card-subtitle>
    <v-card-text class="py-0 caption">
        Latest messages are at the bottom. Text is selectable and can be copied.
    </v-card-text>
    <v-card-actions class="py-1 px-2">
        <v-spacer></v-spacer>
        <v-btn
            small
            text
            color="primary"
            :disabled="!hasSelection"
            @click="onCopy">
            Copy
        </v-btn>
        <v-btn
            small
            text
            color="red"
            @click="onClear">
            Clear Log
        </v-btn>
    </v-card-actions>
    <v-card-text class="py-0">
        <div
            ref="logContainer"
            style="max-height: 260px; overflow-y: auto; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 4px; padding: 8px; user-select: text;">
            <pre
                v-for="entry in entries"
                :key="entry.id"
                style="white-space: pre-wrap; margin: 0 0 6px 0; font-family: 'Fira Code', 'Consolas', monospace; font-size: 12px;">
{{ formatEntry(entry) }}
            </pre>
        </div>
    </v-card-text>
</v-card>
    `,

    data () {
        return {
            entries: [],
            unsubscribe: null,
            hasSelection: false
        }
    },

    created () {
        this.unsubscribe = MESSAGE_LOG.subscribe(entries => {
            this.entries = entries
            this.$nextTick(() => this.scrollToBottom())
        })

        document.addEventListener('selectionchange', this.onSelectionChange)
    },

    beforeDestroy () {
        if (this.unsubscribe) {
            this.unsubscribe()
            this.unsubscribe = null
        }

        document.removeEventListener('selectionchange', this.onSelectionChange)
    },

    methods: {
        formatEntry (entry) {
            const date = new Date(entry.timestamp)
            const hours = String(date.getHours()).padStart(2, '0')
            const minutes = String(date.getMinutes()).padStart(2, '0')
            const seconds = String(date.getSeconds()).padStart(2, '0')
            const label = entry.translated ? 'TL' : 'ORIG'
            return `[${hours}:${minutes}:${seconds}][${label}] ${entry.text}`
        },

        scrollToBottom () {
            const container = this.$refs.logContainer
            if (container) {
                container.scrollTop = container.scrollHeight
            }
        },

        async onCopy () {
            const selection = window.getSelection()
            const text = selection ? selection.toString() : ''

            if (!text || !this.hasSelection) {
                return
            }

            try {
                if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(text)
                } else {
                    const textarea = document.createElement('textarea')
                    textarea.value = text
                    textarea.style.position = 'fixed'
                    textarea.style.top = '-1000px'
                    document.body.appendChild(textarea)
                    textarea.focus()
                    textarea.select()
                    document.execCommand('copy')
                    document.body.removeChild(textarea)
                }
            } catch (err) {
                console.warn('[TextLogPanel] Failed to copy log', err)
            }
        },

        onClear () {
            MESSAGE_LOG.clear()
        },

        onSelectionChange () {
            try {
                const sel = window.getSelection()
                const text = sel ? sel.toString() : ''
                if (!text) {
                    this.hasSelection = false
                    return
                }

                const container = this.$refs.logContainer
                if (!container) {
                    this.hasSelection = false
                    return
                }

                const anchorNode = sel.anchorNode
                const focusNode = sel.focusNode
                const withinContainer = anchorNode && container.contains(anchorNode) && focusNode && container.contains(focusNode)
                this.hasSelection = withinContainer && text.trim().length > 0
            } catch (err) {
                this.hasSelection = false
            }
        }
    }
}
