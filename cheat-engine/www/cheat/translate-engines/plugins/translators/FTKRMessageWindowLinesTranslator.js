import {
    extractMessageEntryAt,
    extractScrollTextEntryAt,
} from '../../../js/EventCommandTraversal.js';
import { BasePluginTranslator } from '../BasePluginTranslator.js';

const MV_PLUGIN_COMMAND_CODE = 356;

function parsePluginCommandLine(commandLine) {
    const text = String(commandLine || '').trim();
    if (!text) {
        return null;
    }

    const [rawCommand, ...args] = text.split(/\s+/);
    const command = String(rawCommand || '')
        .trim()
        .toUpperCase();
    if (!command) {
        return null;
    }

    return { command, args };
}

export class FtkrMessageWindowLinesTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'FTKR_MessageWindowLines';
    }

    getPluginLabel() {
        return 'FTKR MessageWindowLines';
    }

    _applyMwlStateFromPluginCommand(command, state) {
        if (Number(command?.code) !== MV_PLUGIN_COMMAND_CODE) {
            return;
        }

        const pluginCommandLine = Array.isArray(command?.parameters) ? command.parameters[0] : '';
        const parsed = parsePluginCommandLine(pluginCommandLine);
        if (!parsed) {
            return;
        }

        if (parsed.command === 'MWL_CHANGE_LINES' || parsed.command === 'MWL_行数変更') {
            const lineCount = Number(parsed.args[0]) || 0;
            state.messageLines = Math.max(0, lineCount);
            return;
        }

        if (parsed.command === 'MWL_RESET_LINES' || parsed.command === 'MWL_行数リセット') {
            state.messageLines = 0;
        }
    }

    _collectMergedMessageRun(list, startIndex) {
        const firstMessageEntry = extractMessageEntryAt(list, startIndex);
        const firstScrollEntry = firstMessageEntry
            ? null
            : extractScrollTextEntryAt(list, startIndex);
        if (!firstMessageEntry && !firstScrollEntry) {
            return null;
        }

        let cursor = startIndex;
        let hasPortrait = !!firstMessageEntry?.hasPortrait;
        const lines = [];

        while (cursor < list.length) {
            const messageEntry = extractMessageEntryAt(list, cursor);
            if (messageEntry) {
                if (lines.length === 0) {
                    hasPortrait = !!messageEntry.hasPortrait;
                }

                for (const line of messageEntry.lines || []) {
                    lines.push(String(line ?? ''));
                }
                cursor = messageEntry.nextIndex;
                continue;
            }

            const scrollEntry = extractScrollTextEntryAt(list, cursor);
            if (scrollEntry) {
                for (const line of scrollEntry.lines || []) {
                    lines.push(String(line ?? ''));
                }
                cursor = scrollEntry.nextIndex;
                continue;
            }

            break;
        }

        const text = lines.join('\n');
        if (!this.isUsableText(text)) {
            return {
                handled: true,
                nextIndex: Math.max(startIndex + 1, cursor),
                text: '',
                hasPortrait,
            };
        }

        return {
            handled: true,
            nextIndex: Math.max(startIndex + 1, cursor),
            text,
            hasPortrait,
        };
    }

    getEventCommandTraversalExtension() {
        return {
            createState() {
                return { messageLines: 0 };
            },
            collectEntriesAt: ({ list, index, command, state, pushEntry }) => {
                this._applyMwlStateFromPluginCommand(command, state);

                if (!state.messageLines) {
                    return null;
                }

                const merged = this._collectMergedMessageRun(list, index);
                if (!merged) {
                    return null;
                }

                if (this.isUsableText(merged.text)) {
                    pushEntry({
                        type: merged.hasPortrait ? 'message_portrait' : 'message',
                        value: merged.text,
                        cmdIndex: index,
                        nextIndex: merged.nextIndex,
                        command,
                    });
                }

                return {
                    handled: true,
                    nextIndex: merged.nextIndex,
                };
            },
        };
    }
}
