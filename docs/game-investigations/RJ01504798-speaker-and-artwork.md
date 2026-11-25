# RJ01504798 SNS speaker names and menu artwork

## Speaker display

The event command 101 speaker field contains 店員. The installed actor_name cache contains Clerk. MessageWindowOffset replaces Window_NameBox.refresh and performs custom measurement through a temporary Window_Base before drawing the name. A dedicated translator resolves existing speaker/actor_name entries for the duration of that refresh. It restores the original _name in finally, leaves game message/event data unchanged, respects disabled translation and never harvests already translated display strings.

A temporary probe executed the original game refresh method and verified both the Clerk output and its measured width. Permanent tests cover repeated redraws, canonical cache identity, disabled translation and exception cleanup. This is isolated rendering validation, not a live-game launch.

## Confirmed baked artwork

Original encrypted PNGs were decoded into temporary repository files for visual inspection. No game assets were edited and no overlays were added. Exact original paths:

- `D:\!NEWORDER\GAMES\RJ01504798\SNS\img\pictures\system\button_round1.png_`
- `D:\!NEWORDER\GAMES\RJ01504798\SNS\img\pictures\system\button_round_hover1.png_`
- `D:\!NEWORDER\GAMES\RJ01504798\SNS\img\pictures\system\button_round2.png_`
- `D:\!NEWORDER\GAMES\RJ01504798\SNS\img\pictures\system\button_round_hover2.png_`
- `D:\!NEWORDER\GAMES\RJ01504798\SNS\img\pictures\system\button_round3.png_`
- `D:\!NEWORDER\GAMES\RJ01504798\SNS\img\pictures\system\button_round_hover3.png_`
- `D:\!NEWORDER\GAMES\RJ01504798\SNS\img\pictures\system\button_round4.png_`
- `D:\!NEWORDER\GAMES\RJ01504798\SNS\img\pictures\system\button_round_hover4.png_`
- `D:\!NEWORDER\GAMES\RJ01504798\SNS\img\pictures\system\button_round1sys.png_`
- `D:\!NEWORDER\GAMES\RJ01504798\SNS\img\pictures\system\button_round_hoversys.png_`
- `D:\!NEWORDER\GAMES\RJ01504798\SNS\img\pictures\system\buck01.png_`
- `D:\!NEWORDER\GAMES\RJ01504798\SNS\img\pictures\state\vg0.png_`
- `D:\!NEWORDER\GAMES\RJ01504798\SNS\img\pictures\state\vg1.png_`

Button pairs respectively contain dress-up, save, load, title and options. buck01 contains the stat headings and units (first experience, climax count, lewdness, followers, tips); vg0/vg1 provide the first-experience status. Numeric values are drawn separately. These labels require the graphic translation workflow.

No deployment, original game source edit, save edit or cache repair was performed.

## Follow-up: late refresh replacement (2.1.69)

The user's live-game report shows the refresh-only fix was insufficient. The original main.js queues the cheat bootstrap before PluginManager.setup loads game plugins. MessageWindowOffset assigns a new Window_NameBox.refresh rather than wrapping its previous implementation, so a hook installed earlier can be discarded. The original isolated probe loaded the game plugin before installing the translator and did not cover this order.

The translator now also protects the native name-box start and inherited drawTextEx methods, which MessageWindowOffset does not replace. start supplies the translated name for both custom measurement and drawing; drawTextEx protects direct refresh calls after replacement. Temporary name changes are restored, and translated output is never harvested. A regression initializes the translator first, replaces refresh afterward, then verifies Clerk measurement and rendering. Live-game confirmation remains pending; no deployment was performed.
