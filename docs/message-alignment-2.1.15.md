# Message alignment followed by actor names

RJ01236860 uses MessageAlignCenter. RPG Maker expands actor-name controls before
parsing formatting controls. Translating `\ac\N[1]` with a Latin actor name can
produce `ESC ACHibito`: the native parser consumes the alignment code and name as
one unknown code. Both the name and centering disappear.

The translator now gives bare horizontal alignment controls an explicit zero
shift (`\AC[0]`, `\AR[0]`) before name/variable expansion. Explicit shifts and
vertical controls are preserved. Configured horizontal control names are honored.
Neither source text nor cached translations need rewriting.

Five regression tests pass. An isolated probe using the installed game's native
escape converter and MessageAlignCenter code reproduced `ACHibito` before the
fix; afterward it parsed `AC`, retained `Hibito`, and centered the text at x=140
in the probe's 800-pixel window with fixed-width test metrics. This is not a live
gameplay rendering check. The game installation was read only.
