# Switch-controlled AutoNamePopup harvesting

RJ01236860 loads `message/AutoNamePopup`, a customized build that changes between
popup and inline speaker display based on switch 53. Its manifest initially says
inline mode. Static MT normalization therefore harvested an inline-name prefix,
while runtime messages in popup mode used the original body as their cache key.

Common event 84 contains the reported message as two empty lines followed by
the centered, color-coded text. Both the plain body and inline-prefixed body are
present in the game's cache under different keys, confirming the mismatch.

For builds configured with a positive switchId, traversal now emits both mode-0
and mode-1 message variants, deduplicates identical variants, and retains speaker
entries. Composed entries carry metadata through plugin normalization so the
plain variant does not acquire the inline prefix again. Underscore name
suppression is preserved. Event data and existing cache values are not modified.

After deployment, repeat MT for common events and maps to collect the missing
variants. Existing translations remain usable. Validation includes the reported
source shape and source immutability; live gameplay remains a separate check.
