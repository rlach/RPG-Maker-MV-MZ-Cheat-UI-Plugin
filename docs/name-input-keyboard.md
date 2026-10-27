# Portable name-input keyboard preference

The translation panel includes **Use translation language for the name-input
keyboard**, enabled by default for compatibility. Disable it to use the game's
original character tables while retaining the translated system locale elsewhere.
The option takes effect the next time the name-input window builds its table.

`autoSwitchNameInputLanguage` is stored in the translation section of portable
game settings inside the split translation cache. Existing local values migrate
only when the portable field is missing; portable values take precedence over
local and engine settings.

RJ231710 / NoTearsSchool v3.0 uses actor 11's name as a password. Map052 compares
it against the full-width string `１２３４` (and Japanese character names for
other responses). ASCII `1234` does not satisfy that condition. Disable the
automatic keyboard option and enter `１２３４` using the original Japanese table.
No game conditions or submitted passwords are rewritten.

The runtime captures the original system locale before applying the translation
language. Only the call that obtains Window_NameInput's character tables uses
that original locale when the option is disabled; a finally block restores the
translated locale. Tests cover switching the setting in both directions and
portable precedence. The password condition was inspected read-only; live-game
password entry remains for QA.
