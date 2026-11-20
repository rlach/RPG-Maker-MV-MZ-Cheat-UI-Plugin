# Cache manager and displayed message log

## Large cache tables

The cache manager passes only the current page to `v-data-table-server`. Filtering
and sorting are cached independently of pagination. Prepared rows live in a frozen
array so Vue does not create reactive proxies for tens of thousands of entries.
Edits replace the array to invalidate derived results. Suspicion updates do the
same. A snapshot keyed by cache identity, revision and language pair survives
component remounts. Runtime changes invalidate that snapshot.

Initial preparation yields after approximately eight milliseconds of work and
shows a loading state. Deactivated panels stop rebuilding the table; activation
checks the latest cache revision. Pending work is cancelled on deactivation and
unmount.

For repeatable browser measurements, serve `tests/ui-browser.html`, open it in a
dedicated headless browser with CDP enabled, then run:

```powershell
$env:UI_CDP_URL = 'http://127.0.0.1:9340'
node scripts/benchmark-cache-manager.mjs 'C:\path\to\translation-cache'
```

The benchmark reads cache files and uses an in-memory browser fixture. It does not
write the game's cache. Results and a screenshot are written under
`tmp/cache-benchmark/`. A local run using the 61,771-entry RJ328940 cache measured
219 ms opening, 38 ms changing page, 34 ms reactivating the panel and 100 ms
recreating it. This is a headless-browser fixture measurement, not an in-game
performance guarantee.

## Displayed text

Text Log snapshots `Window_Message._textState.text` after the game's escape
conversion, rather than collecting raw `setChoices` arguments. A message keeps
the same log entry until `Game_Message.clear`, so translation and late choices
update that entry. Choice text is captured when the choice window opens; selection
is marked before the game's choice callback runs. Names and variables are resolved
at display time and do not change retrospectively when game state changes.

In 2.1.10 log-only escape expansion uses the base window converter. Re-running
`Window_Message.convertEscapeCharacters` can clear Lunatlazur's name window,
including when given an empty speaker string. Speaker snapshots read active
native/plugin name boxes first and fall back to the message's speaker field;
inactive boxes cannot leak a previous speaker into narration.

## Mano_Quest

The RJ01080922 quest interface is runtime text. The translator reads quest names,
requesters and state-dependent message lines from `data/Quest.json`, plus the
plugin's UI parameters. It hooks the private window classes exported by
`Mano_QuestSystem`, preserving quest IDs, conditions, rewards and progress codes.
The inspected game has 332 distinct catalog entries. No picture assets are edited.

In 2.1.9 the quest description stacks each translated fragment after the actual
bottom of the previous `drawTextEx` result. Native wrapping, variables and font
controls remain in charge of rendering. Visual row counts include wrapped lines;
long descriptions can be scrolled with the wheel while the pointer is over the
description, without moving quest-list focus. Original message arrays and cache
keys remain unchanged. Quest changes reset the description scroll position.
