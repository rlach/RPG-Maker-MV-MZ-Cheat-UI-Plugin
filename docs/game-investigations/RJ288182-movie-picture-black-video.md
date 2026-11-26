# RJ288182: black MoviePicture playback

## Confirmed cause and scope

The installed game uses Triacontane MoviePicture 1.7.1 (2019-08-26), RPG Maker MV and NW.js 0.49.2 / Chromium 86.0.4240.111. Its video files are present: the 98 inspected containers identify VP8 video. This is not evidence of missing codec support.

An isolated diagnostic app used a copy of the installed NW.js runtime, original game core/PIXI libraries and original MoviePicture source. It did not load Cheat Engine or boot the actual game. The app writes numeric diagnostics only and exits automatically. No game assets, plugins, package files or saves were modified.

## Native runtime results

1. HTML video decoding of `01marie-A01.WebM`: readyState 4, paused false, dimensions 960 x 768, currentTime about 1.85 s. All 19,200 sampled 2D-canvas pixels were nonblack.
2. Direct bitmap rendering after media readiness also works through both MoviePicture bitmap classes. This rules out a blanket VP8 decode failure.
3. Full Game_Screen -> Sprite_Picture -> Spriteset_Base video-start sequence, using the plugin's default video-texture class: loaded, paused false, currentTime about 3.60 s, but **zero nonblack output pixels**. Chromium reports `GL_INVALID_OPERATION: Texture level does not exist.` This is a renderer warning, not a JavaScript exception or media-load error.
4. The same full sequence, video and runtime, with MoviePicture's existing alpha/canvas class selected: loaded, paused false, currentTime about 3.59 s and **737,256 nonblack output pixels** (out of 737,280). The image renders correctly.

The results confirm a compatibility failure in the legacy MoviePicture video-texture lifecycle/rendering path, reproduced without Cheat Engine. They do not isolate the exact failing PIXI texture operation. A compatible workaround is to select its existing Bitmap_DrawVideo canvas path through a narrowly activated compatibility hook. This would avoid changing media files, filenames or game sources. The production compatibility hook was subsequently implemented in version 2.2.5 (see below).

## Additional observations

The video loader requests `.webm` while most original filenames use `.WebM`. The full-sequence test loaded the uppercase-named file successfully through a lowercase URL, so case alone does not explain the reproduced failure.

MPI_PictureOnWindow moves picture 55 above windows, but inspected actual movie show commands target picture IDs 1, 2 and 10. That specific relocation does not explain these movie commands.

Four source references include a leading `!` without a same-named file (`!01marie-A03`, `!01marie-C01`, `!01marie-C02`, `!01marie-C03`). These need separate event-route investigation before treating them as live missing-resource bugs. They are not the cause of the reproduced failure for the existing `01marie-A01` file.

## Evidence

Temporary diagnostic harness/results are under `tmp/rj288182-video-probe/`: `result.json`, `render-result.json`, `sequence-result.json`, `canvas-sequence-result.json`, and corresponding stderr logs. The latest harness exercises the canvas full sequence. The temporary runtime copy is for diagnosis only; no runtime or Cheat Engine deployment was performed.

## Implemented compatibility module (2.2.5)

`MoviePictureTranslator` activates through the standard enabled-plugin detection and root-window hook guard. It waits for ImageManager.loadVideo/getVideoClass and wraps only the native video-class selector. The original selector receives its canvas/alpha argument as true; all other arguments and the native receiver are preserved. Picture alpha flags, playback controls, URLs, movie assets and save data remain unchanged. No text is collected and no LLM requests are made. The compatibility fix is independent of text-translation enablement.

The production helper was copied unchanged into the isolated NW.js diagnostic app and imported as a local module. A normal non-alpha movie (`originalAlpha: false`) then selected `Bitmap_DrawVideo` and produced 737,256 nonblack pixels, with currentTime 3.60 s and paused false. This confirms the shipped factory hook repairs the reproduced native picture-rendering failure. It is not a full in-game scene/playthrough validation.

Validation: 1,202 tests across 233 files passed; registry check reports 326 translators, format and lint pass. Duplicate checking still reports the existing 910 clones. No deployment or game-source edits were performed.
