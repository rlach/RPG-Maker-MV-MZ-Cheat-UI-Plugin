# HA adventure interface support (2.1.32)

Game: RJ01754039, HA_AdvHome family.

The game uses a shared custom interface family rather than stock RPG Maker windows. The reported ending list, phone launcher, home HUD/menu and mind-tree labels/descriptions are rendered text. Rendering combines Window_Base, Bitmap.drawText and direct canvas calls.

The new HaAdventureUiTranslator discovers enabled HA UI plugins and reads their source catalogs without executing or rewriting scripts. It harvests nested display parameters, fixed labels, narratives, choices, relationship-dependent name variants and dynamic templates. It also uses the existing event-script scanner for event-defined text. Asset references, routing IDs and native source tables remain unchanged.

Covered sources: HA_AdvHome, HA_Story, HA_WindowStyle, HA_MindTreeData, HA_MindTree, HA_Tutorial, HA_Message, HA_Help, HA_Memo, HA_Album, HA_Title, HA_SaveLoad, HA_Options, HA_Backlog, HA_QuickMenu, HA_Endings and HA_Notice.

Runtime coverage:

- Window and bitmap drawing, command labels and standard message rendering use the source-catalog adapter.
- Direct canvas fillText, strokeText and measureText localize catalog text for drawing and measurement.
- The custom phone wrap method resolves complete messages before calculating bubble dimensions. Stored phone logs remain original.
- The private Window_MindText instance resolves full descriptions before native pagination, including the first-visit text during scene creation.
- Numeric values and game-state logic remain native. No raster-image translation is performed.

Validation: a read-only probe against all 18 installed UI sources found 1080 catalog entries and 47 dynamic templates. Assertions confirm the reported ending hint, phone commands, mind-tree narrative and HUD labels are present. The complete suite passes 1050 tests; ESLint, translator registration (300 classes) and diff whitespace checks pass. Regression tests cover nested parameters, asset/logic exclusions, dynamic templates, name variants, canvas measurement, phone wrapping, mind-tree pagination, preserved logs and translation-off behavior.

Live game screen validation remains outstanding. No game installation, saves or user cache files were modified. Run the usual installation script and Mass Translate to populate the new plugin_ha_adventure_ui cache.
