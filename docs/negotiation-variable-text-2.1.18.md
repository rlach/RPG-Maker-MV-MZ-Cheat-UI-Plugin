# Negotiation text stored in variables

RJ01751397's negotiation system stores the customer's reaction in variable 86
and the first two topic labels in variables 89 and 91. Common events 77 and 79
assign these strings with Control Variables expressions; messages and choices
later expand V controls. Translating the surrounding message did not translate
the dynamic string values.

EventUiText now detects ResidentWindow games as well as its previous UI plugins.
It follows variable references in message lines, scrolling lines, and choices
back to assignments, reusing its existing static expression catalog and alias
tracking. MT can translate these entries under `plugin_event_ui_text`.

At display time, message and choice windows translate cataloged string values
before escape expansion. Numeric values and original game variables remain
unchanged. Unrelated windows and translation-disabled behavior remain native.
The reported labels are text, not raster graphics.

Regression coverage checks harvesting, both topic labels, reaction text, numeric
time values, unchanged source values, unrelated windows, and disabled translation.
After deployment, run MT for Event UI text. Game files are not updated by this change;
live negotiation rendering remains to be checked after deployment.
