# Lithtale status and dungeon display text

RJ01304151 copies map display names into variables 41 and 703, and a selected
skill description into variable 202. Status uses modern DTextPicture; the dungeon
name uses LL_InfoPopupWIndow. Translating the surrounding labels did not translate
these dynamically inserted strings.

Event UI text now resolves map names and skill descriptions from existing
map_name and skill_description keys. Modern text pictures translate referenced
string values at getDText(), before drawing and measurement, preserving native
escape conversion and the raw picture/variable state. The LL private popup
window is also a supported display conversion boundary.

No map-name copies are added to plugin caches, and there is no new translation
phase to run when the existing map and skill keys already have translations.
The regression covers status location, multiline skill description, dungeon
location, disabled translation, and unchanged variables. Live rendering remains
to be verified after deployment. Game files and images were not modified.
