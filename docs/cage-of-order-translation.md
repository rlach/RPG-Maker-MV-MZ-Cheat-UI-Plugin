# Cage of Order translation

The **Cage of Order UI and dialogue** Mass Translation category supports the MZ
plugins bundled with game v1.56:

- RandomNPCDialogue and TownRumors: NPC menus, speaker labels and dialogue pools.
  TownRumors' embedded base64 table is decoded as UTF-8; level markers and comments
  are excluded using the same rules as the game.
- QuestBoard: quest names, clients, objectives, descriptions, warnings and labels.
- ObjectiveCore, NextObjective and MenuDashboard: current objectives, destinations,
  subevents and the additional menu status panel.
- SkillTree, JobChangeSystem and JobProficiency: job/branch/skill names,
  descriptions, requirements and status labels.
- MenuUI: custom choices stored in plugin-command arguments.
- UraStatus, HiddenStatus, EroStatus and EnhancedStatus: hidden stats, earned
  titles, empty-title messages, equipment labels and status headings. EroStatus's
  `tag` properties are visible titles, so they are included explicitly.
- CGManifest, CGGallery and DefeatScene: category headings, recollection menus,
  scene titles and external defeat/ending dialogue.
- EroticAttackSystem: fallback/enemy-specific text tables and Skills.json
  `<eroticText:...>` payloads. The presenter translates complete text before its
  sprite splits lines. Literal `\\n` and actual newlines share the same canonical
  key. Skill notes, metadata and combat logic remain original.

The game's recollection **Unlock all** action raises all nine species-defeat
counters to at least 3. EroStatus uses those counters to award two titles per
species. This is original game behavior, independent of translated title names;
the translator does not reset or change these counters.
- DungeonNodeMap, ExplorationHUD, ExplorationGauge, MapPortrait, StatusFrame,
  FastTravel and NPCProgress: location labels, exploration UI and supporting text.

The catalog reads enabled plugin sources, plugin parameters, common events and
all maps. It also reads script-event messages, including effects with calculated
HP, damage, money or durability values. Acorn 8.16.0 (MIT, bundled in `libs` with
its license) parses JavaScript without executing or rewriting game scripts.
Image paths, command symbols, IDs and console messages are excluded.

DefeatScene's literal species configuration and folder/file records identify all
59 story text files shipped in v1.56, including both body variants and endings.
They are read without executing JavaScript. Dialogue parsing follows the game's
control-line filtering, speaker normalization and whitespace trimming. Translation
occurs in `Window_DefeatText.refresh` before wrapping; source fields are restored
afterwards. Seen tracking observes complete original dialogue and speaker values,
not wrapped fragments. Audio/CG directives and asset paths remain untouched.

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
The status/gallery real-data scan found every supplied screen example, including
the encoded rumors and external machine-defeat narration. A separate attack-data
check confirms every authored skill eroticText payload, including the reported
machine-attack narration, is present in the catalog.
