# RJ01608291 custom UI family

The reported screens use FriendshipSystem, FastTravel, SmartphoneUI,
ExtendedChoices, and MiniGame_Survey/Debug/DataEntry. These are custom scripts,
not raster text replacements. Mitsugase UI catalogs source display strings,
nested character parameters, travel names, phone contacts/posts/messages/replies,
and survey questions/options. Identifiers, destination coordinates, jump targets,
switches, rewards, and image names remain logic-owned.

Friendship names first reuse actor_name translations. Standard Window_Base and
Bitmap display hooks cover menu friendship lists, travel, jobs, and surveys.
SmartphoneUI draws directly on its own canvas; its context receives fillText and
measureText adapters before refresh. Other canvases are untouched. A syntax-only
reader supplements dT(context, text, ...) calls, including the Back button inside
the image viewer, while leaving picture loading unchanged.

An isolated scan of enabled plugin sources, parameters, common events, and maps
found 505 entries. It confirmed the four reported names, all four travel entries,
the three job labels, the reported questionnaire, phone message labels, and Back.
Tests cover catalogs, technical-field exclusions, actor cache reuse, phone text
and width, image-viewer buttons, and disabled translation.

After deployment through the user's script, run MT for
`Mitsugase menus, phone and minigames`. Existing actor-name translations are reused.
No game files or images were changed. Live verification is still needed for the
menu/friendship, travel, phone tabs/chats/image viewer, jobs, and survey screens.
