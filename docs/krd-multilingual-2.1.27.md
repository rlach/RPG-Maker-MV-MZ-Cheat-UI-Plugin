# KRD Multilingual and DarkPlasma names — RJ01506024

The game has literal `\n` immediately before `\ndp<2>` inside KRD LANG blocks.
Translation uppercases the unused newline control to N. After native name-tag
removal, RPG Maker sees `ESC NWhat's...` and consumes NWhat as one unknown code,
leaving only `'s...`. The adapter normalizes bare n/N controls to actual newlines
before native language/name processing. Actor N[1], speaker N<name>, and longer
escape symbols retain their original syntax.

KRD replaces database fields with getters that read name_0/language metadata and
dictionary entries. Applying a translation to the ordinary database property
does not affect those getter results. The adapter resolves native getReturnData
results through existing typed cache keys, including actor_name and item_name,
without rewriting native dictionary data or overriding language selection.
LANG, LANGEND, and DarkPlasma NDP controls are registered for future translations.

An isolated probe ran the installed game's native escape converter, KRD language
selector/getters, and DarkPlasma name removal: the broken result began with
ESC NWhat before the fix, and afterward retained `What's wrong?!`, the translated
speaker, and the translated item name. Unit tests additionally cover native
read-only getters, disabled translation, and unrelated controls. This is not live
game rendering validation. No installation or cache files were changed.
