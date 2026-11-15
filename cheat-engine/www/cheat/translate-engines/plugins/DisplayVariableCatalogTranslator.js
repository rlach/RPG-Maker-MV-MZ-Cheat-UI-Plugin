import { SourceTextCatalogTranslator } from './SourceTextCatalogTranslator.js';
import { extractJavaScriptTextCatalog } from './translators/JavaScriptTextCatalog.js';

export class DisplayVariableCatalogTranslator extends SourceTextCatalogTranslator {
    constructor() {
        super();
        this.displayVariables = new Set();
        this.assignments = [];
    }
    collectDisplayReferences(text) {
        for (const match of String(text || '').matchAll(/\\v\[(\d+)\]/gi))
            this.displayVariables.add(Number(match[1]));
    }
    collectCommandTexts(list = []) {
        for (const command of list || []) {
            const p = command.parameters;
            if (command.code === 122) this.assignments.push(p);
            if ([401, 108, 408].includes(command.code)) this.collectDisplayReferences(p[0]);
            if (command.code === 357 && ['TextPicture', 'DTextPicture'].includes(p[0]))
                this.collectDisplayReferences(p[3]?.text);
        }
    }
    async collectVariableTexts() {
        let changed = true;
        while (changed) {
            changed = false;
            for (const [start, end, , type, value] of this.assignments) {
                if (![...this.displayVariables].some((id) => id >= start && id <= end)) continue;
                const references =
                    type === 1
                        ? [Number(value)]
                        : type === 4
                          ? [...String(value).matchAll(/\$gameVariables\.value\((\d+)\)/g)].map(
                                (match) => Number(match[1])
                            )
                          : [];
                for (const id of references) {
                    if (!this.displayVariables.has(id)) {
                        this.displayVariables.add(id);
                        changed = true;
                    }
                }
            }
        }
        const databases = new Set();
        for (const [start, end, , type, value] of this.assignments) {
            if (type !== 4 || ![...this.displayVariables].some((id) => id >= start && id <= end))
                continue;
            for (const match of String(value).matchAll(/\$data(Armors|Items|Actors)\[/g))
                databases.add(match[1]);
        }
        for (const database of databases) {
            const response = await fetch(`data/${database}.json`);
            if (!response.ok) throw new Error(`Cannot read ${database}: ${response.status}`);
            for (const item of await response.json()) {
                for (const text of [item?.name, item?.description])
                    if (this.isUsableText(text)) this.entries.set(text, { text });
            }
        }
        for (const [start, end, , type, value] of this.assignments) {
            if (type !== 4 || ![...this.displayVariables].some((id) => id >= start && id <= end))
                continue;
            const catalog = extractJavaScriptTextCatalog(`const display = ${value}`);
            for (const entry of catalog.entries) {
                const parts = entry.parts ? null : entry.text.split(/\\v\[\d+\]/gi);
                if (parts?.length > 1) {
                    const text = parts
                        .map(
                            (part, index) =>
                                part + (index < parts.length - 1 ? `\\COT[${index}]` : '')
                        )
                        .join('');
                    this.entries.set(text, { text, parts });
                } else this.entries.set(entry.text, entry);
            }
        }
    }
}
