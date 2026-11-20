# HA album identity-cache regression (2.1.35)

Read-only inspection of the installed RJ01754039 cache found newly harvested gallery captions whose cached values equal their Japanese source. Exact caption lookup shadows the previously working shorter command translation, such as キスをする① masking キスをする -> Kiss.

The HA adapter now falls back to the command stem translation when a caption lookup returns the original text. It preserves the native circled variant marker and prefers a genuinely translated full caption when available. Identity-valued Japanese gallery captions are included in pending MT items so they can be translated again without deleting user cache files. Counts use the same pending-item collection.

A probe against the actual installed plugin sources and cache verifies キスをする① -> Kiss① and identifies 63 gallery captions eligible for retranslation. A regression test covers the shadowing case, full-caption precedence, pending-item classification, successful retranslation and translation-off behavior.

Validation: 1058 tests pass, ESLint and the 300-class registry check pass, and diff whitespace checks pass. Live in-game rendering remains unverified. Game installation, saves and user caches were not modified.
