import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { extractJavaScriptTextCatalog } from './JavaScriptTextCatalog.js';
import { parse } from '../../../libs/acorn.js';

export class HbNotificationTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'HB_Notification';
    }
    getCacheType() {
        return 'message';
    }
    getSourcePluginNames() {
        return [];
    }
    collectMapTexts() {}
    collectCommandTexts(list = []) {
        for (let index = 0; index < (list || []).length; index++) {
            if (list[index].code !== 355) continue;
            let source = list[index].parameters[0];
            while (list[index + 1]?.code === 655) source += '\n' + list[++index].parameters[0];
            if (!source.includes('HB_Notifier')) continue;
            const ast = parse(source, { ecmaVersion: 'latest', allowReturnOutsideFunction: true });
            const visit = (node) => {
                if (!node || typeof node !== 'object') return;
                if (
                    node.type === 'CallExpression' &&
                    node.callee.object?.name === 'HB_Notifier' &&
                    node.callee.property?.name === 'add' &&
                    node.arguments[1]
                ) {
                    const arg = node.arguments[1];
                    for (const entry of extractJavaScriptTextCatalog(
                        `({text:${source.slice(arg.start, arg.end)}})`
                    ).entries)
                        this.entries.set(entry.text, entry);
                }
                for (const child of Object.values(node)) {
                    if (Array.isArray(child)) child.forEach(visit);
                    else if (child && typeof child === 'object') visit(child);
                }
            };
            visit(ast);
        }
    }
    enablePluginTranslation() {
        const prototype = window.Window_Base?.prototype;
        if (typeof prototype?.drawTextEx !== 'function') return false;
        const original = prototype.drawTextEx;
        const translator = this;
        prototype.drawTextEx = function (text, ...args) {
            if (this.constructor.name === 'Window_Notification' && typeof text === 'string') {
                const [, prefix, payload] = /^((?:\\(?:FS|C)\[\d+\])*)([\s\S]*)$/i.exec(text);
                text = prefix + translator.resolveText(payload, translator.getRuntime());
            }
            return original.call(this, text, ...args);
        };
        this.precomputeCounts().catch((error) =>
            console.error('[HB Notification] Catalog scan failed', error)
        );
        return true;
    }
}
