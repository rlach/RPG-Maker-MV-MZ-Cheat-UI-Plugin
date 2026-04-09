import { ExternBaseTranslator } from '../ExternBaseTranslator.js';

export class MgpExternChoicesTranslator extends ExternBaseTranslator {
    getPluginName() {
        return 'Mgp_ExternChoices';
    }

    getPluginLabel() {
        return 'Mgp ExternChoices CSV';
    }

    getCacheType() {
        return 'choice';
    }

    enablePluginTranslation() {
        // No runtime hook required. The plugin copies CSV values into game
        // variables, and normal choice translation handles rendered choices.
    }

    getCsvFilePath() {
        const path = require('path');
        const params = PluginManager.parameters(this.getPluginName());
        const baseName =
            String(params?.CsvFileName || this.getPluginName())
                .trim()
                .replace(/\.csv$/i, '') || this.getPluginName();
        return path.resolve('data', `${baseName}.csv`);
    }

    buildScanEntries() {
        const fs = require('fs');
        const filePath = this.getCsvFilePath();

        if (!fs.existsSync(filePath)) {
            console.warn(`[MgpExternChoicesTranslator] CSV file not found: ${filePath}`);
            return null;
        }

        const text = fs.readFileSync(filePath, 'utf-8');
        return this.parseEntriesFromCsv(text);
    }

    parseEntriesFromCsv(text) {
        const normalized = String(text || '')
            .replace(/^\uFEFF/, '')
            .replaceAll('\r\n', '\n')
            .replaceAll('\r', '\n');
        const lines = normalized.split('\n');
        const entries = [];
        const seen = new Set();

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const parsed = this.parseCsvLine(lines[lineIndex]);
            if (!parsed?.text || seen.has(parsed.text)) {
                continue;
            }

            seen.add(parsed.text);
            entries.push({
                text: parsed.text,
                source: { lineIndex, variableId: parsed.variableId },
            });
        }

        return entries;
    }

    parseCsvLine(line) {
        const rawLine = String(line || '');
        if (!rawLine.trim()) {
            return null;
        }

        const parts = rawLine.split(',');
        if (parts.length < 2) {
            return null;
        }

        const variableId = Number(String(parts[0] || '').trim());
        const text = parts.slice(1).join(',').trim();
        if (!Number.isFinite(variableId) || variableId <= 0 || !text) {
            return null;
        }

        return { variableId, text };
    }
}
