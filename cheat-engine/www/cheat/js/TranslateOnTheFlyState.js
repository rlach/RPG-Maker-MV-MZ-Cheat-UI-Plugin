import { KeyValueStorage } from "./KeyValueStorage.js";

class TranslateOnTheFlyStateManager {
  constructor() {
    this.storage = new KeyValueStorage(
      "./www/cheat-settings/translate-on-the-fly.json",
    );
    this.enabled = false;
    this.listeners = new Set();
    this.loadEnabled();
  }

  loadEnabled() {
    try {
      const json = this.storage.getItem("data");
      if (!json) {
        return this.enabled;
      }

      const data = JSON.parse(json);
      if (Object.prototype.hasOwnProperty.call(data, "enabled")) {
        this.enabled = !!data.enabled;
      }
    } catch (err) {
      console.warn("[TranslateOnTheFlyState] Failed to load enabled flag", err);
    }

    return this.enabled;
  }

  persistEnabled() {
    try {
      const defaults = {
        enabled: this.enabled,
      };
      let data = {};
      const json = this.storage.getItem("data");
      if (json) {
        data = JSON.parse(json);
      }

      data = Object.assign({}, defaults, data, { enabled: this.enabled });
      this.storage.setItem("data", JSON.stringify(data));
    } catch (err) {
      console.warn(
        "[TranslateOnTheFlyState] Failed to persist enabled flag",
        err,
      );
    }
  }

  setEnabled(enabled, options = {}) {
    const next = !!enabled;
    const notify = options.notify !== false;
    const persist = options.persist !== false;

    if (this.enabled === next && persist) {
      return this.enabled;
    }

    this.enabled = next;

    if (persist) {
      this.persistEnabled();
    }

    if (notify) {
      this.notify();
    }

    return this.enabled;
  }

  toggleEnabled(options = {}) {
    return this.setEnabled(!this.enabled, options);
  }

  isEnabled() {
    return !!this.enabled;
  }

  subscribe(callback) {
    if (typeof callback !== "function") {
      return () => {};
    }

    this.listeners.add(callback);
    callback(this.enabled);

    return () => {
      this.listeners.delete(callback);
    };
  }

  notify() {
    for (const cb of this.listeners) {
      try {
        cb(this.enabled);
      } catch (err) {
        console.warn("[TranslateOnTheFlyState] Listener error", err);
      }
    }
  }
}

export const TranslateOnTheFlyState = new TranslateOnTheFlyStateManager();
