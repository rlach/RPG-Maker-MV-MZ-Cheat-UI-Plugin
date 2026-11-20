# Illy and Sophie UI sources

RJ278839 uses both event-authored text and text baked into encrypted pictures.
Raster captions are not translated. The previous picture-caption translator was
removed from the registry in 2.1.8 to follow the user preference to report image
text rather than replace it.

- Dynamic ranks, character-name captions, counts, money and measurements use
  DTextPicture commands. Event UI translation must ignore numeric sources,
  including stale cached numeric translations and single rendered digit glyphs.
- Main menu icon labels and the shutdown button are picture assets.
- Main menu statistics headings are baked into `HHUB2`.
- Special-statistics captions are baked into `Hstats_window`.
- Remove-party-member buttons are `UI_IllOut` and `UI_SopOut` pictures.
- `Week_Sun`, `Week_Moon` and `Week_Star` contain day names and icons.
  These are weekday indicators, rather than dynamic time-of-day text.

MOG_MapNameHud variants expose either `mapName()` or `name()`. Both are supported
at the presentation boundary without changing map identities.
