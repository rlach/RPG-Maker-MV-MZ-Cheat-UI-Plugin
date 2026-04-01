import ItemTableTab from './ItemTableTab.js'

export default {
    name: 'ArmorSettingPanel',

    components: {
        ItemTableTab
    },

    template: `
<v-card flat class="ma-0 pa-0 fill-height">
    <item-table-tab
        class="fill-height"
        :items="items"
        :headers="headers"
        :as-table-data="convertToTableData"
        :searchable-attrs="['name', 'desc']">
        
    </item-table-tab>
</v-card>
    `,

    data () {
        return {
            items: [],

            headers: [
                {
                    text: 'Name',
                    value: 'name'
                },
                {
                    text: 'Description',
                    value: 'desc'
                }
            ]
        }
    },

    created () {
        this.initializeVariables()
    },

    methods: {
        initializeVariables () {
            this.items = $dataArmors
        },

        convertToTableData (item) {
            return {
                name: item.name,
                desc: item.description
            }
        }
    }
}
