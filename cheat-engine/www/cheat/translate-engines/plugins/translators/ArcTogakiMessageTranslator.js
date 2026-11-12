import { ExternBaseTranslator } from '../ExternBaseTranslator.js';

/**
 * ARC_TogakiMessage v1.6 (MV). External text files become standard 101/401
 * messages at runtime, so scanning uses the existing message cache and renderer.
 * Mirror its segment parser; picture, BGS and common-event directives stay literal.
 */
export class ArcTogakiMessageTranslator extends ExternBaseTranslator {
    getPluginName() {
        return 'ARC_TogakiMessage';
    }
    getPluginLabel() {
        return 'ARC Togaki external messages';
    }
    getCacheType() {
        return 'message';
    }

    parseMessages(source, parameters = {}) {
        const normal = parameters['Tag Normal'] || '【通常】';
        const stage = parameters['Tag Stage'] || '【ト書き】';
        const messages = [];
        let lines = null;
        for (let raw of source
            .replace(/^\uFEFF/, '')
            .replace(/\r/g, '')
            .split('\n')) {
            raw = raw.replace(/\/\/.*$/, '');
            const trimmed = raw.trim();
            if (!trimmed) continue;
            if (trimmed.startsWith(normal) || trimmed.startsWith(stage)) {
                lines = [];
                messages.push(lines);
            } else if (
                !/^\s*★\s*(?:ピクチャ表示\s*[:：]\s*.+|BGS\s*[:：]\s*.+|コモンイベント\s*[:：]\s*\d+\s*$)/i.test(
                    trimmed
                )
            ) {
                if (lines) lines.push(raw);
            }
        }
        return messages.map((message) => message.join('\n')).filter((text) => text.trim());
    }

    async buildScanEntries() {
        const fs = require('fs');
        const path = require('path');
        const parameters = this.findPluginEntry(this.getPluginName())?.parameters || {};
        const root = path.dirname(process.mainModule.filename);
        const directory = path.resolve(root, parameters['Text Directory'] || 'data/messages');
        const extension = parameters['File Extension'] || '.txt';
        const entries = [];
        for (const file of await fs.promises.readdir(directory, { withFileTypes: true })) {
            if (!file.isFile() || !file.name.endsWith(extension)) continue;
            const source = await fs.promises.readFile(path.join(directory, file.name), 'utf8');
            for (const text of this.parseMessages(source, parameters)) {
                entries.push({ text, source: { file: file.name } });
            }
        }
        return entries;
    }
}
