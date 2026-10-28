# RJ01716681 custom UI translation

The MZ distribution uses unversioned custom scripts for the reported displays:

- `CustomSaveLayout_new.js`: save/load timestamp, actor part, day progress,
  playtime and location labels. Save metadata itself remains unchanged.
- `MenuSubCommand.js`: modified menu draws `経過日数：${day}日目` and
  `現在地：${mapName}` directly, outside the standard database translation path.
- `SceneCustomMenu`: the battle help window draws `item.note`, not
  `item.description`. Skill 5 (祝詞, Ritual Chant in the report) has an empty
  description and the reported two-line HP recovery description in its note.
- `MyDisplayFunctions`, `getHelpTitles`, `getEventProgressTitles` and
  `SevenWondersDisplay`: related custom help, battle and progress text sources.

`RJ01716681UITranslator.js` uses the shared SourceTextCatalog scanner and drawing
hooks. Source JavaScript is parsed without executing or rewriting it; skill notes
are read from `data/Skills.json`. A read-only scan of the installed source found
137 unique entries. The adapter requires both CustomSaveLayout_new and
MyDisplayFunctions, so generic MenuSubCommand alone cannot activate skill-note
scanning in another game.

Mass translation uses `plugin_rj01716681_ui`. Static labels, plain part names and
dynamic templates are collected together. COT parameters preserve dates, times,
counts and locations; nested values such as `2日目` can resolve as `Day 2` inside
the save summary template. Shared drawText/drawTextEx/Bitmap hooks apply only
display translations and track seen keys through the base runtime resolver.
No save records, note metadata, commands, game variables or unlock switches are
rewritten. The reported elements are drawn text, not image labels.

Tests cover extraction of skill notes with empty descriptions, dynamic menu and
save values, nested day/part translation, seen tracking and unchanged source
records. Run mass translation for **RJ01716681 save, menu and battle UI**, then
reopen the screens. Existing save metadata is supported. A live NW.js playthrough
has not been performed.
