# Message and transport compatibility in 2.1.11

- Native `<tag: value>` metadata is not a transport token. Postprocessing decodes
  newline tokens and accepts this game markup while continuing to reject actual
  broken `TAG:` fragments, including fragments nested inside native tags.
  The reported LLM response independently changes `buji,lianjin` to
  `Broken,Gold Inlay`; postprocessing does not invent or correct those values.
- YEP_MessageCore temporarily disables wrapping during `textWidthExCheck` and
  sets `_checkWordWrapMode`. The translator must not re-inject `<WordWrap>` in
  that mode: doing so makes word measurement recurse through `drawTextEx`.
- ExternMessage keeps an identity marker for its `command101` handler. When a
  cheat wrapper delegates transparently to exactly that handler, the marker is
  advanced to the wrapper. An already mismatched marker is left untouched, so
  genuine unrelated plugin replacements still trigger the native warning.

The two RJ01724822 screenshot captions are raster text, verified against decoded
copies of the original encrypted assets:

- `img/pictures/ero_status_page_2_layer5.png_`: the four relationship labels.
- `img/pictures/0_menu_tachie_A.png_`: the character heading and parenthesized name.

No game assets are changed or translated. Installation directories are read only
during investigation; deployment remains the user's script's responsibility.
