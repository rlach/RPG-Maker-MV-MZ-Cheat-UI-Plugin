# Dry-run materialization of rediscovered source copies (2.1.36)

The HA adapter correctly identified 63 Japanese identity-valued captions as pending, but the shared batch-result writer classified any nonempty cache entry as usable. It therefore preserved source-copy values during dry run instead of creating empty translations. CacheEmptyStrings only reads empty values, so these entries remained invisible to that phase and the dedicated report counted zero.

For a simulated dry_run failure explicitly queued by a phase, the writer now clears an existing cache value when it equals the harvested source value. Missing entries continue to be created as empty. Existing distinct translations remain protected. The change operates through the normal cache write/persistence path and the dedicated unique-key report now observes the materialized pending keys.

The integration regression starts with a Japanese source-copy caption and an existing English translation, runs dry run, verifies the caption becomes empty while the English entry remains intact, checks the unique-key count and CacheEmptyStrings discovery, and then runs ordinary MT to translate the harvested entry successfully.

Game installations and user cache files were not modified by this development task. Live game validation remains outstanding.
