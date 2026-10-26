# Forestia / Inazuma translation

Supported source: Forestia MZ v1.4.4 + DLC. Source game files remain untouched.

## Text catalog and runtime boundaries

The **Forestia / Inazuma custom interfaces** Mass Translation category reads the
custom database fields identified by the game's own i18nScriptDatabase module:
Text, QuestContent, QuestConditionTarget, DairyShed, DairyLivestock,
DairyLivestockGroup, Group, Indicator, CharacterLabel, PlaceGroup, FishingArea,
GlobalMapInfo, Location, TipsText, Dialog and Calendar. It additionally scans
enabled non-debug Inazuma plugin source display literals without executing scripts.
Standard item/actor/skill translation continues through existing engine support.

The real-data scan found 1,136 unique entries and 296 matchable templates across
the custom tables and enabled sources. It does not scan all map dialogue again.
The shared source-catalog map loader now imports its UI dependency at scan time,
avoiding a registry/batch-manager initialization cycle.

Iz.Text.get is translated before the game interpolates formatter slots. Shared
Sprite_Text and Sprite_TextEx setText methods cover custom UI drawn outside
Window_Base, before measurement and character drawing. Table records, IDs,
conditions, icon keys and asset filenames remain original. Runtime observation
uses the base translator's source-key/seen tracking.

Formatter slots such as {0} and actor/variable references such as \\n[3] are
represented by protected COT parameters. The raw macro and its expanded display
form share one translation: for example \\n[3]との出会い and
Retrieとの出会い resolve through the same canonical key. Original macro casing,
parameter values and authored indentation are retained. Literal newline markers
are normalized without treating lowercase actor references as newlines.

## Automatic tags

Forestia registers TRN, IL, FSET, FRESET, NE, SHOPTIME, FACTIME, Item, ItemNum and
DAIRY_EGG. TRN is a localization ID, IL an image/control-button key, NE the final
character of an actor name, and the time/livestock tags supply runtime values.
Technical arguments are protected. The detector's truncated DAIRY suggestion is
covered by registering the complete DAIRY_EGG token.

Quest descriptions also protect QPlace and GMname references. Translation runs
before quest-specific location expansion, preventing translated map names from
breaking the description's lookup. Single-character FishingArea names are
allowed as known display fragments. Newline normalization preserves longer
control words such as the GetItem addon's `\name` token.

Torigoya notifications translate whole messages before line splitting. The
GetItem addon's name/count/gold templates are included in Mass Translation and
translated before substitution; formatted item names and quantities do not
create separate keys. Forestia translates nested formatter arguments and marks
the resulting display text as handled, including notifications sent through
private producer functions. Notification source objects and addon settings are
preserved, and animation properties continue to follow the original item.

Rerun Mass Translation for Forestia and Torigoya NotifyMessage after updating:
quest descriptions with location macros now use canonical COT placeholders, and
GetItem templates are new scan entries. Existing observed cache rows are retained.

The existing TRP Skit translator now detects enabled plugins in subdirectories
and registers SP, SE, SM and SA (or runtime-configured names) for pose, expression,
motion and animation commands. Technical parameters are masked. Both TAG and
legacy transport formats pass roundtrip tests.

## Graphic text and QA

The menu's top title, including the screenshot's event-list heading, is an atlas
sprite (Menu.changeHeader calls _headerText.setAtlas). It remains with the
existing image translation subsystem. Event-list tabs, character/place/reward
labels, event names and descriptions are programmatic text and are covered.
No graphical overlay or asset-name translation is added here.

After restarting, translate the new Forestia category and check events, resident
profiles, item details, work levels, calendar, livestock, requests, tips and
dialogs. Missing controls may require retrying previously invalid translations
after the new automatic tag definitions have loaded. The text catalog, source
name/formatter matching and tag roundtrips were checked with actual game data and
isolated runtime tests; this is not a full live-game QA pass.

Trello cards: https://trello.com/c/ssiJDie5 and https://trello.com/c/hbEmPNVr.
The unrelated image-painting card https://trello.com/c/F7ItDuOu is outside this fix.
