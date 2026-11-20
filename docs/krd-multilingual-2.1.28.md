# KRD Multilingual database and save labels (2.1.28)

RJ01506024 stores Chinese base item names and Japanese KRD note variants. Its existing item cache contains `刷卡机` -> `Card Reader` and `窝囊卡` -> `Loser Card`. Looking up only the displayed Japanese text misses these entries. KRD backing fields can also contain translations applied before native getter installation.

The adapter now checks the preserved `_translateOriginal` field before the native backing field. It keeps native getters and database sources intact. TextManager.message now resolves the displayed text and preserved system-message sources through the existing system_message cache, covering save/load help, file labels and autosave when cached.

Regression tests cover translated backing fields, Chinese cache keys, Japanese native labels, and translation-off behavior. A probe using the installed KRD and DarkPlasma conversion methods verifies the database fallback and preserves the previous dialogue fix. These checks are not live in-game validation. Game installation and cache files were not modified.
