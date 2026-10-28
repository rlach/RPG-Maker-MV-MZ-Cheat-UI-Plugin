# MPP ChoiceEX help on selection

Verified source: MPP_ChoiceEX 4.3.5 (MV/MZ), bundled with RJ01438753 DLC
v1.13.2 under the RJ01612098 game directory. The reported texts are reusable
plugin help messages, not pictures or standard Show Text events.

Common event 86 stores the advance-time explanation as comment command 108
`選択肢ヘルプ` followed by three continuation comments (408). Common event 67
uses the same format for patrol investment, including variable and currency
escapes. The existing scanner already collects these multiline blocks into
`plugin_mpp_choice_ex`; both reported source blocks already had translations
in the inspected cache.

MPP's `Window_ChoiceList.updateHelp` copies the selected help into the message
buffer and invokes `Window_Message.startMessage` directly. Resolve the selected
source at this presentation boundary instead of permanently translating the
entire help table in `Game_Interpreter.setupChoices`. This supports cache updates
after choices open and only marks actually selected help entries as seen.

The integration waits for MPP's setChoiceHelpTexts API before installing, so
finding the core Game_Interpreter class alone cannot finalize the hook early.
The source table and public getter are temporarily replaced only during the
native updateHelp call and restored in finally. Variable escapes are left for
the native message renderer; choice result indexes and source event commands
are unchanged. Both public helpTexts and older private \_helpTexts builds are
supported, and disabling translation restores original display behavior.

Tests cover hover-time cache updates, repeated selections, variable escapes,
source-key seen tracking, private tables, missing help, translation disabled,
exception cleanup and scanner/runtime block parity. Existing cache translations
can be used after restarting the game; a new mass-translation run is unnecessary
for already translated blocks. No game files or cache entries were modified.
A live NW.js playthrough has not been performed.
