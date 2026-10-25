# LLM tag formats

Select **LLM tag format** in **Tag Manager**:

- **TAG delimiters** (default): `⟪TAG:sn⟫`.
- **Legacy brackets**: `[b=sn]`.

Both options use the same custom tag definitions, plugin tags, overrides, mask
tables, counts and restored game escape codes. The selection is stored in the
`tags.tagFormat` field of `translate-cache/game-settings.json`, shared across AI
providers. Existing custom tag settings require no edits. Existing decoded
translation cache entries remain usable after switching formats.

Only the outer transport delimiters change. Numeric parameters remain attached
to their generated identifier, and custom parameters retain their configured
brackets. For example:

| Legacy            | TAG delimiters        |
| ----------------- | --------------------- |
| `[b=sn]`          | `⟪TAG:sn⟫`            |
| `[b=wi12]`        | `⟪TAG:wi12⟫`          |
| `[b=na<Name>]`    | `⟪TAG:na<Name>⟫`      |
| `[b=ni[[b=wi1]]]` | `⟪TAG:ni[⟪TAG:wi1⟫]⟫` |

Identifiers are generated from the tag registry; these are illustrative examples.
Masked parameters still carry mask IDs instead of filenames or other protected
values. This format does not introduce named attributes or paired wrapper tags.
Literal `【names】` remain ordinary text.

System instructions, description boxing instructions, per-tag prompt additions,
and examples in saved custom prompts are adapted to the selected format when
sent. Saved prompt text is not rewritten. Tag counts, masked IDs, long whitespace
runs, balanced parameter brackets and unknown/unresolved tokens are checked using
the selected syntax. Error diagnostics include the exact unresolved token,
its position and surrounding text.

Each preprocessed item remembers its format. A response already in flight is
decoded using that request's format even if the selection changes meanwhile.
