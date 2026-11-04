import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import {
    parseJsonSafely,
    walkNestedJsonLike,
    createPositionalFormatCatalogEntry,
} from './TranslatorHelpers.js';

/** Inn15DayCore family, unversioned MZ build (RJ01676161).
 * Source catalogs cover HUD/calendar/replays/reports and diary JSON prose.
 * Preserve route IDs, schedule conditions, asset paths and saved notebook data.
 */
export class Inn15DayUiTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'Inn15DayCore';
    }
    getPluginLabel() {
        return 'Inn calendar, diary and daily reports';
    }
    getCacheType() {
        return 'plugin_inn_15_day_ui';
    }
    getSourcePluginNames() {
        return window.$plugins
            .filter((plugin) => plugin.status && /^Inn/.test(plugin.name))
            .map((plugin) => plugin.name);
    }

    async collectAdditionalTexts() {
        for (const name of [
            'Inn15DayCore',
            'InnDailyLoop',
            'DiaryContent',
            'DiaryLayout',
            'ScenarioFlow',
            'ScenarioPresentation',
            'TraceConversations',
        ]) {
            const response = await fetch(`data/${name}.json`);
            if (!response.ok) throw new Error(`Cannot read ${name}: ${response.status}`);
            const data = parseJsonSafely(await response.text());
            if (!data) throw new Error(`Invalid ${name} data`);
            walkNestedJsonLike(data, (value, { path }) => {
                if (typeof value !== 'string' || !/[\u3040-\u30ff\u3400-\u9fff]/.test(value))
                    return;
                const field = path[path.length - 1];
                if (
                    /^(?:image|name|key|id|sceneId|picture|asset|folder)$/i.test(field) &&
                    /[/.]/.test(value)
                )
                    return;
                let index = 0;
                const format = value.replace(/\{[A-Za-z0-9_]+\}/g, () => `%${++index}`);
                const entry = createPositionalFormatCatalogEntry(format);
                this.entries.set(entry.text, entry);
            });
        }
    }

    enablePluginTranslation() {
        if (
            this.findPluginEntry('InnDiaryScene')?.status &&
            typeof window.Scene_InnDiary?.prototype.createTextElement !== 'function'
        )
            return false;
        if (!super.enablePluginTranslation()) return false;
        const prototype = window.Scene_InnDiary?.prototype;
        if (typeof prototype?.createTextElement === 'function') {
            const create = prototype.createTextElement;
            const translator = this;
            const hooked = new WeakSet();
            prototype.createTextElement = function (...args) {
                const result = create.apply(this, args);
                const win = this._dynamicWindows[this._dynamicWindows.length - 1];
                const windowPrototype = Object.getPrototypeOf(win);
                if (!hooked.has(windowPrototype)) {
                    translator.hookDrawing(windowPrototype, 'wrapText');
                    hooked.add(windowPrototype);
                }
                win.refresh();
                return result;
            };
        }
        return true;
    }
}
