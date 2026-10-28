# Name pattern cache repair and MOG event labels

## Names Manager

Repair names in cache, beside Only actors with original names, uses the selected
or hand-entered name regex. Capture group 1 is replaced only when it has a known
official name translation. The dictionary is shared with AIEngine's official
name enforcement: active-pair profiles take precedence over actor_name cache.

The operation examines translated values in the active language pair; source
keys are never rewritten. Regex match indices locate the exact capture even
when identical text appears outside the group. Multiple matches are handled,
unknown names and no-op replacements are ignored, and surrounding text and
escape commands stay unchanged. The preview count is the number of cache
entries changed, not the number of occurrences. Its example always comes from
the actual change plan and shows different before/after text.

Preview and cancellation perform no writes. Apply persists the reviewed changes
as one batch and notifies cache subscribers. Entries edited while the dialog
was open are skipped, and a changed language pair requires a new preview.
Examples render as escaped text, not HTML. The dialog also opens for zero changes
and invalid patterns, displaying the outcome directly instead of depending on an
optional window.Alert global. Preview failures are logged for diagnostics.
When older NW.js lacks regex capture indices, a zero-width suffix capture locates
group 1 while preserving later numeric and named backreferences.

## MOG_EventIndicators

Verified against MOG_EventIndicators 1.0 (MZ), shipped with RJ01654194,
ミアと町と魔物 ver1.03. Labels are text, not images. The translator scans
event-page comments `text_indicator : text` and MZ Text_Indicator commands.
Image names and variable_indicator values are excluded.

Mass translation uses plugin_mog_event_indicators. A narrow refreshText hook
translates the label only while Bitmap.drawText runs, restoring the bitmap's
method in finally. Original indicator text, settings, variables and event data
remain unchanged. Seen tracking uses the source label. Static labels refresh
when their cached translation or translation enablement changes; variable-mode
indicators retain native behavior.

Tests cover actual-change previews, group boundaries, unknown/already translated
names, language separation, confirmation-only writes, concurrent edits, event
comment/command extraction, source-key seen tracking and label refresh behavior.
No source game files were modified; a live NW.js playthrough was not performed.
