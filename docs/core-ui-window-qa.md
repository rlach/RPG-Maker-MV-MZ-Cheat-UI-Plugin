# Core UI window regressions

Tag Manager displays the source newline as `\n`. Separate Symbol and LLM encoding
columns show the actual registered transport ID and selected TAG/legacy syntax.
They are searchable. Masked and XML parameters use the registry's normalized
transport representation.

Notifications queue in arrival order. Each starts its own timeout after it is
displayed, can be dismissed manually, and cannot be closed by an earlier timer.
Nonpositive timeouts remain visible until dismissed. Teardown clears timers and
restores the prior alert handler without overwriting a newer handler.

Separate Window loads the bundled Vue and Vuetify in its own DOM realm, without
sharing parent constructors or CommonJS module caches. Imported component options
are cloned recursively to remove Vue 2's constructor cache, including nested
components, mixins and extends. Sharing the raw options can otherwise reuse a
parent constructor even after loading local libraries. Game APIs remain shared.
Removed the ineffective Vuetify 3 defaults configuration from the Vuetify 2 app.

Unit tests cover notification timing, dismissal/teardown, TAG and legacy newline
encoding, masked XML encoding and constructor-cache isolation.

Browser regression fixture: serve the repository root with a local HTTP server
and open `/tests/window-ui-browser-probe.html`. It uses the actual bundled
libraries in two documents and deliberately reuses parent component options.
The result must report true for distinct Vue/Vuetify instances, menu ownership
and attachment, first-menu dismissal, second-menu opening, slider movement,
release, blur and constructor isolation. The fixture passed in headless Chrome
(the slider moved from 20 to 80). This is a browser DOM integration test, not an
NW.js game playthrough. Manual QA should also reopen/close Separate Window and
check General sliders, settings selects, tag display and queued notifications.

Separate Window must mount directly onto the live `#app` element. Mounting with
`$mount()` and appending the root afterward leaves Vuetify sliders' `app` event
target null: its mounted hook queries the document before `[data-app]` exists.
The browser fixture now dispatches drag events on the actual slider DOM instead
of the slider's cached event target, checks thumb position before mouseup, and
switches between two sliders. With `?detached`, it reproduces the previous bug:
no live target, no drag update, and sliders remain active after release. The
normal path reports a live target, 80% thumb position during drag, released
sliders and cleared previous focus.

The Koharu tab and its component registration are temporarily removed from
CheatModal while the integration service is unavailable. The implementation and
saved integration settings remain available for a future restoration. A stale
panel selection falls back through CheatModal's existing navigation handling.
