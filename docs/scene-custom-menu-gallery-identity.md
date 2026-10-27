# SceneCustomMenu gallery identity

RJ01260762 v1.0.8 uses SceneCustomMenu 1.26.4 (MV) for its Adult Site gallery.
The Scene_Site `scene` window filters armor records with:

```js
item.meta[$gameVariables.value(108).name];
```

Variable 108 contains the selected database actor. Translating its name from
トワ to Towa breaks the lookup because armor metadata still uses the original
`<トワ>` key. The empty list can then pass undefined into an enabled expression
that dereferences `item.meta`, producing the reported error.

The SceneCustomMenu translator now recognizes selected-actor metadata lookups
in data-list filters. It uses original actor names read from `Actors.json`, with
`_translateOriginal.name` as a fallback while scanning is pending. The filter
receives a temporary selected-actor view; the variable getter is restored in a
`finally` block. Names in saved actor snapshots cannot override raw identity.
Dependent windows refresh during selection before `updateIndexVariable` runs;
the filter therefore prefers the live selection in the associated member window
over its previous variable snapshot. Display names, database records, variables,
asset keys, switches and authored unlock conditions are unchanged. The enabled
hook returns false for null/undefined records instead of evaluating their scripts.
These identity protections also work with already-localized data when real-time
translation has subsequently been disabled.

Regression tests cover translated and original names, copied actor records,
unchanged metadata, unrelated filters, actor visibility and locked/unlocked scene
switches. A read-only probe used the game's original makeCommandList/isVisible/
isEnabledSub methods, configuration and actor/armor records. Towa's original
seven records (82, 83, 84, 85, 86, 204, 246) disappeared after translating her name
and returned with the fix; a locked scene remained locked. This reproduces the
failure without requiring an NW.js change. No game files or saves were modified.

The additional Seed Presser UI catalog scans rendered note fields (gallery
`hint`/`noteValue`, profile fields and equipment `plus`/`minus`) and authored
rendering templates without changing note metadata or executable scripts.
The shop's common-event D_TEXT labels are shared across variable IDs and counts.
A read-only scan of the shipped data found 504 unique source entries.
S_Itemscene_kz now selects `item_note`, `weapon_note` or `armor_note` according to
the displayed database record rather than always querying `item_note`.

Party status and strength labels are baked into
`img/parallaxes/hensei_background.rpgmvp`, verified by viewing the decoded image.
They require the image translation subsystem.

QA: restart and reopen Adult Site, select Shinomiya and Towa, back out and
reopen, then play a scene and return. Inspect locked and unlocked scenes.
Run mass translation for Seed Presser UI and weapon/armor notes to fill the
additional text entries; no gallery unlock is required.
A live NW.js playthrough has not been performed.
