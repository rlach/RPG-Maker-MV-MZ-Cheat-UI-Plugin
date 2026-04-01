import { BasePhase } from "../translation-phases/BasePhase.js";

export class BasePluginTranslator extends BasePhase {
  constructor() {
    super();
    this._pluginDetected = false;
    this._detectionChecked = false;
  }

  getPluginName() {
    throw new Error("getPluginName() must be implemented by plugin translator");
  }

  getPluginLabel() {
    return this.getPluginName();
  }

  getKind() {
    const normalized = String(this.getPluginName() || "plugin")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    return `plugin:${normalized || "unknown"}`;
  }

  getTranslationPhaseLabel() {
    return `translating plugin ${this.getPluginLabel()}`;
  }

  detectPlugin() {
    const pluginName = String(this.getPluginName() || "").trim().toLowerCase();
    if (!pluginName || !Array.isArray(window.$plugins)) {
      return false;
    }

    return window.$plugins.some((plugin) => {
      if (!plugin || typeof plugin.name !== "string") {
        return false;
      }

      return plugin.name.trim().toLowerCase() === pluginName;
    });
  }

  enablePluginTranslation() {
    // Optional hook point for plugin-specific runtime integration.
  }

  prepareTranslator() {
    // Optional hook point for plugin-specific one-time async preparation.
    return Promise.resolve();
  }

  ensureDetection() {
    if (this._detectionChecked) {
      return this._pluginDetected;
    }

    this._pluginDetected = !!this.detectPlugin();
    this._detectionChecked = true;

    if (this._pluginDetected) {
      try {
        this.enablePluginTranslation();
      } catch (error) {
        console.warn(
          `[PluginTranslator] Failed to enable plugin translation for ${this.getPluginName()}`,
          error,
        );
      }
    }

    return this._pluginDetected;
  }

  isDetected() {
    return this.ensureDetection();
  }

  isActive({ panel } = {}) {
    if (!this.ensureDetection()) {
      return false;
    }

    if (panel && typeof panel.isPluginTranslatorEnabled === "function") {
      return !!panel.isPluginTranslatorEnabled(this.getPluginName());
    }

    return true;
  }

  async createEntries(context = {}) {
    if (!this.isActive(context)) {
      return [];
    }

    const counts = this.countAmountSync(context);
    const leftStrings = Math.max(
      0,
      Number((counts && counts.leftStrings) || (counts && counts.left) || 0),
    );
    if (leftStrings <= 0) {
      return [];
    }

    return [{ priorityMapId: 0, strategy: this }];
  }

  countAmountSync(context = {}) {
    if (!this.ensureDetection()) {
      return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
    }

    return (
      this.countPluginAmountSync(context) || {
        total: 0,
        left: 0,
        totalStrings: 0,
        leftStrings: 0,
      }
    );
  }

  countPluginAmountSync() {
    return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
  }
}
