import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/** MPP_SmoothBattleLog (MV). Script-authored log captions use the standard message cache. */
export class MppSmoothBattleLogTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'MPP_SmoothBattleLog';
    }
    getPluginAliases() {
        return ['MPP_SmoothBattleLog', 'BattleLogOutput'];
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
            const command = list[index];
            if (
                command.code === 357 &&
                command.parameters?.[0]?.split('/').pop() === 'BattleLogOutput' &&
                command.parameters[1] === 'OUTPUT_LOG'
            ) {
                const text = command.parameters[3]?.message;
                if (this.isUsableText(text)) this.entries.set(text, { text });
            }
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
            if (translator.commandDepth) return original.call(this, text, ...args);
            return original.call(
                this,
                translator.resolveRuntimeMessageTranslation(text, translator.getRuntime(), {
                    hasPortrait: false,
                }),
                ...args
            );
        };
        const manager = window.PluginManager;
        if (typeof manager?.callCommand === 'function') {
            const callCommand = manager.callCommand;
            manager.callCommand = function (interpreter, plugin, command, args) {
                if (
                    plugin?.split('/').pop() !== 'BattleLogOutput' ||
                    command !== 'OUTPUT_LOG' ||
                    typeof args?.message !== 'string'
                )
                    return callCommand.apply(this, arguments);
                const message = translator.resolveRuntimeMessageTranslation(
                    args.message,
                    translator.getRuntime(),
                    { hasPortrait: false }
                );
                translator.commandDepth = (translator.commandDepth || 0) + 1;
                try {
                    return callCommand.call(this, interpreter, plugin, command, {
                        ...args,
                        message,
                    });
                } finally {
                    translator.commandDepth--;
                }
            };
        }
        return true;
    }
}
