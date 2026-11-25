# RPG Maker MV/MZ Cheat UI & Plugin Translation Rules

Always read and follow `.github/copilot-instructions.md` and `.github/prompts/plugin-translation.prompt.md` when working on plugin translators or translation runtime features.

## Core Workflow & Constraints

1. **Images / Graphics Are Out of Scope**:
   - Before writing a translator for untranslated UI elements, verify whether the text is rendered dynamically or baked into an image (`img/pictures/`, `img/system/`, `img/titles1/`, etc.).
   - If it is an image, do **not** translate it or create text overlays. Inform the user that it is a graphic for the graphic designer and list the exact image file paths.

2. **Generic vs. Game-Specific Plugin Translators**:
   - **Generic Plugin**: Create or update a dedicated translator per plugin (`cheat-engine/www/cheat/translate-engines/plugins/translators/`) so any future game using that plugin works automatically.
   - **Game-Specific Plugin Suite**: If plugins are written by the game's author specifically for that game (e.g., hardcoded game data, game-specific comments, or a tightly coupled author plugin family), a single cohesive translator covering the game's custom plugin suite is permitted (using `getPluginAliases()`).
   - **Completeness**: Always cover the entire plugin (all windows, commands, parameters, custom escape tags, and runtime hooks), not just the single screen reported in a screenshot.
   - **Activation**: A plugin translator must only activate in games where the target plugin (or one of its aliases) is present and enabled (`status: true`).

3. **Safe Variable Translation (`variable-translation-settings.json`)**:
   - If untranslated text comes from RPG Maker variables (`\V[n]` or `$gameVariables.value(n)`) and those variables are used strictly for display (never compared as strings in conditional branches `code 111` or script logic), enable their IDs in `safeVariableIds` inside the target game's `translate-cache/variable-translation-settings.json` (under `www/cheat-settings/translate-cache/` or `cheat-settings/translate-cache/`) and inform the user to run Variable translation in Mass Translation.

4. **Source Identity & Game Logic Safety**:
   - Prevent feedback loops: never allow already-translated display strings to be harvested or collected as new source keys during Mass Translation or runtime redraws.
   - Preserve original identifiers, symbols, and save data: translate at the presentation boundary (or restore mutated fields in a `finally` block) so game logic and save files always receive original values.

5. **Never Edit Game Code & Never Deploy**:
   - Never edit the target game's source files (`data/*.json`, `js/plugins/*.js`, `js/plugins.js`). All code changes belong in this repository (except configuring `variable-translation-settings.json` in the target game's `translate-cache`).
   - Do **not** run `npm run deploy` or copy Cheat Engine files into the target game directory.

6. **Version Bump & Quality Checks**:
   - Increment `package.json` version by `0.0.1` once per user request (even when multiple files or translators are modified).
   - Always run and pass before finishing:
     - `npm test` (including new unit tests for the translator)
     - `npm run check:translators`
     - `npm run format`
     - `npm run lint`
     - `npm run check:duplicates`
