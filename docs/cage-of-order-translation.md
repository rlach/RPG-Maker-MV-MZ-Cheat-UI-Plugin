# Cage of Order translation

The **Cage of Order UI and dialogue** Mass Translation category supports the MZ
plugins bundled with game v1.56:

- RandomNPCDialogue and TownRumors: NPC menus, speaker labels and dialogue pools.
- QuestBoard: quest names, clients, objectives, descriptions, warnings and labels.
- ObjectiveCore, NextObjective and MenuDashboard: current objectives, destinations,
  subevents and the additional menu status panel.
- SkillTree, JobChangeSystem and JobProficiency: job/branch/skill names,
  descriptions, requirements and status labels.
- MenuUI: custom choices stored in plugin-command arguments.
- DungeonNodeMap, ExplorationHUD, ExplorationGauge, MapPortrait, StatusFrame,
  FastTravel and NPCProgress: location labels, exploration UI and supporting text.

The catalog reads enabled plugin sources, plugin parameters, common events and
all maps. It also reads script-event messages, including effects with calculated
HP, damage, money or durability values. Acorn 8.16.0 (MIT, bundled in `libs` with
its license) parses JavaScript without executing or rewriting game scripts.
Image paths, command symbols, IDs and console messages are excluded.

Literal text keeps its authored whitespace. Multiline entries also provide the
individual lines used by these plugins' rendering loops. Dynamic template and
concatenation expressions use protected `\COT[index]` parameters, restored to the
evaluated values during display. Both legacy and TAG transport formats work with
the same custom parameter definition. Cache keys use `plugin_cage_of_order`.

Rendering hooks support private window classes and direct Bitmap text drawing.
Message glyph buffers are excluded from repeated translation. Source message
buffers remain intact; cached plugin dialogue is also made available to the
standard message pipeline. Unknown ordinary story messages are left for the
standard translator instead of being accepted as partially translated text.

Validation includes isolated rendering tests and a scan of the actual v1.56
scripts/maps. This is not a full playthrough of every quest or exploration path.
