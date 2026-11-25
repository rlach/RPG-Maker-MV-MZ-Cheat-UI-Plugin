/* eslint-disable no-control-regex -- RPG Maker uses ESC-prefixed control codes. */
/** Snapshot text after the game's own name/variable/plugin escape conversion. */
export function displayedMessageText(text, messageWindow, alreadyConverted = false) {
    let value = String(text ?? '');
    if (!value) return value;
    if (!alreadyConverted || /(?:\\|\x1b)(?:V|N|P)\[\d+\]/i.test(value)) {
        // Message-specific conversion can clear/reopen a plugin's name box.
        // Use the base escape converter for read-only log snapshots instead.
        const convert =
            globalThis.Window_Base?.prototype.convertEscapeCharacters ||
            messageWindow?.convertEscapeCharacters;
        if (typeof convert === 'function') value = convert.call(messageWindow, value);
    }
    // Keep readable icon references; formatting and timing codes are not prose.
    return value
        .replace(/\x1bI\[(\d+)\]/gi, '[Icon $1]')
        .replace(/\x1b[A-Za-z]+(?:\[[^\]]*\])?/g, '')
        .replace(/\x1b[{}.!|><^$]/g, '');
}

export function displayedSpeakerName(message, messageWindow) {
    for (const box of [
        messageWindow?._nameBoxWindow,
        messageWindow?._nameWindow,
        messageWindow?._nameBox,
    ]) {
        if (!box || box.active === false || box.visible === false) continue;
        const text = box._name ?? box._text ?? box.name;
        if (typeof text === 'string' && text.trim())
            return displayedMessageText(text, messageWindow).trim();
    }
    return displayedMessageText(message._speakerName || '', messageWindow).trim();
}

export function recordDisplayedMessage(message, messageWindow, choiceWindow, store, meta = {}) {
    const displayed = messageWindow?._textState?.text;
    if (typeof displayed === 'string' && displayed !== message.__cheatDisplayedLogSource) {
        message.__cheatDisplayedLogBody = displayedMessageText(displayed, messageWindow, true);
        message.__cheatDisplayedLogSource = displayed;
    }
    const body =
        message.__cheatDisplayedLogBody ?? displayedMessageText(message.allText(), messageWindow);
    const choices = choiceWindow
        ? (message.choices?.() || []).map((text, index) =>
              displayedMessageText(choiceWindow.commandName?.(index) ?? text, choiceWindow)
          )
        : null;
    const patch = {
        ...meta,
        text: body,
        speakerName: displayedSpeakerName(message, messageWindow) || null,
    };
    if (choices) patch.choices = choices;
    if (message.__cheatMessageLogId && store.updateEntry(message.__cheatMessageLogId, patch))
        return;
    if (!body.trim() && !choices?.length) return;
    message.__cheatMessageLogId = store.addEntry(body || choices.join('\n'), patch);
}
