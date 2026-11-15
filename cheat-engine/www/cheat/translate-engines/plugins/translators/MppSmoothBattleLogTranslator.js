import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/** MPP_SmoothBattleLog (MV). Script-authored log captions use the standard message cache. */
export class MppSmoothBattleLogTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'MPP_SmoothBattleLog';
    }
    getCacheType() {
        return 'message';
    }
    getSourcePluginNames() {
        return [];
    }
    collectMapTexts() {}
    collectCommandTexts(list = []) {
        for (let index = 0; index < list.length; index++) {
            if (list[index].code !== 355) continue;
            let script = list[index].parameters[0];
            while (list[index + 1]?.code === 655) script += '\n' + list[++index].parameters[0];
            if (!/BattleManager\._logWindow\.addText\(/.test(script)) continue;
            for (const entry of this.extractCatalog(script).entries)
                this.entries.set(entry.text, entry);
        }
    }
    enablePluginTranslation() {
        const prototype = window.Window_BattleLog?.prototype;
        if (typeof prototype?.addText !== 'function') return false;
        const original = prototype.addText;
        const translator = this;
        prototype.addText = function (text, ...args) {
            return original.call(
                this,
                translator.resolveRuntimeMessageTranslation(text, translator.getRuntime(), {
                    hasPortrait: false,
                }),
                ...args
            );
        };
        return true;
    }
}
