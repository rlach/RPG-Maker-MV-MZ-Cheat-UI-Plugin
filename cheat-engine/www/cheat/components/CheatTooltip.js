/** Clicking a tooltip action must dismiss it, including actions that disable themselves. */
export default {
    name: 'CheatTooltip',
    inheritAttrs: false,
    data: () => ({ visible: false }),
    template: `<v-tooltip v-bind="$attrs" v-model="visible" :open-on-focus="false" :open-on-click="false">
        <template #activator="{ props }"><slot name="activator" :props="activationProps(props)" /></template>
        <slot />
    </v-tooltip>`,
    methods: {
        activationProps(props) {
            return {
                ...props,
                onClick: () => {
                    this.visible = false;
                },
            };
        },
    },
    deactivated() {
        this.visible = false;
    },
};
