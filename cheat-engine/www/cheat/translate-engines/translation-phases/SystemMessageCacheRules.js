const COMMAND_CACHE_SYSTEM_MESSAGE_KEYS = new Set([
    'alwaysDash',
    'commandRemember',
    'touchUI',
    'bgmVolume',
    'bgsVolume',
    'meVolume',
    'seVolume',
]);

export function isCommandCacheSystemMessageKey(messageKey) {
    return COMMAND_CACHE_SYSTEM_MESSAGE_KEYS.has(messageKey);
}

export function getSystemMessagesSource() {
    if (
        !window.$dataSystem ||
        !$dataSystem.terms ||
        !$dataSystem.terms.messages ||
        typeof $dataSystem.terms.messages !== 'object'
    ) {
        return null;
    }

    if (
        !$dataSystem.terms.messagesOriginal ||
        typeof $dataSystem.terms.messagesOriginal !== 'object'
    ) {
        $dataSystem.terms.messagesOriginal = { ...$dataSystem.terms.messages };
    }

    return $dataSystem.terms.messagesOriginal;
}

export function getSystemMessageCacheKey(panel, messageKey, messageValue) {
    if (!panel || typeof panel.getCacheKey !== 'function') {
        return null;
    }

    if (isCommandCacheSystemMessageKey(messageKey)) {
        if (typeof messageValue !== 'string' || messageValue.trim() === '') {
            return null;
        }

        return panel.getCacheKey(messageValue, 'command');
    }

    return panel.getCacheKey(messageKey, 'system_message');
}
