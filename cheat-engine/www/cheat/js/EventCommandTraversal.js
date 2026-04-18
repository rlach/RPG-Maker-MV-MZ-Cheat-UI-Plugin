const SHOW_TEXT_CODE = 101;
const SHOW_TEXT_LINE_CODE = 401;
const SHOW_CHOICES_CODE = 102;
const CHANGE_NAME_CODE = 320;
const CONTROL_VARIABLES_CODE = 122;
const VARIABLE_OPERAND_CONSTANT = 0;
const VARIABLE_OPERAND_SCRIPT = 4;

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim() !== '';
}

function decodeSimpleJsStringLiteral(expression) {
    if (typeof expression !== 'string') {
        return null;
    }

    const trimmed = expression.trim();
    if (trimmed.length < 2) {
        return null;
    }

    const quote = trimmed[0];
    if ((quote !== "'" && quote !== '"') || trimmed[trimmed.length - 1] !== quote) {
        return null;
    }

    let decoded = '';
    for (let i = 1; i < trimmed.length - 1; i++) {
        const char = trimmed[i];
        if (char !== '\\') {
            decoded += char;
            continue;
        }

        i += 1;
        if (i >= trimmed.length - 1) {
            return null;
        }

        const escaped = trimmed[i];
        switch (escaped) {
            case 'n':
                decoded += '\n';
                break;
            case 'r':
                decoded += '\r';
                break;
            case 't':
                decoded += '\t';
                break;
            case 'b':
                decoded += '\b';
                break;
            case 'f':
                decoded += '\f';
                break;
            case 'v':
                decoded += '\v';
                break;
            case '0':
                decoded += '\0';
                break;
            case '\\':
                decoded += '\\';
                break;
            case "'":
                decoded += "'";
                break;
            case '"':
                decoded += '"';
                break;
            case 'x': {
                const hex = trimmed.slice(i + 1, i + 3);
                if (!/^[0-9a-fA-F]{2}$/.test(hex)) {
                    return null;
                }
                decoded += String.fromCharCode(parseInt(hex, 16));
                i += 2;
                break;
            }
            case 'u': {
                const unicode = trimmed.slice(i + 1, i + 5);
                if (!/^[0-9a-fA-F]{4}$/.test(unicode)) {
                    return null;
                }
                decoded += String.fromCharCode(parseInt(unicode, 16));
                i += 4;
                break;
            }
            case '\n':
                break;
            case '\r':
                if (trimmed[i + 1] === '\n') {
                    i += 1;
                }
                break;
            default:
                decoded += escaped;
                break;
        }
    }

    return decoded;
}

function resolveControlVariableStringValue(parameters) {
    const operandType = Number(parameters?.[3]);
    const operandValue = parameters?.[4];

    if (operandType === VARIABLE_OPERAND_CONSTANT) {
        return typeof operandValue === 'string' ? operandValue : null;
    }

    if (operandType === VARIABLE_OPERAND_SCRIPT) {
        try {
            return eval(operandValue);
        } catch {
            return decodeSimpleJsStringLiteral(operandValue);
        }
    }

    return null;
}

export function extractMessageEntryAt(list, messageCmdIndex) {
    if (!Array.isArray(list) || messageCmdIndex < 0 || messageCmdIndex >= list.length) {
        return null;
    }

    const cmd = list[messageCmdIndex];
    if (!cmd || cmd.code !== SHOW_TEXT_CODE) {
        return null;
    }

    const speaker = (cmd.parameters && cmd.parameters[4]) || '';
    const lines = [];
    let nextIndex = messageCmdIndex + 1;
    while (
        nextIndex < list.length &&
        list[nextIndex] &&
        list[nextIndex].code === SHOW_TEXT_LINE_CODE
    ) {
        lines.push(list[nextIndex].parameters && list[nextIndex].parameters[0]);
        nextIndex += 1;
    }

    return {
        cmdIndex: messageCmdIndex,
        nextIndex,
        command: cmd,
        speaker,
        lines,
        text: lines.join('\n'),
    };
}

export function collectEventCommandEntries(list) {
    if (!Array.isArray(list)) {
        return [];
    }

    const entries = [];

    for (let i = 0; i < list.length; i++) {
        const cmd = list[i];
        if (!cmd || typeof cmd.code !== 'number') {
            continue;
        }

        if (cmd.code === SHOW_TEXT_CODE) {
            const messageEntry = extractMessageEntryAt(list, i);
            if (!messageEntry) {
                continue;
            }

            if (isNonEmptyString(messageEntry.speaker)) {
                entries.push({
                    type: 'speaker',
                    value: messageEntry.speaker,
                    cmdIndex: i,
                    nextIndex: messageEntry.nextIndex,
                    command: cmd,
                });
            }

            if (isNonEmptyString(messageEntry.text)) {
                entries.push({
                    type: 'text',
                    value: messageEntry.text,
                    cmdIndex: i,
                    nextIndex: messageEntry.nextIndex,
                    command: cmd,
                });
            }

            continue;
        }

        if (cmd.code === SHOW_CHOICES_CODE) {
            const choices = cmd.parameters && cmd.parameters[0];
            if (!Array.isArray(choices)) {
                continue;
            }

            for (let choiceIndex = 0; choiceIndex < choices.length; choiceIndex++) {
                const choice = choices[choiceIndex];
                if (!isNonEmptyString(choice)) {
                    continue;
                }

                entries.push({
                    type: 'choice',
                    value: choice,
                    cmdIndex: i,
                    choiceIndex,
                    command: cmd,
                });
            }

            continue;
        }

        // Change Name (RPG Maker command 320): actorId, newName
        // Treat as speaker so cache keys are stored under actor_name namespace.
        if (cmd.code === CHANGE_NAME_CODE) {
            const changedName = cmd.parameters && cmd.parameters[1];
            if (!isNonEmptyString(changedName)) {
                continue;
            }

            entries.push({
                type: 'speaker',
                value: changedName,
                cmdIndex: i,
                command: cmd,
            });
        }
    }

    return entries;
}

export function collectVariableAssignmentEntries(list, { allowedVariableIds = null } = {}) {
    if (!Array.isArray(list)) {
        return [];
    }

    const allowedIds =
        allowedVariableIds instanceof Set
            ? allowedVariableIds
            : Array.isArray(allowedVariableIds)
              ? new Set(
                    allowedVariableIds
                        .map((id) => Number(id))
                        .filter((id) => Number.isInteger(id) && id > 0)
                )
              : null;
    const entries = [];

    for (let i = 0; i < list.length; i++) {
        const cmd = list[i];
        if (!cmd || cmd.code !== CONTROL_VARIABLES_CODE) {
            continue;
        }

        const parameters = Array.isArray(cmd.parameters) ? cmd.parameters : [];
        const startId = Number(parameters[0]) || 0;
        const endId = Number(parameters[1]) || startId;
        const minId = Math.max(0, Math.min(startId, endId));
        const maxId = Math.max(minId, startId, endId);
        const value = resolveControlVariableStringValue(parameters);
        const operandType = Number(parameters[3]);

        if (!isNonEmptyString(value) || maxId <= 0) {
            continue;
        }

        const matchedVariableIds = [];
        if (allowedIds) {
            for (const variableId of allowedIds) {
                if (variableId >= minId && variableId <= maxId) {
                    matchedVariableIds.push(variableId);
                }
            }
        } else {
            for (let variableId = minId; variableId <= maxId; variableId++) {
                matchedVariableIds.push(variableId);
            }
        }

        if (matchedVariableIds.length === 0) {
            continue;
        }

        entries.push({
            type: 'variable_value',
            value,
            operandType,
            rawOperandValue: parameters[4],
            variableIds: matchedVariableIds,
            variableIdStart: minId,
            variableIdEnd: maxId,
            cmdIndex: i,
            command: cmd,
        });
    }

    return entries;
}

/**
 * @param {Array} list
 * @param {{ isUntranslated?: (entry: any) => boolean }} [options]
 */
export function countEventCommandEntries(list, { isUntranslated } = {}) {
    const entries = collectEventCommandEntries(list);
    let totalStrings = 0;
    let leftStrings = 0;

    for (const entry of entries) {
        totalStrings += 1;
        if (typeof isUntranslated === 'function' && isUntranslated(entry) === true) {
            leftStrings += 1;
        }
    }

    return { totalStrings, leftStrings };
}

export function findNearestMessageEntry(list, startIndex = 0) {
    if (!Array.isArray(list) || list.length === 0) {
        return null;
    }

    const start = Math.max(0, Math.min(list.length - 1, Number(startIndex) || 0));

    for (let i = start; i >= 0; i--) {
        const found = extractMessageEntryAt(list, i);
        if (found && isNonEmptyString(found.text)) {
            return found;
        }
    }

    for (let i = start + 1; i < list.length; i++) {
        const found = extractMessageEntryAt(list, i);
        if (found && isNonEmptyString(found.text)) {
            return found;
        }
    }

    return null;
}
