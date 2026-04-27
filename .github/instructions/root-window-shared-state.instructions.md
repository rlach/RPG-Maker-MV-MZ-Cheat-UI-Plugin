---
applyTo: "cheat-engine/www/cheat/**/*.js"
description: "Use root-window backed shared runtime/state for overlay + separate window"
---

# Root-Window Shared State

When editing cheat runtime/panels/translators, follow these rules.

## Single Source of Truth

- Treat game/root window as the source of truth.
- Separate window must only operate on root-backed runtime/state.
- For shared state, use `cheat-engine/www/cheat/js/RootWindowState.js` helpers.

## Required Patterns

- Create or get shared stores via `ensureRootWindowStateValue`.
- Use root event subscriptions (`subscribeRootWindowEvent`) for cross-window UI refresh.
- If legacy code expects `window.__*`, keep it as a mirror/alias of root-backed state.

## Avoid

- Avoid introducing new shared state that is only local to current `window`.
- Avoid relying on `window.html` global copy lists for correctness.
- Avoid DOM-event-only propagation when state must update both windows.

## Regression Checks

For any change in shared runtime/state, manually validate:

1. Main overlay and separate window see the same state.
2. Update from separate window reflects immediately in main window.
3. Update from main window reflects immediately in separate window.

## Plugin Translator Hook Guards

- Hook guards are **automatically centralized** in `BasePluginTranslator.ensureDetection()`.
- When creating or updating plugin translators, simply override `enablePluginTranslation()` with your patch logic.
- Do **not** add manual guard checks — the base class handles guard management and cross-window safety.
- Each plugin is automatically assigned a unique hook guard name based on its plugin name.
- Guards are rooted on the parent window, so separate window initialization will not re-apply patches.
- Example: Extending `BasePluginTranslator` and implementing `enablePluginTranslation()` automatically gets protection.
