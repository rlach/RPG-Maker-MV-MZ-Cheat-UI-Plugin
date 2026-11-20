# HA dialogue fragments, album captions and cache replacement (2.1.33)

HA parameter narratives were harvested as complete strings, while native pushMessages splits them into separate dialogue boxes and HA_WindowStyle removes speaker lines. The adapter now harvests paragraph, line and speaker-free body variants, for parameter and source narratives. The reported contact-exchange dialogue is verified in the installed game's expanded catalog.

HA_Album builds captions from common-event names. The adapter now harvests those derived captions, including main story, pure love, endings and Lv5 variant suffixes. Native event names remain unchanged so category matching and game logic retain their original inputs. A read-only probe executes the installed titleOf function and verifies all 71 candidate captions in the catalog (including names outside the currently visible album selection). The source catalog now contains 1291 entries and 47 dynamic templates.

Cache Manager no longer disables Replace when Search in is Translation. Replacement continues to operate only on translations within the current filter; original cache keys are preserved.

Regression tests cover fragmented parameter dialogue, derived captions in each category, source-name preservation and translation-only replacement with persistence of only changed rows. No game installation or user caches were modified. Live game screen verification remains outstanding. Run Mass Translate after installation to translate newly harvested entries.
