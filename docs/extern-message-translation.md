# ExternMessage 1.1.0 dialogue translation

RJ01295905 uses Baizan's ExternMessage MV/MZ plugin to expand external CSV
references into standard dialogue commands. Its dictionary is `$externMessage.map`
with string values. The previous translator expected `_map` with column arrays,
so Mass Translation found no entries. It also omitted MZ speaker keys.

The translator now asks the plugin's own `convertMessageCommand` parser to
compile dictionary values without executing the generated event commands. Shared
event traversal extracts exact complete pages, portrait messages and speakers,
including recursive references and authored whitespace. The ExternBaseTranslator
accepts per-entry cache types while retaining its default for other subclasses.
Runtime observation records original compiled keys at `command101`; the existing
core message window applies cached translations. Neither CSV data nor generated
commands are translated in place.

A read-only probe ran the supplied game's actual plugin parser against
NurseryExternMessage.csv and produced 1,634 entries before cache-key deduplication.
Both screenshot messages and the speaker ヨミ were found. Regression tests cover
typed keys, whitespace, deduplication, cached counts, data availability retries,
runtime observation and disabled translation. No live-game playthrough was run.

QA: restart, run Mass Translation for **ExternMessage CSV**, and revisit the
opening dialogue. Speaker names are translated through standard `speaker` keys;
actor names and speaker entries remain separate categories.
