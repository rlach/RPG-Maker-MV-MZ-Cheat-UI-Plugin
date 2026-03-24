// Store for console logs
class ConsoleLogStore {
    constructor() {
        this.logs = [];
        this.maxLogs = 100;
        this.listeners = [];
        this.originalConsole = {};
        this.intercepted = false;
    }

    intercept() {
        if (this.intercepted) return;
        this.intercepted = true;

        // Save original console methods
        this.originalConsole.log = console.log;
        this.originalConsole.warn = console.warn;
        this.originalConsole.error = console.error;
        this.originalConsole.info = console.info;
        this.originalConsole.debug = console.debug;

        this.installProxyMethod('log');
        this.installProxyMethod('warn');
        this.installProxyMethod('error');
        this.installProxyMethod('info');
        this.installProxyMethod('debug');
    }

    installProxyMethod(level) {
        const original = this.originalConsole[level];
        if (typeof original !== 'function') {
            return;
        }

        const self = this;
        console[level] = new Proxy(original, {
            apply(target, thisArg, argArray) {
                const args = Array.isArray(argArray) ? argArray : [];
                self.add(level, args);
                return Reflect.apply(target, console, args);
            }
        });
    }

    add(level, args) {
        const entry = {
            id: Date.now() + '-' + Math.random(),
            timestamp: Date.now(),
            level,
            args: Array.from(args)
        };

        this.logs.push(entry);

        // Keep only last maxLogs entries
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(-this.maxLogs);
        }

        this.notify();
    }

    clear() {
        this.logs = [];
        this.notify();
    }

    subscribe(callback) {
        this.listeners.push(callback);
        // Immediately call with current logs
        callback([...this.logs]);

        // Return unsubscribe function
        return () => {
            const index = this.listeners.indexOf(callback);
            if (index > -1) {
                this.listeners.splice(index, 1);
            }
        };
    }

    notify() {
        for (const listener of this.listeners) {
            listener([...this.logs]);
        }
    }
}
// Prefer the parent (main) window's console log store so external windows mirror the same logs
const __rootWindow = (window.__CHEAT_EXTERNAL_WINDOW__ && window.opener && !window.opener.closed)
    ? window.opener
    : window

const __rootConsoleLog = __rootWindow.__CONSOLE_LOG__ || new ConsoleLogStore()

// Persist on root for reuse and mirror locally for convenience
__rootWindow.__CONSOLE_LOG__ = __rootConsoleLog
if (__rootWindow !== window) {
    window.__CONSOLE_LOG__ = __rootConsoleLog
}

export const CONSOLE_LOG = __rootConsoleLog;

// Auto-intercept only once (intercept guards internally)
CONSOLE_LOG.intercept();
