# CharacterSelection mission UI

RJ01461730 uses a private MZ Scene_CharacterSelection. The heading, confirmation
question, and keyboard/mouse instructions are drawText literals. Available and
unavailable character descriptions come from the characterDescriptions and
characterUnavailableDescriptions parameter arrays. The new Character Selection
translator catalogs these texts and the unavailable fallback, then uses the
shared presentation hooks to translate private Window_Base instances.

Portrait image names, background image names, audio names, switch IDs, and
selection variable 100 remain unchanged. The pink T/B/W/H measurements are
embedded in the portrait assets and are not translated.

The regression test covers extraction, asset/logic exclusions, unchanged
parameters, centered draw arguments, and translation-disabled behavior. Registry
and lint checks are separate from live-game validation. After deployment through
the user's script, run MT for Character Selection and verify the mission screen.
The game installation and images were not modified.
