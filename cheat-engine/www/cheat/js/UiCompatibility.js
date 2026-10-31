(function installUiCompatibility() {
    'use strict';
    // Patch only the current UI document's constructors. Never use the opener's
    // constructors: the game's libraries must retain their original behavior.
    function at(index) {
        if (this == null) throw new TypeError('at called on null or undefined');
        const value = Object(this);
        const length = Math.min(Math.max(Math.floor(+value.length || 0), 0), 9007199254740991);
        const relative = Math.trunc(+index || 0);
        const position = relative < 0 ? length + relative : relative;
        return position < 0 || position >= length ? undefined : value[position];
    }

    for (const prototype of [window.Array.prototype, window.String.prototype]) {
        if (!prototype.at) {
            Object.defineProperty(prototype, 'at', {
                configurable: true,
                writable: true,
                value: at,
            });
        }
    }
    // Vuetify's table grouping uses ES2023 toReversed even on Chromium 98.
    if (!window.Array.prototype.toReversed) {
        Object.defineProperty(window.Array.prototype, 'toReversed', {
            configurable: true,
            writable: true,
            value: function () {
                if (this == null) throw new TypeError('toReversed called on null or undefined');
                return window.Array.from(this).reverse();
            },
        });
    }
})();
