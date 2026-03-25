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

    this.installWrapperMethod("log");
    this.installWrapperMethod("warn");
    this.installWrapperMethod("error");
    this.installWrapperMethod("info");
    this.installWrapperMethod("debug");
  }

  installWrapperMethod(level) {
    const original = this.originalConsole[level];
    if (typeof original !== "function") {
      return;
    }

    const self = this;
    console[level] = function (...args) {
      const safeArgs = Array.isArray(args) ? args : [];
      const source = self.extractCallerSource(new Error().stack || "");
      self.add(level, safeArgs, source);
      return original.apply(console, safeArgs);
    };
  }

  extractCallerSource(stackText = "") {
    const stack = String(stackText || "").split("\n");
    for (const line of stack) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.includes("ConsoleLogStore.js")) {
        continue;
      }

      let match = trimmed.match(/\(?([^()]+:\d+:\d+)\)?$/);
      if (!match && trimmed.includes("@")) {
        match = trimmed.match(/@([^@]+:\d+:\d+)$/);
      }
      if (!match || !match[1]) {
        continue;
      }

      const raw = match[1].replace(/^file:\/\//, "");
      const marker = "/cheat-engine/www/cheat/";
      const markerIndex = raw.indexOf(marker);
      if (markerIndex >= 0) {
        return raw.slice(markerIndex + 1);
      }
      return raw;
    }

    return "";
  }

  add(level, args, source = "") {
    const entry = {
      id: Date.now() + "-" + Math.random(),
      timestamp: Date.now(),
      level,
      args: Array.from(args),
      source,
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
const __rootWindow =
  window.__CHEAT_EXTERNAL_WINDOW__ && window.opener && !window.opener.closed
    ? window.opener
    : window;

const __rootConsoleLog = __rootWindow.__CONSOLE_LOG__ || new ConsoleLogStore();

// Persist on root for reuse and mirror locally for convenience
__rootWindow.__CONSOLE_LOG__ = __rootConsoleLog;
if (__rootWindow !== window) {
  window.__CONSOLE_LOG__ = __rootConsoleLog;
}

export const CONSOLE_LOG = __rootConsoleLog;

// Auto-intercept to mirror console entries in the panel.
CONSOLE_LOG.intercept();
