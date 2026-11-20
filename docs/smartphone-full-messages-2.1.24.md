# Smartphone complete-message rendering

SmartphoneUI splits feed posts into lines and wraps chat messages before canvas
fillText. Translating only at the canvas boundary misses whole-message cache
keys. Fragment replacement also turns Japanese substrings into isolated English
words inside otherwise untranslated messages.

The phone adapter now resolves complete display strings before native layout.
Its save-snapshot API exposes references to phone contacts, conversations and
posts; during synchronous refresh only display text fields receive temporary
translations. A finally block restores every source value. Shared conversation
objects are visited once. IDs, prices, payment actions, likes, images and unlock
state are unchanged. This also handles phone data already present in loaded saves.

Canvas text and measurement use exact/template resolution, with fragment
replacement disabled. Existing whole-message cache entries are reused.

Regression coverage includes multiline feeds, rent invoices, payment replies,
state restoration, shared objects, and exceptions during rendering. Live game
rendering remains a separate check after deployment. Game files are unchanged.
