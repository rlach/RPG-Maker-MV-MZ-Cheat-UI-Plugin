import { HACKS_RUNTIME } from '../js/HacksRuntime.js';

export default {
    name: 'HacksPanel',

    template: `
<v-card flat class="ma-0 pa-0">
    <v-card-subtitle class="pb-0 font-weight-bold">Hacks</v-card-subtitle>
    <v-card-text class="pt-1 pb-0">
        These compatibility hacks can help when specific games/plugins break after runtime updates.
        Keep them OFF by default and enable only when you hit the related issue.
    </v-card-text>

    <v-card-subtitle class="mt-3 pb-0 font-weight-bold">Bitmap / Canvas Fixes</v-card-subtitle>
    <v-card-text class="py-0">
        <v-switch
            v-model="bitmapGetPixelLongFix"
            label="Fix Bitmap.getPixel getImageData long-type crash"
            dense
            hide-details
            @click.self.stop
            @change="onBitmapGetPixelLongFixChange">
        </v-switch>
    </v-card-text>
    <v-card-text class="pt-2 pb-0 caption grey--text text--lighten-1">
        Fixes: TypeError: Failed to execute 'getImageData' on 'CanvasRenderingContext2D': Value is not of type 'long'.
        Seen in some plugins after NW.js updates (for example PicturePointColor.js call chains).
    </v-card-text>
    <v-card-text class="pt-1 pb-0 caption amber--text text--darken-1">
        Some games may require a restart before this change affects all plugin code paths.
    </v-card-text>
</v-card>
    `,

    data() {
        return {
            bitmapGetPixelLongFix: false,
        };
    },

    created() {
        this.initializeVariables();
    },

    methods: {
        initializeVariables() {
            this.bitmapGetPixelLongFix = HACKS_RUNTIME.isBitmapGetPixelLongFixEnabled();
        },

        onBitmapGetPixelLongFixChange(enabled) {
            HACKS_RUNTIME.setBitmapGetPixelLongFixEnabled(!!enabled);
        },
    },
};
