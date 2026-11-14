let originalDepth = 0;

export function withOriginalTextResource(callback) {
    originalDepth++;
    try {
        return callback();
    } finally {
        originalDepth--;
    }
}

export function isOriginalTextResourceRequired() {
    return originalDepth > 0;
}
