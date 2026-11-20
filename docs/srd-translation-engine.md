# SRD TranslationEngine compatibility

RJ306595 uses SRD_TranslationEngine 1.04 with Chinese source data and Japanese
selected as its bundled localization. `data/Translations.json` stores full-message
translations, command/choice translations, terms and custom display substitutions.
Database notes contain additional `<Japanese Translation>` field values. SRD
exposes these fields through getters whose setters intentionally do nothing.

`SrdTranslationEngineTranslator` builds its catalog from the selected native
language, detached database JSON and original event commands. Message cache types
retain portrait separation. Choices are localized before the core captures their
source keys. Collection and runtime message lookup therefore use the same text.
The adapter does not change the configured language or any native dictionary.

Display lookup bridges SRD's own `translate` function, used by its bitmap drawing,
measurement and extended-text pipeline. Native TextManager getters are bridged
before formatting and concatenation, including save prompts, file prefixes and
parameter names. Database getter definitions and source identities remain intact;
their visible values can still use standard actor/item/equipment cache entries.
Previously cached authored Chinese aliases can supply translations without
harvesting those aliases again. Numeric outputs and unknown glyphs are not
collected by the display adapter.

The SRD plugin entry in mass translation includes the bundled localization and
database fields. Scanning is also possible before the native translation database
has initialized, using a detached JSON snapshot without publishing it globally.

Validation uses regression fixtures plus an isolated check against actual SRD
functions and RJ306595 data: 3,490 distinct source strings and 3,527 typed cache
keys. The check verifies localized message-key agreement, save/status terms,
read-only database names, and preservation of dictionary contents, getters and
language configuration. It does not constitute live-game UI verification.

No game installation files or graphics are changed. Install through the existing
user deployment script, then run mass translation for **SRD Translation Engine**.
