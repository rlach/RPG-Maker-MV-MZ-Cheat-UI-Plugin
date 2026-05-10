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

export function getSystemMessageCacheKey(runtime, messageKey, messageValue) {
    if (!runtime) {
        return null;
    }

    if (isCommandCacheSystemMessageKey(messageKey)) {
        if (typeof messageValue !== 'string' || messageValue.trim() === '') {
            return null;
        }

        return runtime.getCacheKey(messageValue, 'command');
    }

    return runtime.getCacheKey(messageKey, 'system_message');
}
