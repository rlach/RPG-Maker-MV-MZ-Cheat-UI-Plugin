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

        const self = this;

        // Intercept console.log
        console.log = function(...args) {
            self.originalConsole.log.apply(console, args);
            self.add('log', args);
        };

        // Intercept console.warn
        console.warn = function(...args) {
            self.originalConsole.warn.apply(console, args);
            self.add('warn', args);
        };

        // Intercept console.error
        console.error = function(...args) {
            self.originalConsole.error.apply(console, args);
            self.add('error', args);
        };

        // Intercept console.info
        console.info = function(...args) {
            self.originalConsole.info.apply(console, args);
            self.add('info', args);
        };

        // Intercept console.debug
        console.debug = function(...args) {
            self.originalConsole.debug.apply(console, args);
            self.add('debug', args);
        };
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

export const CONSOLE_LOG = new ConsoleLogStore();

// Auto-intercept on load
CONSOLE_LOG.intercept();
