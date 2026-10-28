# GraphicalDesignMode custom window translation

Verified with Triacontane GraphicalDesignMode 2.10.7 (MV), bundled in RJ293625.
The private JavaScript `settings` table defines custom windows for menu, title
and battle scenes. `windows[].lines` contains visible text; `switchId`, picture
filenames and `data/ContainerProperties.json` geometry remain technical data.

`GraphicalDesignModeTranslator.js` parses that literal table with Acorn without
executing game scripts. It collects all conditional variants, strips alignment
commands already removed by Window_Custom, and ignores pure numeric/icon/variable
display chains. Mass translation and runtime drawing use
`plugin_graphical_design_mode` cache entries. The shared SourceTextCatalog
drawText/drawTextEx hooks translate before escape conversion and track seen keys
through the base runtime resolver. Original lines and switch conditions are never
rewritten.

`CombineCharacterECTranslator.js` registers Yana CombineCharacterEC 1.00 display
text decoration controls, including the underlined `UL[text]` headings. Commands
are protected while their visible contents remain translatable.

A read-only scan of the installed source found 34 unique entries, including
the character's displayed name, labels, units, days, level variants and conditional
status captions. The decoded `img/pictures/miyu_menu.rpgmvp` contains the character
illustration with no text; the labels shown in the report are rendered text.

Tests cover literal extraction, conditional variants, source/geometry exclusion,
runtime display substitution and seen tracking, unchanged source lines, and
translation of text inside decoration commands. Run mass translation for
GraphicalDesignMode custom windows, then reopen the menu. A live NW.js playthrough
has not been performed.
