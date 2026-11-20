# ItemNameEscape and getter-only database fields

RJ01605784 combines MV ItemNameEscape with DynamicDatabase. DynamicDatabase can
install getter-only name properties on live database objects and on nested
translation snapshots. ItemNameEscapeTranslator assigned into such a snapshot
during databaseEscape, causing map refresh to fail after new game/load game.

Canonical snapshot updates now use a fresh plain snapshot. When live name,
description, source, or snapshot fields are read only, native escape conversion
runs on a plain working copy; only writable result fields are committed back.
Getter descriptors and source escape strings remain intact. Disabled translation
still performs native conversion for writable fields.

The regression reproduces getter-only name/snapshot properties and verifies no
exception, preserved getters and source codes, translated writable descriptions,
and native description restoration when translation is disabled. Existing MV
variable-refresh coverage also passes. This is isolated validation, not a live
new-game/load-game check. Game installation files are unchanged.
