# RJ01106224 input configuration and shop labels

## Mano_InputConfig

The reported cache contains 115 entries, including physical keys, button indexes, other option labels and already translated English display text. The translator previously harvested every drawText payload in the configuration scene, including nested translated output.

Runtime lookups are now restricted to an immutable source catalog read from js/plugins.js. Authored jp/en variants map to the same canonical source label. Unknown display text is left untouched; numbers and hardware key caps are not inferred as sources. No language-character filtering is used. Disabled translation preserves the native selected-language variant. The startup scan prepares the catalog before the settings scene is opened.

The existing cache is not repaired or deleted by this change. Already collected entries remain in the file until separately cleaned with authorization.

## ShopScene_Extension

The comparison screen's なし label is dynamic text from the NoneItemText plugin parameter. A dedicated translator catalogs that parameter from the original manifest and resolves it at the drawing boundary with normal Seen tracking. Item identities and plugin configuration remain unchanged.

## Verification

Permanent tests cover source provenance, native language variants, repeated translated redraws, unknown control labels, disabled mode and shop label collection. A temporary probe against the original game files confirmed the Mano catalog excludes reported unrelated keys and the shop catalog contains なし. These checks do not constitute a live game launch. No deployment or game-source/cache modification was performed.
