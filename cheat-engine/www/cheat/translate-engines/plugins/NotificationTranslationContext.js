// A synchronous producer can own translation before Torigoya splits/renders it.
// This prevents collecting its formatted output as a new notification source.
let handledDepth = 0;
export function withTranslatedNotification(callback) {
    handledDepth++;
    try {
        return callback();
    } finally {
        handledDepth--;
    }
}
export function isNotificationTranslationHandled() {
    return handledDepth > 0;
}
const renderedByRuntime = new WeakMap();
export function rememberDisplayTranslation(runtime, text) {
    let values = renderedByRuntime.get(runtime);
    if (!values) renderedByRuntime.set(runtime, (values = new Set()));
    values.add(text);
    if (values.size > 4096) values.delete(values.values().next().value);
}
export function isKnownDisplayTranslation(runtime, text) {
    return renderedByRuntime.get(runtime)?.has(text) || false;
}
