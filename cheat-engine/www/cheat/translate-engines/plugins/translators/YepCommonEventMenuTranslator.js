import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/** YEP_CommonEventMenu v1.04 (MV). Comment-authored menu/help/subtext captions.
 * Catalog display blocks only; conditions, pictures and common-event objects stay intact.
 */
export class YepCommonEventMenuTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'YEP_CommonEventMenu';
    }
    getCacheType() {
        return 'plugin_yep_common_event_menu';
    }
    getSourcePluginNames() {
        return [];
    }
    shouldScanEventData() {
        return false;
    }
    isDisplayFragment() {
        return false;
    }
    async collectAdditionalTexts() {
        const response = await fetch('data/CommonEvents.json');
        if (!response.ok) throw new Error(`Cannot read CommonEvents: ${response.status}`);
        const events = parseJsonSafely(await response.text(), []);
        for (const event of events) this.collectCommandTexts(event?.list);
        const parameters = this.findPluginEntry(this.getPluginName())?.parameters || {};
        for (const field of ['Default Help', 'Default Subtext']) {
            const text = parameters[field];
            if (this.isUsableText(text)) this.entries.set(text, { text });
        }
    }
    collectCommandTexts(list = []) {
        let block = null;
        let lines = [];
        for (const command of list || []) {
            if (![108, 408].includes(command.code)) continue;
            const line = String(command.parameters[0]);
            const name = /<MENU NAME: (.*)>/i.exec(line);
            if (name) this.entries.set(name[1], { text: name[1] });
            const opening = /<(HELP DESCRIPTION|SUBTEXT)>/i.exec(line);
            if (opening) {
                block = opening[1].toUpperCase();
                lines = [];
                continue;
            }
            if (block && new RegExp(`</${block}>`, 'i').test(line)) {
                const text = lines.join('\n') + '\n';
                if (this.isUsableText(text)) this.entries.set(text, { text });
                block = null;
            } else if (block) lines.push(line);
        }
    }
    enablePluginTranslation() {
        const prototype = window.Window_CommonEventMenu?.prototype;
        if (
            typeof prototype?.setHelpWindowItem !== 'function' ||
            typeof prototype?.setSubtextWindowItem !== 'function' ||
            typeof prototype?.drawTextEx !== 'function'
        )
            return false;
        const translator = this;
        this.hookDrawing(prototype, 'drawTextEx');
        for (const method of ['setHelpWindowItem', 'setSubtextWindowItem']) {
            const original = prototype[method];
            prototype[method] = function (item, ...args) {
                if (item) {
                    const runtime = translator.getRuntime();
                    item = {
                        ...item,
                        description: translator.resolveText(item.description, runtime),
                        menuSettings: {
                            ...item.menuSettings,
                            subtext: translator.resolveText(item.menuSettings.subtext, runtime),
                        },
                    };
                }
                return original.call(this, item, ...args);
            };
        }
        this.precomputeCounts().catch((error) =>
            console.error('[YepCommonEventMenuTranslator] Catalog scan failed', error)
        );
        return true;
    }
}
