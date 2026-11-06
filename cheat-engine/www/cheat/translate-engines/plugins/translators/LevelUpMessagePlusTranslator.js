import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/** LevelUpMessagePlus (MZ, unversioned). Parameter-change messages use stable templates. */
export class LevelUpMessagePlusTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'LevelUpMessagePlus';
    }
    getCacheType() {
        return 'plugin_level_up_message_plus';
    }
    shouldScanEventData() {
        return false;
    }
    async collectAdditionalTexts() {
        const p = this.findPluginEntry(this.getPluginName()).parameters;
        for (const ending of [p.up_string || '上がった！', p.down_string || '下がってしまった！']) {
            const parts = ['', ' ' + (p.postposition_string || 'が') + ' ', ' ' + ending];
            if (p.show_comparison_value !== 'false') parts.push('');
            const text = parts
                .map((part, i) => part + (i < parts.length - 1 ? '\\COT[' + i + ']' : ''))
                .join('');
            this.entries.set(text, { text, parts });
        }
    }
}
