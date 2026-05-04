export function cloneObject(obj) {
    const clone = {};
    for (const key in obj) {
        if (typeof obj[key] == 'object' && obj[key] !== null) {
            clone[key] = cloneObject(obj[key]);
        } else {
            clone[key] = obj[key];
        }
    }

    return clone;
}

export function isNwjsEnvironment() {
    const utils = typeof Utils !== 'undefined' ? Utils : null;
    if (utils && typeof utils.isNwjs === 'function') {
        try {
            return Boolean(utils.isNwjs());
        } catch (err) { /* empty */ }
    }

    return false;
}

export function isUtilsReady() {
    const utils = typeof Utils !== 'undefined' ? Utils : null;
    return Boolean(utils && typeof utils.isNwjs === 'function');
}
