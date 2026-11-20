# Alicia encyclopedia, status, and event choices

RJ01605784 uses standard MV ItemBook. Price, Equip, Type, and Unknown Data
parameters are now collected by the new ItemBook translator; filenames and
logic parameters are excluded.

Special status is a SceneCustomMenu display. Common event 101 assigns dynamic
status phrases through script calls to `$gameVariables.setValue`, including
temporary variable 121 and composed display values. Collection now reads these
literal-ID assignment expressions as syntax and follows existing display-variable
dependencies. It never evaluates scripts or writes variables.

The reported options are Show Choices entries containing V controls, with labels
assigned through Control Variables (for example variable 179 in common event
196). Event UI text now activates alongside SceneCustomMenu and collects those
labels through its existing display-variable path.

After deployment, translate ItemBook, SceneCustomMenu, and Event UI text in MT.
Regression tests cover dynamic status phrases, indirect dependencies, variable
options, unrelated-value exclusion, and encyclopedia fields. Live screens still
require verification after deployment. No game files or image assets were changed.
