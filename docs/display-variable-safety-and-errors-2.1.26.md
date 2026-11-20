# Display-only variable translation and persistent errors

Safe-variable translation previously replaced the return value of every
Game_Variables.value read. RJ01754981 uses Japanese time, weekday, and outfit
strings as logic tokens, so translated reads broke conditions and image selection.

Marked variables now return translations only inside synchronous text-expansion
contexts: Window_Base escape conversion, modern DTextPicture updateDText, and
ExtraWindow drawAllText. ExtraWindow and DTextPicture adapters also establish the
context at their own rendering boundaries to support hook ordering. Native event,
script, and image-selection reads keep their original values. Context depth is
restored in finally blocks; variable storage, flags and cache entries are unchanged.
The variable tooltip now says “Translate this variable in text displays”.

Error alerts are persistent, including when callers supply a finite timeout.
Batch summaries with failed items/current/cumulative errors now use the error
alert route; successful summaries retain their timed behavior. The existing FIFO
snackbar queue waits behind the error until explicit dismissal.

Regressions check time/day conditions, outfit image lookup, ordinary text,
ExtraWindow/DText-style expansion, numeric preservation, exception cleanup, and
queued notification timing with fake timers. The full suite passed 1036 tests.
No game files or caches were changed. Actual classroom, outfit, time display and
overlay rendering still need verification after deployment through the user's script.
