# RJ01494403 MoviePicture initialization (2.2.11)

Read-only inspection of `D:\!NEWORDER\GAMES\RJ01494403\CKBplus\js\plugins\MoviePicture.js` identifies MoviePicture 2.3.1 for MZ. Its ImageManager.loadVideo constructs its private Bitmap_Video directly and exposes getVideoFilePath/getVideoFileExt. It has no getVideoClass factory.

Our compatibility translator previously required the MV 1.7.1 getVideoClass API on every engine. MZ therefore exhausted initialization retries even though its native video playback was working. MoviePictureTranslator now accepts the complete MZ 2.x native API without replacing any methods. The existing MV canvas-factory fix remains unchanged. Initialization still retries while required API methods are missing.

Regression tests cover the native MZ no-op, incomplete initialization, enabled-plugin detection and the existing MV repair. No source game files or movies were changed, and no deployment was performed. The reported working native playback was not independently tested in a running game.
