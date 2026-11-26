# RJ01502572: automatic line geometry

## Source findings

The enabled DarkPlasma_AutoLineBreak v1.4.1 overrides Window_Base.lineWidth to return contentsWidth minus lineWidthMargin (4 pixels in this game). Its break predicate compares accumulated glyph width plus the current text X to that boundary. The previous calculator used the full contents width minus newLineX and missed this additional margin. No global subtraction or arbitrary one-character correction was introduced.

MessagePlus v3.4.0 enables its separate face window in this game. Its native newLineX returns 4 for the main message text even when a face is shown separately. The MessagePlus provider exposes that indentation for both portrait modes, replacing the standard portrait-inset estimate.

## Extension API

`cheat-engine/www/cheat/js/translation-runtime/TextLayoutProviders.js` exports registerTextLayoutProvider(pluginName, callback). Translator activation must first verify the enabled target plugin and required native methods through the standard lifecycle.

Callbacks receive `{ window, type, root, geometry }` and return null or a partial geometry patch. Supported fields are width, inset, font and maxRows. Final usable width is width minus inset. Message width is the local right boundary; description geometry starts with the standard help usable width and inset zero. A description provider using a native right boundary must subtract the help draw origin, as the DarkPlasma provider does.

A font provider can return `{ font: { ...geometry.font, measureGlyph, resizeFont, baseFontSize } }`. Glyph measurement receives the character and font size; resizeFont receives the current size and direction (+1/-1). Existing font/icon fields should be retained. Provider output is validated; invalid output is logged and skipped, retaining default geometry.

Providers are stored on the game root window and composed on every lookup after cached standard geometry is obtained. They must not mutate game windows, source data or message state. Registration/removal emits TEXT_LAYOUT_CHANGED_EVENT to update overlay and separate-window panels. Games without providers retain their existing geometry. Manual layout selection remains authoritative outside preview mode.

## Quick Start

The Pixels / Digits at base size columns were replaced by −1, Base, +1 and +2 digit capacities. Base header and values are bold. Each capacity uses the native font size step and actual measured digit advance, including translator-supplied font metrics. Values describe digit capacity; proportional prose still wraps by individual glyph advances.

## Validation

1,207 tests across 234 files pass. New tests cover the threshold difference (52 to 51), unchanged defaults, native nonstandard font steps, separate portraits, help draw origins, manual settings, cross-window notification/state and invalid-provider fallback. Existing MV/MZ geometry tests remain green. Registry: 328 translators; format and lint pass. Duplicate checking retains the existing 910-clone failure.

Original plugin sources and parameters were inspected read-only. No game-source edits or deployment occurred. The exact installed game's final width-preview screenshot has not been re-tested live.
