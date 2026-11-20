# UI and tag diagnostics — 2.1.13

RJ01236860 uses text for the reported menu descriptions, equipment statistics,
equipment/skill headers, and keyboard/gamepad configuration labels. These are
not raster replacements. Support now includes legacy LL menu help parameters,
AbilitySystem's HelpWindowName, MOT sorting headers, MNKR extra equipment
parameters, and earlier MZ Mano input parameter layouts. Header measurements use
translated text. Private input windows translate both ordinary and formatted
drawing and refresh after hooks are installed.

The reported Bornica response drops one newline token and one full-width indent
token. Rejecting it is correct; a regression reproduces the mismatch and verifies
that an unchanged encoded response round-trips. The test uses the transport ID
assigned by its local tag configuration rather than the user's custom ID.

RJ01751397's three bare N detections originate in malformed source tags, including
missing or incorrect closing delimiters. Unknown-tag scans now retain source
keys for examples, and example matching accepts incomplete parameters while
excluding complete registered syntax. Actual newlines remain distinct from N
escape codes.

Name repair previews can cycle to another affected cache entry without rebuilding
or changing the repair plan. Highlighted edits are retained per entry.

Validation covers catalogs, initial help rendering, header measurement, example
selection, and tag diagnostics. Game installations and raster assets are unchanged.
Live game rendering still requires verification after deployment through the
user's script and translation of the newly harvested plugin entries.
