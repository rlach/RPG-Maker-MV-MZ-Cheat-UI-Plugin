# Cheat UI Architecture Guardrails

## Separate Window Model

- The game window is the source of truth for any shared cheat runtime/state.
- The separate window is a secondary UI tool, not an independent state owner.
- Do not introduce shared state that exists only on the local `window` of separate UI.

## Shared State Rules

- Shared runtime/state must be rooted on root window via `cheat-engine/www/cheat/js/RootWindowState.js`.
- Prefer module-level APIs/runtime methods over direct `window.__*` reads.
- If compatibility requires global aliases, treat them as mirrors of root-backed state.
- Do not use `window.html` global copy lists as the primary synchronization mechanism.

## Cross-Window Notifications

- For shared runtime updates, prefer root-backed subscribe/notify over local DOM-only events.
- Eventing must reach both overlay and separate window without reopen/reload.

## New Runtime Checklist

When adding a new runtime/store:

1. Root it with `ensureRootWindowStateValue`.
2. Provide a single access API used by panels/translators.
3. Add cross-window notifications through root event bus.
4. Verify changes from separate window are visible immediately in main window.
5. Avoid manual per-panel/per-window wiring in bootstrap HTML.

## Plugin Translator Hook Guards

- Hook guards are **automatically handled** by `BasePluginTranslator.ensureDetection()`.
- Each plugin translator is automatically protected against re-patching when the separate window initializes.
- Plugin developers do **not** need to implement guard logic — just override `enablePluginTranslation()` with core patch logic.
- The base class generates a unique hook guard name from the plugin name (e.g., `PLUGIN_DTEXT_PICTURE_HOOK`).
- Guardrails and guards are rooted on parent window via `HookGuardHelper.js` — child windows inherit protection automatically.

## Runtime Contracts And Boilerplate

- Follow `boundary strict, core clean`.
- Validate data at boundaries (plugin params, storage, API/network, DOM, cross-window payloads).
- Inside internal runtime code owned by this repository, avoid repetitive `typeof`/`is function` checks for known methods.
- Prefer one normalization step plus direct calls over repeated defensive branching.
- Use `types/rpgmaker-globals.d.ts` to declare known globals and runtime aliases instead of adding ad-hoc runtime checks.
- Plugin translators must rely on `BasePluginTranslator` runtime contracts (`getRuntime`, `isRuntimeTranslationActive`) and must not add local runtime/type guard boilerplate.
- When introducing new RPG Maker globals/classes/symbols in JS, update `types/rpgmaker-globals.d.ts` in the same PR.

## Unit Test Strategy

- Prefer true unit tests on small extracted modules/functions with explicit inputs/outputs.
- Avoid DOM simulation (`jsdom`, browser/window mocks of full UI flow) when testing core logic.
- If code is hard to test without DOM, refactor logic into a pure helper/module first, then test that module.
- Keep UI/window integration coverage minimal and separate from unit tests.

