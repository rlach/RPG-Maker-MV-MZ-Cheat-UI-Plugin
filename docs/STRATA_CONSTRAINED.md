# Experimental Strata constrained output

In the OpenAPI compatible connection settings, enable **Experimental: Use strata constrained**
when using a PolyStrata binary built with `STRATA_ENABLE_CONSTRAINED=ON`.
The option is off by default and is saved with the translation engine connection settings.

All chat-completion requests ask for JSON, including JSON repair, text reformatting and language checking.
With the experiment enabled, requests also send `strata_constrained: true`, override
`reasoning_effort` to `none`, and send `response_format.type: json_schema`.
With it disabled, they use `json_object` and retain the configured reasoning effort.
The flag is not sent to the Open WebUI provider.

Translation schemas contain the exact IDs from the current batch, with string values and no unknown keys.
They deliberately do not require every key: existing recovery still handles missing translations.
The optional `kbase` array is described separately when knowledge-base generation is enabled.
Language checking uses `{ "isTranslated": true }` or `{ "isTranslated": false }`.
Repair requests retain known batch IDs, including recursive repair attempts.

Local guards still detect duplicate keys before JSON parsing can overwrite them, and reject unknown batch IDs.
This remains necessary for unconstrained responses and generic pattern-based repair schemas.
JSON grammar constraints do not guarantee a correct translation.

Validation: AI-engine and translation-panel tests, plus live translation and JSON-repair requests against
PolyStrata on localhost:8081. Reload the plugin in the game to load changed source files.

The reasoning effort setting is always sent explicitly, including `none`, so server defaults cannot
silently enable thinking. The Strata checkbox is forwarded from the panel to the shared runtime and
engine before persistence and request construction. Its enabled requests carry `strata_constrained: true`,
`reasoning_effort: "none"` and the expected JSON Schema, including repair requests.

Changes affect the plugin source in this repository. An already loaded game needs the updated plugin
files and a reload; this change does not rewrite installed game files.

The checkbox uses the standard runtime-backed model and change handler, like the other form fields.
All persisted ConfigManager handlers share one flow: mutate the engine, synchronize its configuration
back to the runtime, then save settings. There are no per-control synchronization switches or a
special computed setter for this checkbox.
Regression coverage writes through KeyValueStorage to an actual temporary settings file, creates a new
runtime and engine, restores that file, and verifies the constrained request contract after restart.
A mounted Vue 2/Vuetify form was also checked for toggle/save/reload behavior; this is an isolated
form verification, not a live RPG Maker game session.
