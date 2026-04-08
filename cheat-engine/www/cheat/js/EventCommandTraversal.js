const SHOW_TEXT_CODE = 101;
const SHOW_TEXT_LINE_CODE = 401;
const SHOW_CHOICES_CODE = 102;

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim() !== '';
}

function foobar() {
    return 'foobar';
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
        }
    }

    return entries;
}

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
