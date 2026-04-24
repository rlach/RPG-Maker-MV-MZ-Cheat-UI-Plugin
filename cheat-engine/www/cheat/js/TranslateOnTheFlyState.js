import { KeyValueStorage } from "./KeyValueStorage.js";
import { ensureSettingsMigration } from './UnifiedSettings.js';

class TranslateOnTheFlyStateManager {
  constructor() {
    ensureSettingsMigration();
    this.storage = new KeyValueStorage(
      "./www/cheat-settings/translate-on-the-fly.json",
    );
    this.enabled = false;
    this.listeners = new Set();
    this.loadEnabled();
  }

  loadEnabled() {
    try {
      const raw = this.storage.getAll();
      if (!raw || typeof raw !== "object") {
        return this.enabled;
      }

      const data =
        typeof raw.data === "string"
          ? JSON.parse(raw.data)
          : raw && typeof raw.data === "object"
            ? raw.data
            : raw;
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
      const raw = this.storage.getAll();
      const data =
        raw && typeof raw === "object"
          ? { ...raw }
          : {};

      if (Object.prototype.hasOwnProperty.call(data, "data")) {
        delete data.data;
      }

      data.enabled = this.enabled;
      this.storage.setAll(data);
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
