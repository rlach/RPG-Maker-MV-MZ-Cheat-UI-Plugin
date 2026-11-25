# RJ01758616: Project3 custom interface

## Findings

Target: `G:\!NEWORDER\GAMES\RJ01758616\[Kimochi] RJ01758616 64bit`.

This is an author-written MZ suite, not a standard RPG Maker message UI. The translator covers 51 enabled Project3 and companion plugins, including dialogue, illustrated home, home conversations, research, streaming, event archive, save/load, squads, executives, facilities, sortie selection, world maps, training and final events.

The reported dialogue is dynamic. `Project3DialogueWindow.draw` receives whole speaker/text/title options, schedules asset loading and then wraps text into Bitmap draw calls. The inspected asset `img/pictures/Project3DialogueNeon/project3_dialogue_frame.png` contains the empty frame only. The home menu and hover descriptions also use dynamic Bitmap and PIXI.Text output. No image replacements or overlays were added.

## Sources and presentation

- Original enabled plugin JavaScript is parsed statically, without executing it. The source-only probe found 3,050 distinct catalog entries across the 51 plugins; this is a source inventory, not a final MT count.
- Original `data/EventTexts` text scripts are scanned recursively, including streaming variants. A text-only probe read 121 files and found 5,186 distinct message entries and 90 speaker entries; JSON and plugin-source entries are additional and overlap.
- Tutorial JSON, author dialogue JSON, shop chatter and battle reaction files are also read. Filename indexes, scene IDs, effect commands, cue keys, media paths and unrelated data tables are excluded from the external-data parser.
- The opening message in the screenshot was confirmed as one complete multiline `message` source. Speaker rows use `speaker` entries backed by `actor_name`; UI captions use `plugin_project3_ui`.
- The frozen dialogue API is replaced by a facade that clones presentation options before the native asynchronous renderer. Caller objects, portrait decisions, game identifiers and save state retain original values. Translated messages respect the configured message line width and the native pixel wrapping.
- Shared source-catalog Bitmap hooks translate known UI captions/templates. A PIXI.Text setter hook translates known captions before text layout. Unknown custom dialogue is observed through the standard message cache; BasePluginTranslator records original Seen keys at lookup.

Confirmed source keys include the opening dialogue, Talk, its hover description, conversation participant heading, current construction heading and construction-start button.

## Validation and limits

Unit coverage checks external grammar, aliases, newlines, protected commands/cues, JSON field selection, frozen API/deferred drawing, caller-state preservation, PIXI output, disabled translation, standard cache namespaces and cached redraw/rescan identity. The source probes read the installed game without changing it.

No game files were changed and no Cheat Engine deployment was performed. Live in-game interaction remains unverified. The native dialogue renderer retains its own three-line display limit; unusually long translations may require shorter wording or a smaller configured line width. PIXI labels created during source scanning are refreshed from their original caption when scanning finishes.

Validation results: 1,168 tests across 225 files passed, including the final startup-label refresh. Registry: 323 classes, format and lint pass. Duplicate check retains its pre-existing 910-clone failure. Version: 2.1.73.
