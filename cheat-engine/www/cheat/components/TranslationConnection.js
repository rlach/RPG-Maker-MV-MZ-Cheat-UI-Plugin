import { ensureTranslationRuntime } from '../js/translation-runtime/TranslationRuntime.js';
import { notifyRootWindowEvent, subscribeRootWindowEvent } from '../js/RootWindowState.js';

const CONNECTION_CHANGED = 'translation-connection-changed';

export default {
    name: 'TranslationConnection',
    props: { alwaysConfigure: Boolean },
    template: `
        <div class="mb-3">
            <div class="d-flex align-center flex-wrap ga-2" role="status">
                <v-progress-circular v-if="status === 'checking'" indeterminate size="16" width="2" />
                <v-icon v-else :color="status === 'connected' ? 'success' : 'error'">
                    {{ status === 'connected' ? 'mdi-check-circle' : 'mdi-close-circle' }}
                </v-icon>
                <span>{{ status === 'checking' ? 'Checking translation server…' :
                    status === 'connected' ? 'Translation server connected' : error }}</span>
                <v-btn v-if="alwaysConfigure || status === 'error'" size="small" variant="text"
                    color="primary" @click="open">Configure connection</v-btn>
            </div>
            <v-dialog :model-value="dialog" max-width="560" @update:model-value="onDialogChange">
                <v-card>
                    <v-card-title>Translation server connection</v-card-title>
                    <v-card-text>
                        <v-select :model-value="fields.aiProvider" :items="fields.aiProviderOptions"
                            label="Provider" variant="outlined" density="compact" item-title="text"
                            @update:model-value="update('onChangeAiProvider', $event)" />
                        <v-text-field :model-value="fields.aiHost" label="Server URL"
                            variant="outlined" density="compact" @keydown.stop
                            @update:model-value="update('onChangeAiHost', $event)" />
                        <v-text-field :model-value="fields.aiApiKey" label="API key" type="password"
                            variant="outlined" density="compact" @keydown.stop
                            @update:model-value="update('onChangeAiApiKey', $event)" />
                        <v-btn size="small" variant="outlined" color="primary" class="mb-3"
                            prepend-icon="mdi-refresh" :loading="fields.aiLoadingModels"
                            @click="update('fetchAiModels')">Fetch Models</v-btn>
                        <div v-if="formError || fields.aiModelsError" class="mb-2 text-error">
                            {{ formError || fields.aiModelsError }}
                        </div>
                        <v-select :model-value="fields.aiSelectedModel" :items="fields.aiModels"
                            :disabled="!fields.aiModels?.length" label="Select Model"
                            variant="outlined" density="compact" hide-details
                            @update:model-value="update('onChangeAiModel', $event)" />
                    </v-card-text>
                    <v-card-actions>
                        <v-spacer />
                        <v-btn @click="onDialogChange(false)">Done</v-btn>
                    </v-card-actions>
                </v-card>
            </v-dialog>
        </div>
    `,
    data() {
        return { status: 'checking', error: '', dialog: false, fields: {}, formError: '' };
    },
    created() {
        this._runtime = ensureTranslationRuntime();
        this._checkId = 0;
        this._unsubscribe = subscribeRootWindowEvent(CONNECTION_CHANGED, this.check);
    },
    mounted() {
        this.check();
    },
    activated() {
        if (this.status !== 'checking') this.check();
    },
    beforeUnmount() {
        this._checkId++;
        this._unsubscribe();
    },
    methods: {
        async check() {
            if (this.dialog) return;
            const id = ++this._checkId;
            this.status = 'checking';
            try {
                if (
                    this._runtime.translationEngine !== 'openApi' ||
                    !this._runtime.checkAiConnection
                ) {
                    throw new Error('Configure an AI translation server.');
                }
                await this._runtime.checkAiConnection();
                if (id === this._checkId) this.status = 'connected';
            } catch (error) {
                if (id !== this._checkId) return;
                this.error = 'Translation server: ' + (error.message || String(error));
                this.status = 'error';
            }
        },
        refreshFields() {
            const keys = [
                'aiProvider',
                'aiProviderOptions',
                'aiHost',
                'aiApiKey',
                'aiSelectedModel',
                'aiModels',
                'aiLoadingModels',
                'aiModelsError',
            ];
            const config = this._runtime.engine.getConfigData();
            this.fields = Object.fromEntries(keys.map((key) => [key, config[key]]));
        },
        open() {
            this.formError = '';
            if (this._runtime.translationEngine !== 'openApi') {
                this._runtime.translationEngine = 'openApi';
                this._runtime.onChangeTranslationEngine();
            }
            this.refreshFields();
            this.dialog = true;
        },
        async update(method, value) {
            this.formError = '';
            try {
                const result = this._runtime[method](value);
                this.refreshFields();
                await result;
            } catch (error) {
                this.formError = error.message || String(error);
            } finally {
                if (this.dialog) this.refreshFields();
                else notifyRootWindowEvent(CONNECTION_CHANGED);
            }
        },
        onDialogChange(open) {
            this.dialog = open;
            if (!open) {
                this.fields = {};
                notifyRootWindowEvent(CONNECTION_CHANGED);
            }
        },
    },
};
