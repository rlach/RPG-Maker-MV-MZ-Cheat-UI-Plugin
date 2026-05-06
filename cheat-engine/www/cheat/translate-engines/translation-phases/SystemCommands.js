import { BasePhase } from './BasePhase.js';

export class SystemCommands extends BasePhase {
    /** @type {SystemCommands | null} */
    static _instance = null;

    static getInstance() {
        if (!SystemCommands._instance) {
            SystemCommands._instance = new SystemCommands();
        }
        return SystemCommands._instance;
    }

    getTranslationPhaseLabel() {
        return 'translating system commands';
    }

    getKind() {
        return 'systemCommands';
    }

    async createEntries() {
        return [
            {
                strategy: this,
                priorityMapId: 0,
            },
        ];
    }

    normalizeCommandValue(value) {
        if (typeof value !== 'string') {
            return '';
        }

        return value.trim();
    }

    normalizeCommandList(values) {
        if (!Array.isArray(values)) {
            return [];
        }

        const normalized = [];
        for (const value of values) {
            const normalizedValue = this.normalizeCommandValue(value);
            if (!normalizedValue) {
                continue;
            }

            normalized.push(normalizedValue);
        }

        return normalized;
    }

    collectMenuCommandNames() {
        try {
            const collector = Object.create(Window_MenuCommand.prototype);
            collector._list = [];
            collector._handlers = {};

            collector.clearCommandList();
            collector.makeCommandList();

            const list = Array.isArray(collector._list) ? collector._list : [];
            const names = list.map((entry) => entry?.name);
            return this.normalizeCommandList(names);
        } catch (error) {
            console.warn(
                '[SystemCommands] collectMenuCommandNames failed (plugin override may require game state):',
                error?.message || error
            );
            return [];
        }
    }

    appendMenuCommands(mergedSource, menuCommandNames, currentCommands, originalCommands) {
        if (!originalCommands) {
            const sourceSet = new Set(mergedSource);
            for (const menuName of menuCommandNames) {
                if (sourceSet.has(menuName)) {
                    continue;
                }

                mergedSource.push(menuName);
                sourceSet.add(menuName);
            }
            return;
        }

        const translatedCommands = new Set(currentCommands);
        for (const menuName of menuCommandNames) {
            if (translatedCommands.has(menuName)) {
                continue;
            }

            mergedSource.push(menuName);
        }
    }

    getSourceCommands() {
        const terms = $dataSystem.terms;
        const currentCommands = this.normalizeCommandList(terms.commands);
        const originalCommands = Array.isArray(terms.commandsOriginal)
            ? this.normalizeCommandList(terms.commandsOriginal)
            : null;
        const defaultSource = originalCommands || currentCommands;

        const menuCommandNames = this.collectMenuCommandNames();
        if (!menuCommandNames.length) {
            return defaultSource;
        }

        const mergedSource = [...defaultSource];
        // Only when commandsOriginal exists, skip menu names already present in translated terms.commands.
        this.appendMenuCommands(mergedSource, menuCommandNames, currentCommands, originalCommands);
        return mergedSource;
    }

    countAmountSync({ panel }) {
        const source = this.getSourceCommands();
        if (!source.length) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        let total = 0;
        let left = 0;
        for (const val of source) {
            total += 1;
            const cacheKey = panel.getCacheKey(val, 'command');
            if (!panel.hasUsableCacheValue(cacheKey)) {
                left += 1;
            }
        }

        return { total, left, totalStrings: total, leftStrings: left };
    }

    collectUntranslated({ panel }) {
        const sourceCommands = this.getSourceCommands();
        if (!sourceCommands.length) {
            return [];
        }

        const pending = [];
        for (let i = 0; i < sourceCommands.length; i++) {
            const value = sourceCommands[i];
            const cacheKey = panel.getCacheKey(value, 'command');
            if (!panel.hasUsableCacheValue(cacheKey)) {
                pending.push({
                    type: 'system_command',
                    id: `cmd_${i}`,
                    value,
                    cacheKey,
                    index: i,
                });
            }
        }

        return pending;
    }

    setData({ panel, successes, failures, pendingItems }) {
        super.setData({ panel, successes, failures });
    }
}
