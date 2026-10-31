# Core UI window regressions

The complete UI uses bundled Vue 3.5.22 and Vuetify 3.9.0. There is no Vue 2
runtime or prototype mode. Styles and MDI fonts are bundled for offline use.
Both embedded and separate windows use the same application factory. Each window
loads its own libraries and compiles its own component templates; game APIs and
settings remain shared. Shared translation modal state explicitly notifies each
window and removes its subscription on unmount.

Compatibility helpers run in the owning document before the libraries load.
They provide missing array/string methods for older NW.js versions. The slider
CSS uses physical positioning when logical inset properties are unavailable.
This preserves the prototype fixes validated with NW.js 0.49.2 and 0.61.0.

Table headers and sort bindings adapt the existing settings representation to
Vuetify 3 without migrating users' stored sorting preferences. Game actors and
inventory records retain raw identity when referenced by reactive forms.

Tag Manager displays the source newline as `\n`, with separate transport symbol
and LLM encoding columns. Notifications queue with independent timeouts.
Koharu remains hidden while its integration service is unavailable.

## Automated validation

Run `yarn test`, `yarn lint`, `yarn check:translators`, and `yarn format`.
Vitest excludes generated deployment files and browser profiles.

Serve the repository root over HTTP, open `/tests/ui-browser.html` in headless
Chrome with remote debugging port 9340, then run `node scripts/probe-ui.mjs`.
Use `--reload` after edits and `?maker=MZ` for the MZ fixture. The fixture uses
mock game objects and an in-memory filesystem; it does not modify game saves.
It compiles nested templates, mounts every panel, and checks slider movement,
navigation and translation/boxing modal updates. `UI_CDP_URL` overrides the
remote debugging endpoint. Browser integration checks do not replace actual
NW.js game QA.

For release QA, install the corresponding MV/MZ archive and launch `nw.exe`.
Check overlay shortcuts, separate-window reopen/close, sliders during drag,
settings dropdown ownership, table filtering/sorting/editing, mass translation,
notification dismissal, and persisted settings after restart.

## Layout regression checks

The 2.0.1 follow-up restores local Roboto fonts, compact unlabelled inline table
editors, one-row pagination, blue leaf navigation, wrapping action toolbars,
consistent top-right refresh controls, and warning colors. `CheatTooltip` closes
on action clicks and deactivation, including when a clicked button disables itself.

With the fixture and debugging endpoint running, use:

```sh
node scripts/probe-ui.mjs --reload --layout-check
node scripts/probe-ui.mjs --reload --screenshots
```

Layout checks use four party members and five inventory rows with realistic
multiline descriptions. At overlay widths 620 and 760 they verify row visibility,
footer height, refresh geometry, HP/MP alignment, Names Manager checkbox width,
export language text, warning colors, and tooltip dismissal after disabling its
activator. Screenshots go to `deploy/output/ui-review`; `UI_SCREENSHOT_DIR`
overrides this directory. The checks and screenshot review also ran headlessly
on Chromium 86 from the copied NW.js 0.49.2 runtime. Game playthrough QA remains
separate. Browser fixture bootstrap avoids top-level await for that runtime.

The 2.0.2 layout checks also cover placeholder padding, shortcut clear-button
alignment, variable-editor width, consistent inline editor outlines, switch
sizes, X/Y alignment, exporter scrolling with 40 folders, the tag-format field
after resize, teleported tag override editors, unknown-tag table margins, and
compact mass-translation rows. Common field/table rules apply to both #app and
Vuetify's overlay container. Dynamic layout-check imports bypass browser cache.

## Keyboard regressions

Run `node scripts/probe-ui.mjs --reload --keyboard-check` against a running
headless browser endpoint. The fixture registers an RPG Maker-like document
handler before mounting the UI, including default cancellation of Backspace and
arrow keys. CDP dispatches actual keyboard input to both embedded and separate
windows: cursor movement, Backspace, Ctrl+A, numeric up/down stepping, and a plain
textarea in the teleported overlay container. Editing keys must not reach the
game handler; an input outside the UI must still reach it. `UiKeyboardGuard`
stops bubbling from editors after their local handlers, without preventing
browser defaults. Vuetify field handlers use `.stop` rather than `.self.stop`
because Vue 3 forwards listeners to wrappers around the native input.

Numeric-only editors (Gold, HP/MP, item quantities, stats and teleport coordinates)
use native number inputs. Variables retain text inputs so strings stay editable;
Up/Down steps finite numeric variable values by one and leaves string values
unchanged. Keyboard QA covers Gold, settings numbers, numeric and text variables.
