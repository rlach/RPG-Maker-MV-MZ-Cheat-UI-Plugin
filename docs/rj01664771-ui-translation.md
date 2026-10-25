# RJ01664771 UI translation

The **EUL / kzmz save, menu and overlays** Mass Translation category supports
the text-based UI in the analyzed v1.02 game distribution:

- `kzmz_SaveMenu`: detail labels and expressions with saved values.
- `kzmz_MenuExWindow`: location, playtime and money labels.
- EUL packs 03–07: text controls, TODOs and the special-status prose overlay.

The scanner reads nested parameter JSON and parses display expressions without
evaluating them. Dynamic values use protected `\COT[index]` parameters. Rendering
uses the same shared source-catalog infrastructure as Cage of Order; existing
Cage of Order cache keys remain unchanged. The EUL/kzmz cache type is
`plugin_eul_kzmz_ui`.

The EUL special-status sprite is closure-private. Its source text is translated
before variable expansion, tokenization, word wrapping and font fitting. The
original parameter text is restored after conversion.

The following labels are bitmap content and are deliberately not translated by
this category:

- `img/system/SchoolStatusHud.png_`: the school control/follower/slave labels.
- `img/system/madougu_syojisuu.png_`: the magic-item creation counter heading.
- `img/pictures/syougou_*.png_`: achievement badges shown by ExtraImage.
- `img/pictures/Erostatus_*.png_`: most special-status labels and headings.

These assets belong to the image translation subsystem. The prose overlay on
top of the special-status background is independently translatable text.

## SoR icon resolution

Command harvesting can create identity entries such as `Magic -> Magic` and
`Special Move -> Special Move`. These must not conflict with genuine reverse
skill-type mappings (`魔法 -> Magic`, `必殺技 -> Special Move`). The SoR resolver
ignores identity entries while continuing to reject conflicting non-identity
sources. It passes restored names to the existing EUL ASCII-name patch, which
selects `Com_mahou` and `Com_hissatsuwaza`, including disabled variants.

Validation used the real plugin parameters, event data, current translation
cache, and isolated original SoR/EUL image-loading functions. No game files were
changed. Full in-game UI navigation remains unverified.
