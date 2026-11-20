# Actor-name conditions and battle layout

RJ01544310 uses actor 50 as a character identity token. Native actor-name
conditions compare it with Japanese literals. Common events 44, 71, and 75 use
these conditions to choose battle preparation, dialogue coordinates, and picture
configuration. Many expression and CG events use the same mechanism.

After command 320 applies a cached actor-name translation, native command 111
compares the translated name with its original Japanese spelling and fails.
The message window retains map coordinates instead of the enemy-dialogue
coordinates, and character-picture branches are skipped.

The runtime now adapts actor-name conditions when the current name exactly
matches the cached translation (including the command-320 capitalization form)
of that condition's original token. It delegates to the native command using a
temporary parameter copy. Actor state, database entries, event lists, and saved
names are unchanged. Original names, manual renames, cache misses, unrelated
conditions, and disabled translation keep their native behavior. Both MV and MZ
command signatures are supported.

Validation includes MV/MZ regression tests and an isolated probe using this
game's native command111 plus its actual common-event parameters and actor-name
cache. The three sampled event conditions fail before the fix and pass afterward.
This confirms branch behavior, not live battle rendering. Game files and image
assets were read only; deployment remains with the user's script.
