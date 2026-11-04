import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/** TRP_CustomWindow 1.01 (MV), RJ312010 sugoroku HUD.
 * Read text-part formats from event commands and resolve complete rendered
 * formats before Bitmap.drawTextEx splits them. Never rewrite part/window IDs.
 */
export class TrpCustomWindowTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'TRP_CustomWindow';
    }
    getPluginLabel() {
        return 'TRP Custom Window';
    }
    getCacheType() {
        return 'plugin_trp_custom_window';
    }

    collectCommandTexts(list) {
        for (const command of list || []) {
            if (command?.code !== 356) continue;
            const args = String(command.parameters?.[0] || '').split(' ');
            if (!['ウィンドウ', 'window'].includes(args[0]?.toLowerCase())) continue;
            const operation = args[1]?.toLowerCase();
            if (!['パーツ作成', 'createparts', 'パーツ登録', 'registerparts'].includes(operation))
                continue;
            if (
                ['パーツ作成', 'createparts'].includes(operation) &&
                !['テキスト', 'text', '0'].includes(args[3])
            )
                continue;
            const text = args[6];
            if (!this.isUsableText(text) || !/[\u3040-\u30ff\u3400-\u9fff]/.test(text)) continue;
            this.collectFormat(text);
        }
    }

    collectFormat(text) {
        const conditional = /\\S\[\d+\](.*?):(.*?)(?:\\S|$)/i.exec(text);
        if (conditional) {
            for (const branch of [conditional[1], conditional[2]])
                this.collectFormat(text.replace(conditional[0], branch));
            return;
        }
        const parts = text.split(/\\V\[\d+\]/gi);
        const entry =
            parts.length > 1
                ? {
                      text: parts
                          .map(
                              (part, index) =>
                                  part + (index < parts.length - 1 ? `\\COT[${index}]` : '')
                          )
                          .join(''),
                      parts,
                  }
                : { text };
        this.entries.set(entry.text, entry);
    }

    enablePluginTranslation() {
        if (typeof window.Bitmap?.prototype.drawTextEx !== 'function') return false;
        if (!super.enablePluginTranslation()) return false;
        this.hookDrawing(window.Bitmap.prototype, 'drawTextEx');
        return true;
    }
}
