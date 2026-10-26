# RJ01144567 custom message translation

Report: https://trello.com/c/GJdhJSep

The MV v1.05 game uses FTKR_ExMessageWindow2 v2.4.0 alongside
YEP_MessageCore. Each numbered window has a separate Game_Message buffer and
Window_MessageEx overrides startMessage. It bypasses the standard dialogue
translation hook, even though normal map/common-event scanning finds its text.

FtkrExMessageWindowTranslator resolves the original complete message with the
standard message/portrait cache lookup and the YEP merged-message cache fallback.
It temporarily replaces only that window's rendering buffer, restoring it even
if rendering fails. Choices use the choice cache at the choice-window start
boundary; original values and selection indices are retained.

TMSimpleWindow v1.2.0 supplies another 99 showWindow/showNoBackWindow commands.
Its closure-private Window_Simple class is discovered through the spriteset
factory. Text is translated in refreshContents, with original _text restored so
the plugin's needsRefresh comparison does not redraw perpetually. Literal
backslash-n sequences use actual newlines in both scanning and runtime lookup.

FTKR_PopupSpriteMessage v1.2.5 is also supported: both SHOW_POPUP forms and their
Japanese aliases supply text entries to shared event traversal. Translation
occurs before escape expansion and glyph sizing, preserving all position,
duration, font and animation arguments. No PSM display commands were found in
this game's map/common-event data; its visible bubbles use the other windows.

TM/PSM payloads appear under ordinary Messages in Mass Translation. Runtime
observation uses existing cached translations and harvests missing original keys.
Source map data, game plugin files and saved window records are not rewritten.

## Verification

- Regression tests cover separate buffers, cache fallback, choices, disabled
  translation, failure restoration, command aliases and popup control arguments.
- Replayed the game's original FTKR startMessage method against the screenshot
  dialogue in Map083/event 3; verified translated rendering and intact source.
- Scanned all actual map/common-event data and detected 99 TM window payloads.
- Full live game navigation and live LLM requests were not exercised.

## Manual testing

1. Restart the game with the updated cheat plugin.
2. Run Mass Translation for Messages (including newly found TM window text).
3. Revisit the screenshot conversation, additional numbered message windows,
   popup bubbles and any choices; confirm translation and unchanged input flow.
4. Disable both realtime and cached translation; verify original text returns.

## Quests, daily report and business screens

Two additional Mass Translation categories cover the remaining programmatic UI:

- **Ayatam quest system** reads the nested GlobalSettings and QuestDatabase
  parameters of Ayatam_HighQualityQuestSystem MVMZ v1.05 (verified MV), plus its
  display literals. The actual game supplies 343 unique catalog entries. Copied
  drawTextEx implementations on quest windows are hooked before glyph rendering.
  Quest IDs, conditions, status flags and character/image fields remain original.
- **Event UI text (reports and business)** reads showWindow and D_TEXT payloads
  and follows their referenced variables back through Control Variables script
  expressions and variable-copy assignments. It parses syntax without evaluating
  scripts. The actual game supplies 620 catalog entries, including the daily
  revenue/star multiplier lines, business labels, customer traits and requirements.

The event UI translator resolves raw display templates and string-valued display
variables before escape expansion, then matches expanded text against known
literals/templates. This is limited to TM's private Window_Simple class and the
hidden window used by DTextPicture. ESC color/icon codes remain in renderer form.
No global variable getter or saved variable value is replaced. Dynamic source
expressions use the shared protected COT parameter tag and retain original values.

Run both new categories after restarting. Existing TM text in the Messages
category remains supported. The quest database and displayed business strings
were checked against real game data; full live quest/business navigation remains
manual validation.
