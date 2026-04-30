function toSafeString(text) {
    if (typeof text === 'string') {
        return text;
    }

    if (text === null || text === undefined) {
        return '';
    }

    return String(text);
}

export function getMessageSourceTextVariants(text) {
    const sourceText = toSafeString(text);
    const variants = [sourceText];
    const hasLeadingIdeographicSpace = sourceText.startsWith('\u3000');
    const textWithoutLeadingIdeographicSpace = hasLeadingIdeographicSpace
        ? sourceText.slice(1)
        : sourceText;
    const startsWithControlTag = /^\\[A-Za-z]/.test(
        hasLeadingIdeographicSpace ? textWithoutLeadingIdeographicSpace : sourceText
    );

    // Some runtimes prepend a single ideographic space before control-tag lines
    // during live message rendering. Include that shape as a fallback key variant
    // instead of trimming all leading whitespace, so authored indentation is kept.
    if (startsWithControlTag) {
        if (hasLeadingIdeographicSpace) {
            variants.push(textWithoutLeadingIdeographicSpace);
        } else {
            variants.push(`\u3000${sourceText}`);
        }
    }

    return Array.from(new Set(variants));
}

export function buildMessageCacheLookupKeys(getCacheKey, text, hasPortrait = false) {
    if (typeof getCacheKey !== 'function') {
        return [];
    }

    const messageTypes = hasPortrait
        ? ['message_portrait', 'message']
        : [
              'message',
              // Fallback across message variants when portrait state differs between
              // harvesting and runtime rendering contexts.
              'message_portrait',
          ];

    const messageTextVariants = getMessageSourceTextVariants(text);
    const keys = [];

    for (const candidateText of messageTextVariants) {
        for (const messageType of messageTypes) {
            keys.push(getCacheKey(candidateText, messageType));
        }
    }

    return Array.from(new Set(keys));
}
