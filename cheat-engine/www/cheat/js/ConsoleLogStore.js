// Store for console logs
class ConsoleLogStore {
  constructor() {
    this.logs = [];
    this.maxLogs = 100;
    this.listeners = [];
    this.captureStarted = false;
    this.errorCaptureInstalled = false;
  }

  startCapture() {
    if (this.captureStarted) return;
    this.captureStarted = true;

    this.installNwConsoleCapture();
    this.installGlobalErrorCapture();
  }

  installNwConsoleCapture() {
    if (typeof nw === "undefined" || !nw.Window || typeof nw.Window.get !== "function") {
      return;
    }

    try {
      const win = nw.Window.get();
      if (!win || typeof win.on !== "function") {
        return;
      }

      win.on("console-message", (...args) => {
        const payload = this.normalizeConsoleMessageArgs(args);
        if (!payload) {
          return;
        }

        const { level, message, source } = payload;
        this.add(level, [message], source);
      });
    } catch (err) {
      // Ignore runtime-specific failures.
    }
  }

  installGlobalErrorCapture() {
    if (this.errorCaptureInstalled) {
      return;
    }
    this.errorCaptureInstalled = true;

    window.addEventListener("error", (event) => {
      if (!event) {
        return;
      }

      const source = [event.filename, event.lineno, event.colno]
        .filter((part) => part !== undefined && part !== null && part !== "")
        .join(":");

      const message = event.error && event.error.stack
        ? event.error.stack
        : event.message || "Unhandled error";

      this.add("error", [message], source);
    });

    window.addEventListener("unhandledrejection", (event) => {
      const reason = event && event.reason;
      const message =
        reason && reason.stack
          ? reason.stack
          : typeof reason === "string"
            ? reason
            : JSON.stringify(reason);

      this.add("error", [message || "Unhandled promise rejection"], "");
    });
  }

  normalizeConsoleMessageArgs(args) {
    const list = Array.isArray(args) ? args : [];
    if (!list.length) {
      return null;
    }

    if (list.length === 1 && list[0] && typeof list[0] === "object") {
      const messageObj = list[0];
      const source = [messageObj.source, messageObj.line]
        .filter((part) => part !== undefined && part !== null && part !== "")
        .join(":");

      return {
        level: this.normalizeConsoleLevel(messageObj.level),
        message: this.coerceMessage(messageObj.message),
        source,
      };
    }

    const level = this.normalizeConsoleLevel(list[0]);
    const message = this.coerceMessage(list[1]);
    const source = [list[3], list[2]]
      .filter((part) => part !== undefined && part !== null && part !== "")
      .join(":");

    return { level, message, source };
  }

  normalizeConsoleLevel(level) {
    if (typeof level === "string") {
      const lower = level.toLowerCase();
      if (["log", "warn", "error", "info", "debug"].includes(lower)) {
        return lower;
      }
      return "log";
    }

    if (typeof level === "number") {
      if (level >= 3) {
        return "error";
      }
      if (level === 2) {
        return "warn";
      }
      if (level === 1) {
        return "log";
      }
      return "debug";
    }

    return "log";
  }

  coerceMessage(value) {
    if (typeof value === "string") {
      return value;
    }

    if (value instanceof Error) {
      return value.stack || value.message || String(value);
    }

    try {
      return JSON.stringify(value);
    } catch (err) {
      return String(value);
    }
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

// Always capture all console logs in panel.
CONSOLE_LOG.startCapture();
