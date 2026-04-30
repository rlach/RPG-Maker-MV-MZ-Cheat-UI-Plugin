import { ExternBaseTranslator } from '../ExternBaseTranslator.js';

/**
 * Translator for the ExternMessage plugin by Baizan.
 *
 * ExternMessage loads dialog text from an external CSV file (path + encoding
 * configured in plugin parameters) and expands \M[KEY] tokens inside Show Text
 * (code 401) commands at runtime.
 *
 * Because the expanded text ultimately reaches $gameMessage through standard
 * 401 commands, the existing on-the-fly text runtime already applies
 * cached translations automatically.  This translator's sole job is to
 * pre-populate the 'message' cache with translations of every text value that
 * lives in the CSV, so there is nothing to do in enablePluginTranslation().
 *
 * Data source: window.$externMessage._map, which is populated by the plugin
 * itself during DataManager.createGameObjects() (before the title screen).
 *
 * Script blocks (:script…:end) are stripped; command tokens such as
 * :name[…], :face[…], :page, :event[…], :fadeout, :fadein, :bg[…],
 * :layout[…] are removed from each line, and the remaining text is grouped
 * into per-page segments that match what $gameMessage.allText() will return
 * when the game plays those lines back.
 */
export class ExternMessageTranslator extends ExternBaseTranslator {
    getPluginName() {
        return 'ExternMessage';
    }

    getPluginLabel() {
        return 'ExternMessage CSV';
    }

    /**
     * Use the standard 'message' cache type so translations are stored in
     * message.{lang-pair}.cache.json alongside regular map message translations,
     * and the existing runtime text-replacement logic applies them without any
     * additional hook.
     */
    getCacheType() {
        return 'message';
    }

    // No runtime hook is needed: after ExternMessage expands \M[KEY] tokens
    // the resulting 401 commands are intercepted by the standard text runtime.
    enablePluginTranslation() {
        // No runtime hook required. ExternMessage ultimately feeds standard
        // Show Text commands, so the base text translation runtime applies cache.
    }

    buildScanEntries() {
        const externMsg = window.$externMessage;

        if (!externMsg?._map) {
            console.warn(
                '[ExternMessageTranslator] $externMessage._map not available; skipping scan'
            );
            return null;
        }

        const lineMax = Number(externMsg.LineMax) || 4;
        const seenTexts = new Set();
        const entries = [];

        for (const messageId of Object.keys(externMsg._map)) {
            this._collectEntriesFromColumns(
                externMsg._map[messageId],
                messageId,
                lineMax,
                seenTexts,
                entries
            );
        }

        return entries;
    }

    _collectEntriesFromColumns(columns, messageId, lineMax, seenTexts, entries) {
        if (!Array.isArray(columns)) {
            return;
        }

        for (let colIdx = 0; colIdx < columns.length; colIdx++) {
            const rawValue = typeof columns[colIdx] === 'string' ? columns[colIdx] : '';
            if (!rawValue?.trim()) {
                continue;
            }

            for (const text of this.extractPageTexts(rawValue, lineMax)) {
                if (!text?.trim() || seenTexts.has(text)) {
                    continue;
                }
                seenTexts.add(text);
                entries.push({ text, source: { messageId, colIdx } });
            }
        }
    }

    /**
     * Simulate ExternMessage's convertMessageCommandCore page-splitting logic
     * to produce the set of text strings that will appear in $gameMessage.allText()
     * for each message page derived from a single CSV cell value.
     *
     * Rules mirrored from ExternMessage source:
     *  - :script[…]…:end   → entire block removed
     *  - :name[…], :face[…], :event[…], :fadeout, :fadein, :bg[…], :layout[…]
     *                       → command token stripped; lineCount set to lineMax
     *                         BEFORE the residual text is added (pre-break)
     *  - :page              → command token stripped; lineCount set to lineMax
     *                         AFTER the current line's text is added (post-break)
     *  - line overflow      → new page started before the overflowing line
     *
     * @param {string} rawValue  Raw CSV cell content (may be multi-line).
     * @param {number} lineMax   Max lines before automatic page break.
     * @returns {string[]}       One element per page, each being the \n-joined
     *                           text lines for that page.
     */
    extractPageTexts(rawValue, lineMax) {
        const normalised = String(rawValue).replaceAll('\r\n', '\n').replaceAll('\r', '\n');
        const lines = normalised.split('\n');

        const pages = [];
        const state = { currentLines: [], lineCount: 0, pendingPageBreak: false };

        const flushPage = () => {
            if (state.currentLines.length > 0) {
                pages.push(state.currentLines.join('\n'));
            }
            state.currentLines = [];
            state.lineCount = 0;
            state.pendingPageBreak = false;
        };

        let i = 0;
        while (i < lines.length) {
            const line = lines[i];

            // ── Strip :script[…]…:end blocks ────────────────────────────────
            if (this._isScriptStart(line)) {
                i = this._skipScriptBlock(lines, i + 1);
                continue;
            }

            this._processLine(line, lineMax, state, flushPage);
            i++;
        }

        flushPage(); // flush any remaining text

        return pages.filter((text) => text?.trim());
    }

    _isScriptStart(line) {
        return /^:script(?:\[.*?\])?\s*$/.test(line.trim());
    }

    _skipScriptBlock(lines, startIdx) {
        let index = startIdx;
        while (index < lines.length && !/^:end\s*$/.test(lines[index].trim())) {
            index++;
        }
        return index + 1;
    }

    _lineHasPreBreakCommand(line) {
        return (
            line.includes(':name') ||
            line.includes(':face') ||
            line.includes(':event') ||
            line.includes(':fadeout') ||
            line.includes(':fadein') ||
            line.includes(':bg') ||
            line.includes(':layout')
        );
    }

    _processLine(line, lineMax, state, flushPage) {
        const processedLine = this._stripCommandTokens(line);
        const hasPreBreak = this._lineHasPreBreakCommand(line);
        const hasPageTag = line.includes(':page');

        if (hasPreBreak) {
            if (processedLine.length > 0) {
                flushPage();
            } else {
                state.pendingPageBreak = true;
                return;
            }
        }

        if (processedLine.length > 0) {
            if (state.pendingPageBreak || state.lineCount >= lineMax) {
                flushPage();
            }
            state.currentLines.push(processedLine);
            state.lineCount++;
        }

        if (hasPageTag) {
            flushPage();
        }
    }

    /**
     * Remove ExternMessage command tokens from a line, leaving only the
     * display text (same stripping that parseCmd performs at runtime).
     *
     * Commands handled:
     *   :name[…]  :face[…]  :event[…]  :bg[…]  :layout[…]
     *   :page     :fadeout  :fadein
     *
     * Note: \M[…], \V[…], \C[…] are left intact because they are resolved at
     * runtime and form part of the text that appears in the message window.
     */
    _stripCommandTokens(line) {
        let text = String(line);

        // Commands that always carry bracket arguments
        text = text.replaceAll(/:(?:name|face|event|bg|layout)\[[^\]]*\]/g, '');

        // :page with optional bracket args
        text = text.replaceAll(/:page(?:\[[^\]]*\])?/g, '');

        // Bare commands without args
        text = text.replaceAll(/:fadeout\b/g, '');
        text = text.replaceAll(/:fadein\b/g, '');

        return text.trim();
    }
}
